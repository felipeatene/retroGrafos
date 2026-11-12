import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {coletar, preferencias} from "../lino-api.mjs";
import {agrupar} from "../projecao.mjs";
import {validarLista} from "../regras.mjs";

const fonte = nome => readFileSync(new URL("../../servicenow/" + nome + ".js", import.meta.url), "utf8");
const regras = validarLista(JSON.parse(readFileSync(new URL("../lista-demo.json", import.meta.url))));
const id = numero => numero.toString(16).padStart(32, "0");
const grupo = id(1);
const owner = id(2);
const analista = id(3);
const paciente = id(4);

function ambiente({configurado = true} = {}) {
  const dados = {label: new Map(), label_entry: new Map(), incident: new Map(), sys_user: new Map()};
  const nega = {grupo: false, gravacao: false, incidente: new Set(), campo: new Set(), exclusao: new Set()};
  let corrida;
  let usuarioAtual = analista;
  class GlideRecordSecure {
    constructor(tabela) { this.tabela = tabela; this.filtros = []; }
    initialize() { this.linha = {}; }
    get(id) { this.linha = dados[this.tabela].get(id); return Boolean(this.linha); }
    getValue(campo) { return this.linha[campo] ?? ""; }
    getUniqueValue() { return this.linha.sys_id; }
    canRead() { return this.tabela !== "incident" || !nega.incidente.has(this.linha.sys_id); }
    canWrite() { return this.canRead(); }
    canCreate() { return !nega.gravacao; }
    canDelete() { return !nega.exclusao.has(this.linha.sys_id); }
    isValidField(campo) { return Object.hasOwn(this.linha, campo); }
    getElement(campo) {
      return {canRead: () => !nega.campo.has(campo), canCreate: () => !nega.campo.has(campo),
        getED: () => ({getInternalType: () => campo === "caller_id" ? "reference" : "string"}),
        getReferenceTable: () => "sys_user", getDisplayValue: () => this.getValue(campo)};
    }
    setNewGuidValue(id) { this.linha.sys_id = id; }
    setValue(campo, valor) { this.linha[campo] = valor; }
    addQuery(campo, operador, valor) {
      if (valor === undefined) this.filtros.push(linha => linha[campo] === operador);
      else if (operador === "STARTSWITH") this.filtros.push(linha => linha[campo]?.startsWith(valor));
      else if (operador === ">") this.filtros.push(linha => linha[campo] > valor);
      else assert.fail("Operador não tratado");
    }
    orderBy(campo) { this.ordem = campo; }
    setLimit(limite) { this.limite = limite; }
    query() {
      const resultados = [...dados[this.tabela].values()].filter(linha => this.filtros.every(filtro => filtro(linha)));
      if (this.ordem) resultados.sort((a, b) => a[this.ordem].localeCompare(b[this.ordem]));
      this.resultados = resultados.slice(0, this.limite ?? resultados.length);
    }
    next() { this.linha = this.resultados.shift(); return Boolean(this.linha); }
    insert() {
      const alvo = dados[this.tabela];
      if (corrida === this.tabela) { alvo.set(this.linha.sys_id, this.linha); corrida = null; }
      if (alvo.has(this.linha.sys_id)) return null;
      alvo.set(this.linha.sys_id, this.linha);
      return this.linha.sys_id;
    }
    deleteRecord() { return dados[this.tabela].delete(this.linha.sys_id); }
  }
  const global = vm.createContext({
    gs: {getProperty: (nome, padrao) => ({"lino.group_id": configurado ? grupo : "",
      "lino.tag_owner_id": configurado ? owner : "", "glide.sys.default.tz": "America/Sao_Paulo"})[nome] ?? padrao,
    getUserID: () => usuarioAtual, getUserName: () => usuarioAtual ? "analista" : "guest",
    getUser: () => ({isMemberOf: () => !nega.grupo}), error: () => assert.fail("Erro inesperado no endpoint")},
    GlideRecordSecure,
    GlideDigest: class { getSHA256Hex(valor) { return createHash("sha256").update(valor).digest("hex"); } },
    GlideDateTime: class {
      constructor(utc) { this.data = new Date(utc.replace(" ", "T") + "Z"); }
      setTZ(fuso) { this.fuso = fuso; }
      getLocalDate() { return {getValue: () => new Intl.DateTimeFormat("en-CA", {timeZone: this.fuso,
        year: "numeric", month: "2-digit", day: "2-digit"}).format(this.data)}; }
    },
    Packages: {java: {util: {TimeZone: {getTimeZone: valor => valor}}}},
  });
  vm.runInContext(fonte("LinoClassificador") + "\n" + fonte("LinoService"), global);
  const servico = vm.runInContext("new LinoService()", global);
  dados.sys_user.set(paciente, {sys_id: paciente, name: "Ana de Souza"});
  function incidente(numero, campos = {}) {
    dados.incident.set(id(numero), {sys_id: id(numero), number: "DEMO" + numero, ...campos});
  }
  function chamar(rota, {query = {}, corpo = {}, usuario = usuarioAtual} = {}) {
    const resp = {};
    global.request = {queryParams: query, body: {data: corpo}, getHeader: () => usuario};
    global.response = {setStatus: status => { resp.status = status; }, setHeader() {},
      setBody: dados => { resp.dados = JSON.parse(JSON.stringify(dados)); }};
    vm.runInContext(fonte("LinoEndpoint").replace(/\bLINO_ROTA\b/g, JSON.stringify(rota)), global);
    return resp;
  }
  return {dados, nega, servico, incidente, chamar, concorrencia(tabela) { corrida = tabela; },
    sessao(usuario) { usuarioAtual = usuario; }};
}

test("classifica metadados, data no fuso da instância e texto, respeitando ACL e ignorados", () => {
  const a = ambiente();
  a.incidente(10, {short_description: "[DEMO] Divergência na sincronização de saldo",
    description: "Sistema: Estoque. Módulo: Inventário. Problema: DEMO-PRB-20261002. O estoque e o saldo.",
    u_system_name: "Estóque", caller_id: paciente, opened_at: "2026-10-22 02:00:00",
    assignment_group: "Equipe interna"});
  a.nega.campo.add("assignment_group");
  const {status, dados} = a.chamar("classificar", {corpo: {ids: [id(10)], regras, ignorados: ["termo:saldo"]}});
  assert.equal(status, 200);
  const tags = dados.itens[0].tags;
  const sistema = tags.find(tag => tag.tipo === "sistema");
  assert.deepEqual(sistema.fontes, ["u_system_name", "description"]);
  assert.equal(sistema.valor, "Estóque");
  assert.ok(tags.some(tag => tag.valor === "Ana de Souza"));
  assert.ok(tags.some(tag => tag.valor === "Inventário" && tag.tipo === "modulo"));
  assert.ok(tags.some(tag => tag.valor === "DEMO-PRB-20261002"));
  assert.ok(tags.some(tag => tag.valor === "Dia 21"));
  assert.ok(tags.some(tag => tag.valor === "21/10/2026"));
  assert.ok(tags.some(tag => tag.valor === "sincronização de saldo"));
  assert.ok(tags.some(tag => tag.valor === "Divergência de saldo"));
  assert.ok(tags.every(tag => !["o", "e", "saldo", "Equipe interna"].includes(tag.valor)));
  assert.ok([...a.dados.label.values()].every(tag => tag.group_list === grupo &&
    tag.owner === owner && tag.viewable_by === "groups and users" && tag.global === "false"));
  a.nega.campo.add("caller_id");
  const grafo = a.chamar("grafo").dados.itens;
  assert.ok(!grafo.some(item => item.tag.valor === "Ana de Souza"));
  const estoque = grafo.find(item => item.tag.valor === "Estóque");
  assert.equal(estoque.incidente.campos.grupo, "");
  assert.equal(estoque.incidente.campos.prioridade, "");
  assert.equal(estoque.incidente.abertoEm, "2026-10-22 02:00:00");
});

test("grafo devolve os campos do incidente e omite o que a ACL esconde", () => {
  const a = ambiente();
  a.incidente(11, {u_system_name: "Estoque", short_description: "Queda do enlace",
    assignment_group: "Service Desk", priority: "2 - Alta", state: "Em andamento",
    category: "Rede", cmdb_ci: "Roteador-01", opened_at: "2026-11-01 15:04:00"});
  a.nega.campo.add("priority");
  assert.equal(a.chamar("classificar", {corpo: {ids: [id(11)], regras: [], ignorados: []}}).status, 200);
  const item = a.chamar("grafo").dados.itens[0];
  assert.deepEqual(item.incidente.campos, {
    grupo: "Service Desk", prioridade: "", estado: "Em andamento", categoria: "Rede", ic: "Roteador-01",
  });
  assert.equal(item.incidente.abertoEm, "2026-11-01 15:04:00");
});

test("autoriza antes de operar, valida identidade, repete sem duplicar e preserva vínculo manual", () => {
  const a = ambiente();
  a.incidente(10, {u_system_name: "Estoque"});
  const corpo = {ids: [id(10)], regras: [], ignorados: []};
  a.sessao("");
  assert.equal(a.chamar("acesso").status, 401);
  assert.equal(a.chamar("classificar", {corpo}).status, 401);
  assert.equal(a.dados.label.size, 0);
  a.sessao(analista);
  a.nega.gravacao = true;
  assert.equal(a.chamar("acesso").status, 403);
  a.nega.gravacao = false;
  assert.equal(a.chamar("classificar", {corpo, usuario: id(6)}).status, 401);
  a.concorrencia("label_entry");
  assert.equal(a.chamar("classificar", {corpo}).dados.itens[0].tags[0].estado, "existente");
  assert.equal(a.chamar("classificar", {corpo}).dados.itens[0].tags[0].estado, "existente");
  const [vinculo] = a.chamar("grafo").dados.itens;
  a.dados.label_entry.set(id(800), {sys_id: id(800), label: vinculo.tag.id, table: "incident",
    table_key: id(10), title: vinculo.tag.nome, comments: "Lino v1:0"});
  a.nega.exclusao.add(vinculo.id);
  assert.equal(a.chamar("remover", {corpo: {tag: vinculo.tag.id, ids: [vinculo.id]}}).dados.itens[0].estado, "sem_acesso");
  a.nega.exclusao.clear();
  const remocao = a.chamar("remover", {corpo: {tag: vinculo.tag.id, ids: [vinculo.id, id(800)]}}).dados.itens;
  assert.deepEqual(remocao.map(item => item.estado), ["removido", "sem_acesso"]);
  assert.ok(a.dados.label_entry.has(id(800)));
  assert.equal(a.chamar("grafo").dados.itens.length, 0);
});

test("qualquer sessão com ACL pode usar suas próprias tags sem grupo ou conta técnica", () => {
  for (const configurado of [false, true]) {
    const a = ambiente({configurado});
    a.nega.grupo = true;
    a.incidente(10, {u_system_name: "Estoque"});
    const corpo = {ids: [id(10)], regras: [], ignorados: []};
    assert.deepEqual(a.chamar("acesso"), {status: 200, dados: {usuario: analista}});
    assert.equal(a.chamar("classificar", {corpo}).dados.itens[0].tags[0].estado, "adicionada");
    const [vinculo] = a.chamar("grafo").dados.itens;
    const tag = a.dados.label.get(vinculo.tag.id);
    assert.equal(tag.owner, analista);
    assert.equal(tag.viewable_by, "me");
    assert.ok(!tag.group_list && !tag.user_list);

    a.sessao(id(5));
    assert.deepEqual(a.chamar("grafo").dados.itens, []);
    assert.deepEqual(a.chamar("impacto", {query: {tag: vinculo.tag.id}}).dados.itens, []);
    assert.equal(a.chamar("remover", {corpo: {tag: vinculo.tag.id, ids: [vinculo.id]}}).dados.itens[0].estado, "indisponivel");
    assert.equal(a.chamar("classificar", {corpo}).dados.itens[0].tags[0].estado, "adicionada");
    assert.equal(a.dados.label.size, 2);
  }
});

test("calcula impacto além da primeira página e exclui incidentes que perderam acesso", async () => {
  const a = ambiente();
  for (let i = 10; i < 114; i++) a.incidente(i, {u_system_name: "Estoque"});
  for (let i = 10; i < 114; i += 25) {
    const ids = Array.from({length: Math.min(114 - i, 25)}, (_, j) => id(i + j));
    assert.equal(a.chamar("classificar", {corpo: {ids, regras: [], ignorados: []}}).status, 200);
  }
  a.nega.incidente.add(id(10));
  const vinculos = await coletar(cursor => a.chamar("grafo", {query: {cursor}}).dados);
  const [tag] = agrupar(vinculos, "estóque", "sistema");
  assert.equal(tag.incidentes.size, 103);
  assert.equal(tag.incidentes.get(id(113)).id, id(113));
  a.nega.exclusao.add(tag.incidentes.get(id(113)).idVinculo);
  const afetados = await coletar(cursor => a.chamar("impacto", {query: {cursor, tag: tag.id}}).dados);
  assert.equal(afetados.length, 102);
});

test("preferências são reversíveis e isoladas por usuário e instância", async () => {
  const dados = {};
  const armazenamento = {get: async chave => ({[chave]: dados[chave]}),
    set: async novos => Object.assign(dados, novos)};
  const origem = "https://demo.service-now.com";
  const pessoa = preferencias({origem, usuario: analista}, armazenamento);
  await pessoa.salvar([{chave: "termo:estoque", valor: "Estoque"}]);
  assert.equal((await pessoa.ler()).length, 1);
  assert.deepEqual(await preferencias({origem, usuario: paciente}, armazenamento).ler(), []);
  assert.deepEqual(await preferencias({origem: "https://outra.service-now.com", usuario: analista}, armazenamento).ler(), []);
  await pessoa.salvar([]);
  assert.deepEqual(await pessoa.ler(), []);
});
