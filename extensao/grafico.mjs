import {agrupar, desenhar, TIPOS_LINO} from './lino-grafo.mjs';
import {registroURL} from './lote.mjs';
const el = id => document.getElementById(id);
const chave = 'lino:grafico:' + location.hash.slice(1);
let grafico;
function expirar() {
  grafico = null; el('conteudo').hidden = true; el('contagem').textContent = '';
  el('estado').textContent = 'Este gráfico expirou. Gere a análise novamente.';
  for (const id of ['grafo', 'tags', 'incidentes']) el(id).replaceChildren();
  chrome.storage.session.remove(chave);
}
function abrirRegistro(registro) { if (grafico) chrome.tabs.create({url: registroURL(grafico.origem, registro.tabela || 'incident', registro.id)}); }
function abrirTag(tag) {
  el('detalhe').textContent = tag.valor; el('incidentes').replaceChildren();
  for (const registro of tag.incidentes.values()) {
    const li = document.createElement('li'), link = document.createElement('a');
    link.textContent = [registro.numero, registro.titulo].filter(Boolean).join(' · ') || 'Abrir chamado';
    link.href = registroURL(grafico.origem, registro.tabela || 'incident', registro.id); link.target = '_blank'; link.rel = 'noopener'; li.append(link); el('incidentes').append(li);
  }
}
function renderizar() {
  if (!grafico) return;
  const tags = agrupar(grafico.dados, el('busca').value, el('tipo').value);
  el('contagem').textContent = `${tags.length} tags · ${new Set(tags.flatMap(t => [...t.incidentes.keys()])).size} chamados`;
  el('estado').textContent = tags.length ? '' : 'Nenhuma tag corresponde aos filtros.';
  desenhar(el('grafo'), tags, abrirTag, abrirRegistro);
  el('tags').replaceChildren(); el('incidentes').replaceChildren(); el('detalhe').textContent = 'Selecione uma tag';
  for (const tag of tags) {
    const li = document.createElement('li'), b = document.createElement('button'); b.textContent = `${tag.valor} · ${tag.incidentes.size}`;
    b.onclick = () => abrirTag(tag); li.append(b); el('tags').append(li);
  }
}
for (const [tipo, nome] of Object.entries(TIPOS_LINO)) { const o = document.createElement('option'); o.value = tipo; o.textContent = nome; el('tipo').append(o); }
try {
  grafico = (await chrome.storage.session.get(chave))[chave];
  if (!grafico || Date.now() - grafico.geradoEm >= 600000) expirar();
  else { el('conteudo').hidden = false; renderizar(); setTimeout(expirar, Math.max(0, grafico.geradoEm + 600000 - Date.now())); }
} catch { el('estado').textContent = 'Não consegui abrir o grafo. Gere a análise novamente.'; el('contagem').textContent = ''; }
el('busca').oninput = renderizar; el('tipo').onchange = renderizar;
document.addEventListener('visibilitychange', () => { if (grafico && Date.now() - grafico.geradoEm >= 600000) expirar(); });
