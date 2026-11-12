import {criarGrafoVivo} from "./grafo-vivo.mjs";
import {CAMADAS, CAMPOS_COR, TIPOS_LINO, projetar, rotuloCampo} from "./projecao.mjs";
import {registroURL} from "./lote.mjs";
import {FORCAS_PADRAO} from "./simulacao.mjs";

const el = id => document.getElementById(id);
const armazenamento = "lino:grafo:fisica";
const chave = "lino:grafico:" + location.hash.slice(1);
let grafico;
let proj = {nos: [], arestas: [], legenda: {tipo: "nenhuma", itens: []}};
let reproducao = 0;
let coube = false;

const vivo = criarGrafoVivo(el("grafo"), {
  aoSelecionar: mostrarNo,
  aoAbrir(no) {
    if (no.abrir === "incidente" && grafico) {
      const registro = grafico.dados.find(item => item.incidente.id === no.incidenteId)?.incidente;
      if (registro) chrome.tabs.create({url: registroURL(grafico.origem, registro.tabela || "incident", registro.id)});
    }
    mostrarNo(no);
  },
});

function opcao(valor, nome) {
  const item = document.createElement("option");
  item.value = valor;
  item.textContent = nome;
  return item;
}

function vertices() {
  return [...document.querySelectorAll("#vertices input:checked")].map(input => input.value);
}

function fisica() {
  return Object.fromEntries([...document.querySelectorAll("#fisica input")].map(input => [input.name, Number(input.value)]));
}

function aplicarFisica(valores, persistir) {
  for (const [nome, valor] of Object.entries(valores)) {
    const input = document.querySelector(`#fisica input[name="${nome}"]`);
    if (input) input.value = valor;
  }
  if (persistir) localStorage.setItem(armazenamento, JSON.stringify(fisica()));
  vivo.ajustarForcas(fisica());
}

function mapa() {
  const camadas = vertices();
  const pertence = document.querySelector('input[value="pertence"]');
  const temIncidente = camadas.includes("incidente");
  pertence.disabled = !temIncidente;
  el("arestas-nota").hidden = temIncidente;
  if (!temIncidente && pertence.checked) document.querySelector('input[value="juntos"]').checked = true;
  const ancora = el("ancora").value;
  if (ancora && !camadas.includes(ancora)) el("ancora").value = "";
  return {vertices: camadas, arestas: document.querySelector('input[name="arestas"]:checked').value,
    cor: el("cor").value, ancora: el("ancora").value || null, busca: el("busca").value, tipo: el("tipo").value, agora: Date.now()};
}

function formatar(valor) {
  if (!Number.isFinite(valor)) return "";
  if (el("cor").value === "calor:idade") return Math.round(valor / 86400000) + " d";
  return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 10) / 10);
}

function pintarLegenda(legenda) {
  const caixa = el("legenda");
  caixa.replaceChildren();
  if (legenda?.tipo === "calor" && legenda.min != null) {
    const barra = document.createElement("i");
    barra.className = "regua-calor";
    barra.style.setProperty("--de", legenda.de);
    barra.style.setProperty("--ate", legenda.ate);
    caixa.append(barra, document.createTextNode(formatar(legenda.min) + " → " + formatar(legenda.max)));
    return;
  }
  for (const item of legenda?.itens || []) {
    const marca = document.createElement("i");
    marca.style.background = item.cor;
    const nome = document.createElement("span");
    nome.textContent = item.rotulo;
    caixa.append(marca, nome);
  }
}

function marcos() {
  return [...new Set(proj.nos.map(no => no.aparecerEm).filter(tempo => tempo != null))].sort((a, b) => a - b);
}

function rotuloTempo(tempo) {
  if (tempo === 0 && proj.nos.some(no => no.semData)) return "Sem data de abertura";
  return new Intl.DateTimeFormat("pt-BR", {dateStyle: "short", timeStyle: "short", timeZone: "UTC"}).format(tempo);
}

function pausar() {
  clearInterval(reproducao);
  reproducao = 0;
  el("play").textContent = "Reproduzir";
  el("play").setAttribute("aria-pressed", "false");
}

function aplicarTempo(reposicionar) {
  if (!el("linha").checked) {
    vivo.revelarAte(null);
    el("data-corrente").textContent = "";
    return;
  }
  const tempos = marcos();
  el("regua").max = String(Math.max(0, tempos.length - 1));
  const indice = Math.min(Number(el("regua").value) || 0, Math.max(0, tempos.length - 1));
  el("regua").value = String(indice);
  const tempo = tempos[indice] ?? 0;
  vivo.revelarAte(tempo, {reposicionar});
  el("data-corrente").textContent = tempos.length ? rotuloTempo(tempo) : "Sem datas de abertura";
}

function mostrarNo(no) {
  if (!no || !grafico) return;
  vivo.destacar(no.id);
  el("detalhe").textContent = no.rotulo;
  const registros = new Map();
  for (const item of grafico.dados) {
    const serve = no.camada === "tag" ? item.tag.id === no.tagId
      : no.camada === "incidente" ? item.incidente.id === no.incidenteId
      : rotuloCampo(item.incidente, no.camada) === no.rotulo;
    if (serve) registros.set(item.incidente.id, item.incidente);
  }
  el("incidentes").replaceChildren(...[...registros.values()].map(registro => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.textContent = [registro.numero, registro.titulo].filter(Boolean).join(" · ") || "Abrir chamado";
    link.href = registroURL(grafico.origem, registro.tabela || "incident", registro.id);
    link.target = "_blank";
    link.rel = "noopener";
    li.append(link);
    return li;
  }));
}

function pintarLista() {
  const camadas = vertices();
  const camada = camadas.includes("tag") ? "tag" : (camadas.find(id => id !== "incidente") || camadas[0]);
  el("lista-titulo").textContent = CAMADAS.find(item => item.id === camada)?.nome || "Nós";
  const nos = proj.nos.filter(no => no.camada === camada).sort((a, b) => b.grau - a.grau || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  el("tags").replaceChildren(...nos.map(no => {
    const li = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.append(document.createTextNode(no.rotulo), Object.assign(document.createElement("small"), {textContent: String(no.grau)}));
    botao.addEventListener("click", () => mostrarNo(no));
    botao.addEventListener("focus", () => vivo.destacar(no.id));
    botao.addEventListener("blur", () => vivo.destacar(null));
    li.append(botao);
    return li;
  }));
}

function renderizar({enquadrar = false} = {}) {
  if (!grafico) return;
  proj = projetar(grafico.dados, mapa());
  const incidentes = new Set(proj.nos.filter(no => no.camada === "incidente").map(no => no.incidenteId));
  el("contagem").textContent = proj.nos.length + " nós · " + incidentes.size + " chamados" + (proj.aviso ? " · " + proj.aviso : "");
  el("estado").textContent = proj.nos.length ? "" : "Nenhum nó corresponde ao mapeamento.";
  pintarLegenda(proj.legenda);
  vivo.definir(proj);
  if ((enquadrar || !coube) && proj.nos.length) {
    coube = true;
    requestAnimationFrame(() => vivo.enquadrar());
  }
  aplicarTempo(false);
  pintarLista();
  el("detalhe").textContent = "Selecione um nó";
  el("incidentes").replaceChildren();
}

function expirar() {
  grafico = null;
  pausar();
  el("conteudo").hidden = true;
  el("contagem").textContent = "";
  el("estado").textContent = "Este gráfico expirou. Gere a análise novamente.";
  chrome.storage.session.remove(chave);
}

for (const camada of CAMADAS) {
  const label = document.createElement("label");
  label.className = "opcao";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = camada.id;
  input.checked = ["incidente", "tag", "grupo"].includes(camada.id);
  input.addEventListener("change", () => {
    if (!vertices().length) { input.checked = true; return; }
    if (el("ancora").value === camada.id && !input.checked) el("ancora").value = "";
    renderizar();
  });
  label.append(input, document.createTextNode(camada.nome));
  el("vertices").append(label);
}
for (const campo of CAMPOS_COR) el("cor").append(opcao(campo.id, campo.nome));
el("ancora").append(opcao("", "Nenhuma"));
for (const camada of CAMADAS) if (camada.id !== "incidente") el("ancora").append(opcao(camada.id, camada.nome));
el("ancora").value = "grupo";
for (const [tipo, nome] of Object.entries(TIPOS_LINO)) el("tipo").append(opcao(tipo, nome));
for (const [nome, rotulo, min, max, passo] of [
  ["repulsao", "Repulsão", 40, 900, 10],
  ["distancia", "Distância das arestas", 24, 180, 1],
  ["forcaAresta", "Força das arestas", 0.01, 0.35, 0.01],
  ["centro", "Força do centro", 0, 0.12, 0.002],
]) {
  const label = document.createElement("label");
  label.className = "campo";
  const input = document.createElement("input");
  input.type = "range";
  input.name = nome;
  input.min = min;
  input.max = max;
  input.step = passo;
  input.value = FORCAS_PADRAO[nome];
  input.addEventListener("input", () => aplicarFisica(fisica(), true));
  label.append(document.createTextNode(rotulo), input);
  el("fisica").insertBefore(label, el("restaurar"));
}
try { aplicarFisica({...FORCAS_PADRAO, ...JSON.parse(localStorage.getItem(armazenamento) || "{}")}, false); }
catch { aplicarFisica(FORCAS_PADRAO, false); }

for (const input of document.querySelectorAll('input[name="arestas"]')) input.addEventListener("change", () => renderizar());
el("cor").addEventListener("change", () => renderizar());
el("ancora").addEventListener("change", () => {
  const camada = el("ancora").value;
  const caixa = camada && document.querySelector(`#vertices input[value="${camada}"]`);
  if (caixa && !caixa.checked) caixa.checked = true;
  renderizar();
});
el("busca").addEventListener("input", () => renderizar());
el("tipo").addEventListener("change", () => renderizar());
el("restaurar").addEventListener("click", () => aplicarFisica(FORCAS_PADRAO, true));
el("enquadrar").addEventListener("click", () => vivo.enquadrar());
el("linha").addEventListener("change", () => {
  pausar();
  if (el("linha").checked) el("regua").value = "0";
  aplicarTempo(el("linha").checked);
});
el("regua").addEventListener("input", () => { pausar(); aplicarTempo(false); });
el("velocidade").addEventListener("input", () => { if (reproducao) { pausar(); el("play").click(); } });
el("play").addEventListener("click", () => {
  if (reproducao) { pausar(); return; }
  el("linha").checked = true;
  const tempos = marcos();
  if (!tempos.length) return;
  if (Number(el("regua").value) >= tempos.length - 1) {
    el("regua").value = "0";
    aplicarTempo(true);
  }
  el("play").textContent = "Pausar";
  el("play").setAttribute("aria-pressed", "true");
  reproducao = setInterval(() => {
    const proximo = Number(el("regua").value) + 1;
    if (proximo > Number(el("regua").max)) { pausar(); return; }
    el("regua").value = String(proximo);
    aplicarTempo(false);
  }, 1000 / Number(el("velocidade").value || 3));
});

try {
  grafico = (await chrome.storage.session.get(chave))[chave];
  if (!grafico || Date.now() - grafico.geradoEm >= 600000) expirar();
  else {
    el("conteudo").hidden = false;
    renderizar({enquadrar: true});
    setTimeout(expirar, Math.max(0, grafico.geradoEm + 600000 - Date.now()));
  }
} catch {
  el("estado").textContent = "Não consegui abrir o grafo. Gere a análise novamente.";
  el("contagem").textContent = "";
}
document.addEventListener("visibilitychange", () => { if (grafico && Date.now() - grafico.geradoEm >= 600000) expirar(); });
