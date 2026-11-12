export const CHAVE_METRICAS = 'lino:metricas';
export const RETENCAO = 30 * 86400000;
const EVENTOS = new Set(['aparicao', 'informacao', 'balao', 'minimizar', 'ocultar', 'desativar', 'sessao']);
export function limitarMetricas(itens, agora = Date.now()) {
  const limpos = itens.filter(e => EVENTOS.has(e.evento) && Number.isFinite(e.em) && e.em <= agora && e.em > agora - RETENCAO)
    .map(e => ({evento: e.evento, em: e.em, interface: e.interface === 'workspace' ? 'workspace' : 'classica',
      ...(Number.isFinite(e.ms) ? {ms: Math.round(Math.max(0, Math.min(e.ms, 3600000)))} : {})})).slice(-500);
  while (new TextEncoder().encode(JSON.stringify(limpos)).length > 200000) limpos.shift();
  return limpos;
}
let fila = Promise.resolve();
export function registrarMetrica(evento, armazenamento = chrome.storage.local) {
  fila = fila.catch(() => {}).then(async () => {
    const dados = (await armazenamento.get(CHAVE_METRICAS))[CHAVE_METRICAS] || [];
    await armazenamento.set({[CHAVE_METRICAS]: limitarMetricas([...dados, {...evento, em: Date.now()}])});
  });
  return fila;
}
export async function lerMetricas(armazenamento = chrome.storage.local) {
  const itens = limitarMetricas((await armazenamento.get(CHAVE_METRICAS))[CHAVE_METRICAS] || []);
  await armazenamento.set({[CHAVE_METRICAS]: itens});
  return itens;
}
