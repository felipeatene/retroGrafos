
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import test from "node:test";
import {origemHttps, sugerir, validarLista} from "../regras.mjs";

const origem = "https://dev217534.service-now.com";
const fixture = nome => readFileSync(new URL("../" + nome, import.meta.url), "utf8").replace(/^\uFEFF/, "");
const exemplo = JSON.parse(fixture("lista-demo.json"));

test("sugere tags em incidentes, problemas e mudanças e mantém os motivos", () => {
  const regras = validarLista(exemplo);
  for (const tipo of ["incident", "problem", "change_request"]) {
    const resultado = sugerir({tipo, campos: {
      short_description: "CONCILIACAO de notas", description: "Erro no Financeiro",
    }}, [...regras, regras[0]]);
    assert.deepEqual(resultado, [{tag: "atraso_notas", motivos: [
      {campo: "short_description", termo: "conciliação"},
      {campo: "description", termo: "financeiro"},
    ]}]);
  }
});

test("ignora campos ausentes, palavras parciais, regras inativas e tipos diferentes", () => {
  const campos = {description: "O fluxo microfinanceiro continua."};
  const regra = validarLista(exemplo)[0];
  assert.deepEqual(sugerir({tipo: "incident", campos}, [regra]), []);
  assert.deepEqual(sugerir({tipo: "incident", campos: {description: "Financeiro"}}, [
    {...regra, Ativa: false}, {...regra, TiposTarefa: ["problem"]},
  ]), []);
});

test("valida a lista inteira e identifica linhas com erro", () => {
  assert.throws(() => validarLista({value: [exemplo.value[0], {fields: {Title: "Tag inválida"}}, null]}),
    /Regra 2:.*\nRegra 3:/);
  assert.throws(() => origemHttps(origem + "/incident.do"), /origem HTTPS/);
  assert.equal(origemHttps(origem + "/"), origem);
});

function formulario({tipo = "incident", emQuadro = false, indisponivel = false} = {}) {
  const sysId = "a".repeat(32);
  const url = origem + "/" + tipo + ".do?sys_id=" + sysId;
  const tags = new Set();
  const enviados = [];
  let menu = false;
  let entrada = null;
  let tempo = 0;
  const doc = {
    URL: url,
    getElementById(id) {
      if (id === (tipo === "problem" ? "sys_readonly." : "") + tipo + ".number") {
        return {value: "DEMO-001"};
      }
      if (id === tipo + ".description") return {value: "Conciliação"};
      if (id === "toggleMoreOptions") return {click: () => { menu = true; }};
      if (id === "tags_menu" && !indisponivel) return {
        getClientRects: () => menu ? [1] : [],
        click: () => {
          entrada = {
            type: "text", value: "", isConnected: true, ownerDocument: doc,
            getClientRects: () => [1], focus() {},
            dispatchEvent(ev) {
              if (ev.type === "keypress") {
                enviados.push(this.value);
                if (this.value !== "erro") {
                  tags.add(this.value);
                  this.isConnected = false;
                  entrada = null;
                }
              }
              return true;
            },
          };
        },
      };
    },
    querySelector(seletor) { return seletor.startsWith("#document_tags") && menu ? {} : null; },
    querySelectorAll(seletor) {
      if (seletor.includes(" input")) return entrada ? [entrada] : [];
      if (seletor.includes("aria-label")) {
        return Array.from(tags, tag => ({getAttribute: () => "Remove tag: " + tag}));
      }
      return [];
    },
    defaultView: {
      Event: class { constructor(type) { this.type = type; } },
      KeyboardEvent: class { constructor(type) { this.type = type; } },
    },
  };
  const top = emQuadro ? {URL: origem + "/now/nav/ui/classic", querySelector: () => ({contentDocument: doc})} : doc;
  const contexto = {
    URL, document: top, location: {origin: origem},
    Date: {now: () => tempo},
    setTimeout(fn, ms) { tempo += ms; fn(); },
  };
  runInNewContext(fixture("formulario.js"), contexto);
  return {api: contexto.retroGrafosFormulario, doc, enviados};
}

test("lê formulário clássico direto e no quadro e recusa troca de registro", async () => {
  for (const tipo of ["incident", "problem", "change_request"]) {
    const {api, doc, enviados} = formulario({tipo, emQuadro: tipo !== "incident"});
    const alvo = api.analisar(origem, ["description", "close_notes"]);
    assert.equal(alvo.tipo, tipo);
    assert.equal(alvo.campos.description, "Conciliação");
    assert.equal(alvo.campos.close_notes, undefined);
    doc.URL = doc.URL.replace("a".repeat(32), "b".repeat(32));
    await assert.rejects(api.aplicar(origem, alvo, ["teste"]), /registro aberto mudou/);
    assert.equal(enviados.length, 0);
  }
});

test("reporta falha parcial e pula etiquetas existentes na repetição", async () => {
  const {api, enviados} = formulario();
  const alvo = api.analisar(origem, []);
  const resultado = await api.aplicar(origem, alvo, ["primeira", "erro", "ultima"]);
  assert.equal(Array.from(resultado, r => r.estado).join(","), "adicionada,falhou,adicionada");
  const repeticao = await api.aplicar(origem, alvo, ["primeira", "ultima", "ultima"]);
  assert.equal(Array.from(repeticao, r => r.estado).join(","), "existente,existente");
  assert.deepEqual(enviados, ["primeira", "erro", "ultima"]);
});

test("explica quando o formulário não oferece Add Tag", async () => {
  const {api} = formulario({indisponivel: true});
  const alvo = api.analisar(origem, []);
  await assert.rejects(api.aplicar(origem, alvo, ["teste"]), /Add Tag está indisponível/);
});
