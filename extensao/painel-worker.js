import {registrarMetrica, lerMetricas} from './metricas.mjs';
import {configuracao} from './regras.mjs';
const ID_SCRIPT = 'lino-mascote';
async function configurarMascote() {
  const origem = new URL((await configuracao()).origem).origin;
  const permitido = await chrome.permissions.contains({origins: [origem + '/*']});
  await chrome.scripting.unregisterContentScripts({ids: [ID_SCRIPT]}).catch(() => {});
  if (!permitido || (await chrome.storage.local.get('lino:ativo'))['lino:ativo'] === false) return;
  await chrome.scripting.registerContentScripts([{id: ID_SCRIPT, matches: [origem + '/*'], js: ['mascote.js'], runAt: 'document_idle', allFrames: false}]);
  for (const aba of await chrome.tabs.query({url: origem + '/*'}))
    await chrome.scripting.executeScript({target: {tabId: aba.id}, files: ['mascote.js']}).catch(() => {});
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true}).catch(console.error);
  chrome.alarms.create('lino:limpar-metricas', {periodInMinutes: 1440});
  configurarMascote().catch(console.error);
});
chrome.runtime.onStartup.addListener(() => { configurarMascote().catch(console.error); lerMetricas().catch(console.error); });
chrome.permissions.onAdded.addListener(() => configurarMascote().catch(console.error));
chrome.permissions.onRemoved.addListener(() => configurarMascote().catch(console.error));
chrome.storage.onChanged.addListener((m, area) => {
  if (area === 'local' && (m.config || m['lino:ativo'])) configurarMascote().catch(console.error);
});
chrome.tabs.onUpdated.addListener((id, m) => {
  if (m.url || m.status === 'complete') chrome.tabs.sendMessage(id, {tipo: 'lino:reavaliar'}).catch(() => {});
});
chrome.tabs.onRemoved.addListener(id => chrome.storage.session.remove(['lino:trabalho:' + id, 'lino:entrada:' + id]));
async function mensagem(m, sender) {
  const painel = !sender.tab && sender.url?.startsWith(chrome.runtime.getURL(''));
  const origem = new URL((await configuracao()).origem).origin;
  if (sender.tab && new URL(sender.tab.url).origin !== origem) return {erro: 'origem'};
  if (m.tipo === 'lino:estado' && sender.tab) {
    const id = sender.tab.id, chave = 'lino:entrada:' + id;
    const d = await chrome.storage.session.get([chave, 'lino:trabalho:' + id]);
    return {trabalho: Boolean(d['lino:trabalho:' + id]), origem, entrada: Date.now() - (d[chave] || 0) >= 1800000};
  }
  if (m.tipo === 'lino:entrada' && sender.tab) {
    await chrome.storage.session.set({['lino:entrada:' + sender.tab.id]: Date.now()}); return {ok: true};
  }
  if (m.tipo === 'lino:trabalho' && painel && Number.isInteger(m.tabId)) {
    await chrome.storage.session.set({['lino:trabalho:' + m.tabId]: true});
    await chrome.tabs.sendMessage(m.tabId, {tipo: 'lino:reavaliar'}).catch(() => {}); return {ok: true};
  }
  if (m.tipo === 'lino:metrica' && (sender.tab || painel)) { await registrarMetrica(m.evento); return {ok: true}; }
  if (m.tipo === 'lino:abrir-painel' && sender.tab) { await chrome.sidePanel.open({tabId: sender.tab.id}); return {ok: true}; }
  if (m.tipo === 'lino:acao' && sender.tab) {
    await chrome.runtime.sendMessage({...m, tipo: 'lino:acao-painel', tabId: sender.tab.id}).catch(() => {}); return {ok: true};
  }
  if (['lino:etapa', 'lino:resultado'].includes(m.tipo) && painel && Number.isInteger(m.tabId)) {
    const aba = await chrome.tabs.get(m.tabId);
    if (new URL(aba.url).origin !== origem || (await chrome.storage.session.get('lino:trabalho:' + m.tabId))['lino:trabalho:' + m.tabId]) return {entregue: false};
    return await chrome.tabs.sendMessage(m.tabId, m).catch(() => ({entregue: false}));
  }
  if (m.tipo === 'lino:expandir' && painel) {
    if (!Array.isArray(m.dados) || m.dados.length > 20000) throw new Error('O grafo excedeu o limite de exportação.');
    const uuid = crypto.randomUUID(), chave = 'lino:grafico:' + uuid;
    const dados = m.dados.map(v => ({id: String(v.id || ''), fontes: [],
      tag: {id: String(v.tag.id), tipo: String(v.tag.tipo), valor: String(v.tag.valor).slice(0, 200)},
      incidente: {id: String(v.incidente.id), tabela: ['incident','problem','change_request'].includes(v.incidente.tabela) ? v.incidente.tabela : 'incident', numero: String(v.incidente.numero || '').slice(0, 80), titulo: String(v.incidente.titulo || '').slice(0, 240)}}));
    await chrome.storage.session.set({[chave]: {origem, fluxo: m.fluxo, geradoEm: Date.now(), dados}});
    await chrome.alarms.create(chave, {when: Date.now() + 600000});
    await chrome.tabs.create({url: chrome.runtime.getURL('grafico.html#' + uuid)}); return {ok: true};
  }
  return {ok: false};
}
chrome.runtime.onMessage.addListener((m, sender, responder) => {
  if (!m?.tipo?.startsWith('lino:')) return;
  // Preserve the click's user activation for the sidePanel API.
  if (m.tipo === 'lino:abrir-painel' && sender.tab) {
    chrome.sidePanel.open({tabId: sender.tab.id}).then(() => responder({ok: true}), e => responder({erro: e.message})); return true;
  }
  mensagem(m, sender).then(responder, e => responder({erro: e.message})); return true;
});
chrome.alarms.onAlarm.addListener(a => {
  if (a.name.startsWith('lino:grafico:')) chrome.storage.session.remove(a.name);
  if (a.name === 'lino:limpar-metricas') lerMetricas().catch(console.error);
});
