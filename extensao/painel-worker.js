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
chrome.tabs.onRemoved.addListener(id => chrome.storage.session.remove(['lino:trabalho:' + id, 'lino:entrada:' + id, 'lino:janela:' + id]));
chrome.action.onClicked.addListener(async aba => {
  try {
    const origem = new URL((await configuracao()).origem).origin;
    const autorizado = await chrome.permissions.contains({origins: [origem + '/*']});
    if (autorizado && aba.id && aba.url && new URL(aba.url).origin === origem) {
      await chrome.scripting.executeScript({target: {tabId: aba.id}, files: ['mascote.js']});
      const resposta = await chrome.tabs.sendMessage(aba.id, {tipo: 'lino:mostrar-mascote'});
      if (resposta?.ok) return;
    }
  } catch { /* The current page cannot host Lino. */ }
  await chrome.runtime.openOptionsPage();
});
async function mensagem(m, sender) {
  const painel = sender.url?.startsWith(chrome.runtime.getURL(''));
  const origem = new URL((await configuracao()).origem).origin;
  if (!painel && (!sender.tab || new URL(sender.url).origin !== origem)) return {erro: 'origem'};
  if (m.tipo === 'lino:preparar-janela' && !painel && sender.tab && sender.frameId === 0) {
    if (!await chrome.permissions.contains({origins: [origem + '/*']})) return {erro: 'permissao'};
    const chave = 'lino:janela:' + sender.tab.id;
    const autorizacao = crypto.randomUUID();
    await chrome.storage.session.set({[chave]: {autorizacao, url: sender.tab.url, expira: Date.now() + 30000}});
    return {autorizacao};
  }
  if (m.tipo === 'lino:vincular-janela' && painel && sender.tab && sender.frameId > 0) {
    const aba = await chrome.tabs.get(sender.tab.id);
    const url = new URL(sender.url);
    if (url.pathname !== '/painel.html' || !aba.url || new URL(aba.url).origin !== origem) return {erro: 'origem'};
    const chave = 'lino:janela:' + aba.id;
    const vinculo = (await chrome.storage.session.get(chave))[chave];
    if (!vinculo || vinculo.expira < Date.now() || vinculo.url !== aba.url || vinculo.autorizacao !== url.searchParams.get('janela')) return {erro: 'vinculo'};
    await chrome.storage.session.remove(chave);
    return {id: aba.id, origem};
  }
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
    const texto = (valor, limite) => String(valor || '').slice(0, limite);
    const dados = m.dados.map(v => ({id: texto(v.id, 80), fontes: [],
      tag: {id: texto(v.tag.id, 80), tipo: texto(v.tag.tipo, 40), valor: texto(v.tag.valor, 200)},
      incidente: {id: texto(v.incidente.id, 80), tabela: ['incident','problem','change_request'].includes(v.incidente.tabela) ? v.incidente.tabela : 'incident',
        numero: texto(v.incidente.numero, 80), titulo: texto(v.incidente.titulo, 240), abertoEm: texto(v.incidente.abertoEm, 32),
        campos: Object.fromEntries(['grupo','prioridade','estado','categoria','ic'].map(chave => [chave, texto(v.incidente.campos?.[chave], 120)]))}}));
    await chrome.storage.session.set({[chave]: {origem, fluxo: m.fluxo, geradoEm: Date.now(), dados}});
    await chrome.alarms.create(chave, {when: Date.now() + 600000});
    await chrome.tabs.create({url: chrome.runtime.getURL('grafico.html#' + uuid)}); return {ok: true};
  }
  return {ok: false};
}
chrome.runtime.onMessage.addListener((m, sender, responder) => {
  if (!m?.tipo?.startsWith('lino:')) return;
  mensagem(m, sender).then(responder, e => responder({erro: e.message})); return true;
});
chrome.alarms.onAlarm.addListener(a => {
  if (a.name.startsWith('lino:grafico:')) chrome.storage.session.remove(a.name);
  if (a.name === 'lino:limpar-metricas') lerMetricas().catch(console.error);
});
