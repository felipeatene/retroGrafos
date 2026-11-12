import {criarBaloes} from './baloes.mjs';
export function mensagensPainel(fluxo, destino) {
  let ultimaEtapa, sequencia = 0;
  const host = document.createElement('div'); host.className = 'mensagens-lino';
  const intro = document.querySelector('.chamado-intro');
  if (intro) intro.after(host); else document.querySelector('main').prepend(host);
  const ui = criarBaloes(host, {acao: comando => {
    if (comando === 'detalhes') { const d = document.getElementById('resultados'); d.open = true; d.scrollIntoView({block: 'nearest'}); }
    else document.getElementById(comando)?.click();
  }});
  chrome.runtime.onMessage.addListener(m => {
    if (m.tipo !== 'lino:acao-painel' || m.tabId !== destino()) return;
    if (m.comando === 'detalhes') { const d = document.getElementById('resultados'); if (d) d.open = true; }
    else document.getElementById(m.comando)?.click();
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
