
import test from "node:test";
import assert from "node:assert/strict";
import {consultaURL, registroURL, processarRegistro, revisao, LIMITE, lotePermitido, MARCADOR} from "../lote.mjs";
import {lerPagina} from "../navegacao.mjs";

const origem = "https://dev217534.service-now.com";

test("preserva filtros relacionados, visualização e ordenação e reinicia na primeira página", () => {
  const query = "active=true^RLQUERYtask.parent,>=1^ENDRLQUERY^ORDERBYDESCnumber";
  const entrada = origem + "/now/nav/ui/classic/params/target/" +
    encodeURIComponent("change_request_list.do?sysparm_query=" + encodeURIComponent(query) + "&sysparm_view=teste&sysparm_first_row=61");
  const resultado = consultaURL(entrada, origem);
  assert.equal(resultado.query, query);
  assert.equal(resultado.semFiltro, false);
  const url = new URL(resultado.url);
  assert.equal(url.searchParams.get("sysparm_first_row"), "1");
  assert.equal(url.searchParams.get("sysparm_view"), "teste");
  assert.equal(consultaURL(origem + "/problem_list.do?sysparm_query=ORDERBYnumber", origem).semFiltro, true);
  assert.equal(consultaURL(origem + "/incident_list.do", origem).semFiltro, true);
  assert.throws(() => consultaURL("https://outra.service-now.com/incident_list.do", origem));
  assert.throws(() => registroURL(origem, "sys_user", "a".repeat(32)));
  assert.equal(LIMITE, 25);
  assert.equal(lotePermitido(25), true);
  assert.equal(lotePermitido(26), false);
  assert.equal(lotePermitido(0), false);
});

test("pagina pela ação nativa e ignora links externos e duplicados", () => {
  const tab = origem + "/incident_list.do?sysparm_query=active%3Dtrue";
  const a = origem + "/incident.do?sys_id=" + "a".repeat(32);
  const b = origem + "/incident.do?sys_id=" + "b".repeat(32);
  let pagina = 1;
  const proximo = {
    disabled: false, getAttribute: () => null, classList: {contains: () => false},
    getClientRects: () => [1], click() { pagina++; this.disabled = true; },
  };
  const link = href => ({href, textContent: "DEMO", closest: () => null});
  const grid = {querySelectorAll: () => pagina === 1
    ? [link(a), link(a), link(a.replace(origem, "https://outra.example"))] : [link(b)]};
  const anteriores = [globalThis.location, globalThis.document, globalThis.window];
  try {
    globalThis.location = new URL(tab);
    globalThis.window = {g_user: {userID: "c".repeat(32)}};
    globalThis.document = {
      title: "Incidents", body: {innerText: "Incidents"},
      querySelector: () => null, getElementById: () => grid, querySelectorAll: () => [proximo],
    };
    const primeira = lerPagina(origem, "incident", "proxima");
    const segunda = lerPagina(origem, "incident");
    assert.deepEqual(primeira.registros.map(r => r.sysId), ["a".repeat(32)]);
    assert.deepEqual(segunda.registros.map(r => r.sysId), ["b".repeat(32)]);
    assert.notEqual(primeira.pagina, segunda.pagina);
    assert.equal(segunda.proxima, false);
  } finally {
    [globalThis.location, globalThis.document, globalThis.window] = anteriores;
  }
});

function simular({iniciais = [], falhas = [], disponivel = true, expirar = false} = {}) {
  const tags = new Set(iniciais);
  const chamadas = [];
  return {tags, chamadas,
    async conferir(reabrir) {
      if (reabrir && expirar) throw new Error("Sessão expirada");
      return {tags: [...tags], disponivel};
    },
    async adicionar(tag) {
      chamadas.push(tag);
      if (falhas.includes(tag)) return {estado: "falhou", motivo: "Recusada"};
      tags.add(tag);
      return {estado: "adicionada"};
    },
    async retirar(tag) { tags.delete(tag); return {estado: "retirada"}; },
  };
}

test("falha parcial fica pendente e repetição pula o que já persistiu", async () => {
  const plano = {adicionar: ["a", "b"], retirar: []};
  const primeiro = simular({falhas: ["b"]});
  const pendente = await processarRegistro(primeiro, plano);
  assert.equal(pendente.status, "Pendente");
  assert.deepEqual(pendente.faltam, ["b"]);
  assert.deepEqual(pendente.proprias, ["a"]);
  assert(!primeiro.tags.has(MARCADOR));
  const segundo = simular({iniciais: [...primeiro.tags]});
  const validado = await processarRegistro(segundo, plano, pendente);
  assert.deepEqual(segundo.chamadas, ["b", MARCADOR]);
  assert.equal(validado.status, "Validado");
});

test("sessão expirada antes da confirmação interrompe a validação", async () => {
  const acesso = simular({expirar: true});
  await assert.rejects(processarRegistro(acesso, {adicionar: ["a"], retirar: []}), /Sessão expirada/);
  assert(!acesso.tags.has(MARCADOR));
});

test("conferência manual sem Add Tag mantém o marcador pendente", async () => {
  const acesso = simular({iniciais: ["a"], disponivel: false});
  const resultado = await processarRegistro(acesso, {adicionar: ["a"], retirar: []}, null, true);
  assert.equal(resultado.status, "Conferido · marcador pendente");
  assert.deepEqual(acesso.chamadas, []);
  assert.deepEqual(resultado.proprias, []);
});

test("revisão vencida só sugere retirar etiquetas próprias sem correspondência", () => {
  const anterior = {revisadoEm: 1, proprias: ["obsoleta", "atual", MARCADOR]};
  const sugestoes = [{tag: "atual"}];
  const atuais = ["obsoleta", "atual", "de_terceiro", MARCADOR];
  assert.deepEqual(revisao(anterior, sugestoes, atuais, 30, 1 + 29 * 86400000), {vencida: false, retirar: []});
  assert.deepEqual(revisao(anterior, sugestoes, atuais, 30, 1 + 30 * 86400000), {vencida: true, retirar: ["obsoleta"]});
});
