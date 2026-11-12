import {criarBaloes} from './baloes.mjs';
export function mensagensPainel(fluxo, destino, aoAbrirDetalhes = () => {}) {
  let ultimaEtapa, sequencia = 0;
  const host = document.createElement('div'); host.className = 'mensagens-lino';
  const intro = document.querySelector('.chamado-intro');
  if (intro) intro.after(host); else document.querySelector('main').prepend(host);
  function executarAcao(comando) {
    if (comando !== 'detalhes') { document.getElementById(comando)?.click(); return; }
    const detalhes = document.getElementById('resultados');
    if (!detalhes || detalhes.hidden) return;
    aoAbrirDetalhes();
    detalhes.open = true;
    detalhes.querySelector('summary')?.focus();
    detalhes.scrollIntoView({block: 'nearest'});
  }
  const ui = criarBaloes(host, {acao: executarAcao});
  chrome.runtime.onMessage.addListener(m => {
    if (m.tipo !== 'lino:acao-painel' || m.tabId !== destino()) return;
    executarAcao(m.comando);
  });
  return async evento => {
    const versao = ++sequencia, inicio = performance.now(), medir = evento.etapa !== ultimaEtapa;
    ultimaEtapa = evento.etapa;
    const mensagem = {tipo: evento.totais ? 'lino:resultado' : 'lino:etapa', fluxo, tabId: destino(), ...evento};
    const local = await ui;
    if (versao !== sequencia) return;
    local.root.querySelector('.base').hidden = true;
    // Always retain the local history; collapse the current bubble when delivered in-page.
    local.mostrar(mensagem);
    const resposta = await chrome.runtime.sendMessage(mensagem).catch(() => ({}));
    if (versao === sequencia && resposta?.entregue) local.root.querySelector('.balao').hidden = true;
    if (medir) chrome.runtime.sendMessage({tipo: 'lino:metrica', evento: {evento: 'balao', ms: performance.now() - inicio}}).catch(() => {});
  };
}
