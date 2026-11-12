import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "extensao");
const manifesto = JSON.parse(readFileSync(join(origem, "manifest.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(manifesto.version)) throw new Error("A versão do manifesto precisa ser X.Y.Z.");

const destino = join(raiz, "dist", `lino-${manifesto.version}`);
rmSync(destino, { recursive: true, force: true });

function ignorar(relativo) {
  const partes = relativo.split("/");
  if (partes.includes("tests")) return true;
  if (relativo === "README.md") return true;
  if (relativo === "assets/mascote/demo.html") return true;
  if (relativo === "assets/mascote/build-demo.mjs") return true;
  if (relativo === "assets/mascote/RIG.md") return true;
  return false;
}

function copiar(dir, relativo = "") {
  for (const nome of readdirSync(dir)) {
    const abs = join(dir, nome);
    const prox = relativo ? `${relativo}/${nome}` : nome;
    if (ignorar(prox)) continue;
    if (statSync(abs).isDirectory()) copiar(abs, prox);
    else {
      const alvo = join(destino, prox);
      mkdirSync(dirname(alvo), { recursive: true });
      cpSync(abs, alvo);
    }
  }
}
copiar(origem);

function existe(relativo) {
  try { return statSync(join(destino, relativo)).isFile(); }
  catch { return false; }
}
function exigir(relativo, motivo) {
  if (!existe(relativo)) throw new Error(`${motivo} aponta para um arquivo ausente: ${relativo}`);
}

const permitidas = new Set(["activeTab", "scripting", "storage", "alarms"]);
for (const permissao of manifesto.permissions ?? []) {
  if (!permitidas.has(permissao)) throw new Error(`Permissão fora da lista revista: ${permissao}`);
}
if (JSON.stringify(manifesto.optional_host_permissions) !== JSON.stringify(["https://*.service-now.com/*"])) {
  throw new Error("A origem opcional precisa ser só https://*.service-now.com/*.");
}
if (manifesto.content_security_policy?.extension_pages !== "script-src 'self'; object-src 'self'") {
  throw new Error("A CSP das páginas da extensão não está explícita.");
}
for (const [tamanho, caminho] of Object.entries(manifesto.icons ?? {})) exigir(caminho, `ícone ${tamanho}`);
for (const caminho of Object.values(manifesto.action?.default_icon ?? {})) exigir(caminho, "ícone da ação");
exigir(manifesto.background.service_worker, "service worker");
exigir(manifesto.options_page, "página de opções");
for (const grupo of manifesto.web_accessible_resources ?? []) {
  for (const recurso of grupo.resources) exigir(recurso, "recurso acessível");
}

const textos = [];
function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    const abs = join(dir, nome);
    if (statSync(abs).isDirectory()) varrer(abs);
    else if (/\.(json|html|mjs|js|css)$/.test(nome)) textos.push([relative(destino, abs).replaceAll("\\", "/"), readFileSync(abs, "utf8")]);
  }
}
varrer(destino);
for (const [nome, texto] of textos) {
  if (/\beval\s*\(|\bnew Function\s*\(/.test(texto)) throw new Error(`Código dinâmico em ${nome}.`);
  if (nome.endsWith(".html")) {
    for (const achado of texto.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
      const ref = achado[1];
      if (/^(https?:|data:|#|mailto:)/.test(ref)) {
        if (ref.startsWith("http")) throw new Error(`Referência remota em ${nome}: ${ref}`);
        continue;
      }
      exigir(join(dirname(nome), ref).replaceAll("\\", "/"), nome);
    }
  }
}

function zip(pasta, arquivo) {
  const arquivos = [];
  (function andar(dir) {
    for (const nome of readdirSync(dir)) {
      const abs = join(dir, nome);
      if (statSync(abs).isDirectory()) andar(abs);
      else arquivos.push(abs);
    }
  })(pasta);
  const locais = [];
  const central = [];
  let offset = 0;
  for (const abs of arquivos) {
    const nome = Buffer.from(relative(pasta, abs).replaceAll("\\", "/"));
    const dados = readFileSync(abs);
    const comprimido = deflateRawSync(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(dados) >>> 0, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    const centro = Buffer.alloc(46);
    centro.writeUInt32LE(0x02014b50, 0);
    centro.writeUInt16LE(20, 4);
    centro.writeUInt16LE(20, 6);
    centro.writeUInt16LE(8, 10);
    centro.writeUInt32LE(crc32(dados) >>> 0, 16);
    centro.writeUInt32LE(comprimido.length, 20);
    centro.writeUInt32LE(dados.length, 24);
    centro.writeUInt16LE(nome.length, 28);
    centro.writeUInt32LE(offset, 42);
    locais.push(local, nome, comprimido);
    central.push(centro, nome);
    offset += local.length + nome.length + comprimido.length;
  }
  const diretorio = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(offset, 16);
  const saida = join(dirname(pasta), arquivo);
  writeFileSync(saida, Buffer.concat([...locais, diretorio, fim]));
  return saida;
}

const pacote = zip(destino, `lino-${manifesto.version}.zip`);
console.log(pacote);
