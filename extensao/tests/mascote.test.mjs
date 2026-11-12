import test from 'node:test';
import assert from 'node:assert/strict';
import {classificarTela, consultarProfundo, contextoAPI} from '../mascote-contexto.mjs';
import {limitarMetricas, RETENCAO, registrarMetrica} from '../metricas.mjs';
import {readFileSync} from 'node:fs';
const origem = 'https://demo.service-now.com', id = 'a'.repeat(32);
function doc({tabela = 'incident', lista = false, senha = false, texto = '', visivel = true, quadro} = {}) {
  return {body: {innerText: texto}, children: [], location: {origin: origem},
    querySelector(s) { return s.includes('password') ? senha ? {} : null : s.includes('iframe') ? quadro ? {contentDocument: quadro} : null : null; },
    getElementById(s) { return s === tabela + '_table' && lista ? {querySelectorAll: () => []} : s === tabela + '.number' ? {value: 'INC001', getClientRects: () => visivel ? [1] : []} : null; }};
}
for (const tabela of ['incident', 'problem', 'change_request']) {
  for (const prefixo of ['/now/sow', '/now/workspace/agent', '/now/cwf/agent']) {
    test(`registro workspace ${prefixo} ${tabela}`, () => {
      const t = classificarTela(doc(), `${origem}${prefixo}/record/${tabela}/${id}`, origem);
      assert.equal(t.tipo, 'registro'); assert.equal(t.interface, 'workspace'); assert.equal(t.sysId, id);
    });
    test(`lista workspace ${prefixo} ${tabela} sem inventar total`, () => {
      const t = classificarTela(doc(), `${origem}${prefixo}/list/params/table/${tabela}`, origem);
      assert.equal(t.tipo, 'lista'); assert.equal(t.total, undefined);
    });
  }
  test(`formulário clássico ${tabela}`, () => assert.equal(classificarTela(doc({tabela}), `${origem}/${tabela}.do?sys_id=${id}`, origem).tipo, 'registro'));
  test(`lista clássica ${tabela}`, () => assert.equal(classificarTela(doc({tabela, lista: true}), `${origem}/${tabela}_list.do`, origem).total, 0));
  test(`novo ${tabela} fica oculto`, () => assert.equal(classificarTela(doc({tabela}), `${origem}/${tabela}.do?sys_id=-1`, origem).tipo, 'oculto'));
}
for (const rota of ['/login.do', '/logout.do', '/home.do', '/dashboard.do', '/sys_user_list.do', '/now/sow/home', '/now/sow/record/incident/-1', '/now/sow/list/list-id/xyz', '/now/sow/list/params/table/sc_task']) {
  test(`não aparece em ${rota}`, () => assert.equal(classificarTela(doc(), origem + rota, origem).tipo, 'oculto'));
}
test('origem, login, acesso negado e formulário invisível', () => {
  assert.equal(classificarTela(doc(), 'https://outra.test/incident_list.do', origem).motivo, 'origem');
  for (const caso of [{senha: true}, {texto: 'Access denied'}, {visivel: false}])
    assert.equal(classificarTela(doc(caso), `${origem}/incident.do?sys_id=${id}`, origem).tipo, 'oculto');
});
test('iframe clássico de mesma origem', () => {
  const frame = doc({lista: true}); frame.URL = origem + '/incident_list.do';
  const t = classificarTela(doc({quadro: frame}), origem + '/now/nav/ui/classic/params/target/incident_list.do', origem);
  assert.equal(t.tipo, 'lista');
});
test('percurso profundo limitado por orçamento e roots', () => {
  let visitas = 0;
  const folha = () => ({matches: () => { visitas++; return true; }, children: []});
  assert.equal(consultarProfundo({children: Array.from({length: 9000}, folha)}, '*', {maxNos: 50}).length, 49);
  assert.equal(visitas, 49);
  let raiz = folha(); for (let i = 0; i < 15; i++) raiz = {children: [], shadowRoot: raiz};
  assert.equal(consultarProfundo(raiz, '*', {maxProfundidade: 12}).length, 0);
  assert.equal(consultarProfundo({children: [], shadowRoot: null}, '*').length, 0);
});
test('contexto da API mantém incidentes e encaminha legado', () => {
  assert.equal(contextoAPI({tipo: 'registro', tabela: 'incident', sysId: id}).id, id);
  assert.equal(contextoAPI({tipo: 'registro', tabela: 'problem', sysId: id}).tipo, 'legado');
});
test('telemetria remove PII, limita volume e expira dados', async () => {
  const agora = Date.now();
  const dados = Array.from({length: 600}, () => ({evento: 'aparicao', em: agora, sys_id: id, usuario: id, titulo: 'privado', ms: 52}));
  dados.push({evento: 'ocultar', em: agora - RETENCAO - 1});
  const limpos = limitarMetricas(dados, agora);
  assert.equal(limpos.length, 500); assert.ok(!JSON.stringify(limpos).includes('privado')); assert.ok(!JSON.stringify(limpos).includes(id));
  assert.ok(new TextEncoder().encode(JSON.stringify(limpos)).length <= 200000);
  const store = {}, storage = {get: async k => ({[k]: store[k]}), set: async d => Object.assign(store, d)};
  await Promise.all(Array.from({length: 20}, () => registrarMetrica({evento: 'balao', ms: 30}, storage)));
  assert.equal(store['lino:metricas'].length, 20);
});
test('rig preserva pivôs e não usa raster, filtro ou espelhamento global', () => {
  const svg = readFileSync(new URL('../assets/mascote/lino-pet.svg', import.meta.url), 'utf8');
  assert.ok(!/<(?:image|filter|foreignObject)\b|scaleX\(-1\)/.test(svg));
  for (const nome of ['m-head', 'm-arm-l', 'm-arm-r', 'm-elbow-l', 'm-elbow-r', 'm-knee-l', 'm-knee-r']) assert.ok(svg.includes('id="' + nome + '"'));
  assert.ok(svg.includes('transform-origin:88px 210px'));
});
