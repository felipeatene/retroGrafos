const ID = /^[a-f0-9]{32}$/i;
const TABELAS = new Set(['incident', 'problem', 'change_request']);

// Bounded traversal; closed roots and cross-origin frames remain opaque.
export function consultarProfundo(raiz, seletor, {maxNos = 5000, maxProfundidade = 12} = {}) {
  const encontrados = [], pilha = [{node: raiz, profundidade: 0}], vistos = new Set();
  let visitados = 0;
  while (pilha.length && visitados < maxNos) {
    const {node, profundidade} = pilha.pop();
    if (!node || vistos.has(node) || profundidade > maxProfundidade) continue;
    vistos.add(node); visitados++;
    if (node.matches?.(seletor)) encontrados.push(node);
    if (node.shadowRoot) pilha.push({node: node.shadowRoot, profundidade: profundidade + 1});
    try {
      if (node.localName === 'iframe' && node.contentDocument?.location.origin === raiz.location?.origin)
        pilha.push({node: node.contentDocument, profundidade: profundidade + 1});
    } catch { /* Browser security boundary. */ }
    // Do not enqueue an unbounded wide tree.
    const filhos = node.children || [];
    for (let i = Math.min(filhos.length, maxNos - visitados) - 1; i >= 0; i--)
      pilha.push({node: filhos[i], profundidade});
  }
  return encontrados;
}

export function classificarTela(doc, endereco, origem) {
  let url;
  try { url = new URL(endereco); } catch { return {tipo: 'oculto', motivo: 'url'}; }
  const oculto = motivo => ({tipo: 'oculto', interface: 'classica', motivo});
  if (url.origin !== origem) return oculto('origem');
  if (/\/(?:login(?:_with_sso)?|logout)\.do/.test(url.pathname) || doc.querySelector('input[type=password]')) return oculto('sessao');
  const texto = (doc.body?.innerText || '').slice(0, 12000);
  if (/session (?:has )?expired|sessão expirada|access denied|security constraints|acesso negado/i.test(texto)) return oculto('acesso');
  const prefixo = '/now/nav/ui/classic/params/target/';
  if (url.pathname.startsWith(prefixo)) {
    try {
      const frame = doc.querySelector('iframe#gsft_main, iframe[name="gsft_main"]')?.contentDocument;
      if (frame?.location.origin === origem) return classificarTela(frame, frame.URL, origem);
      url = new URL(decodeURIComponent(url.pathname.slice(prefixo.length)), origem);
    } catch { return oculto('iframe'); }
    if (url.origin !== origem) return oculto('origem');
  }
  const workspace = /^\/now\/(?:sow|workspace\/[^/]+|cwf\/[^/]+)\//.test(url.pathname);
  const registro = workspace
    ? url.pathname.match(/\/record\/(incident|problem|change_request)\/([a-f0-9]{32})(?:\/|$)/i)
    : url.pathname.match(/^\/(incident|problem|change_request)\.do$/);
  if (registro) {
    const tabela = registro[1], sysId = workspace ? registro[2] : url.searchParams.get('sys_id');
    if (!ID.test(sysId || '')) return oculto('novo');
    const numero = doc.getElementById(tabela + '.number') || doc.getElementById('sys_readonly.' + tabela + '.number');
    if (!workspace && (!numero || numero.hidden || numero.getClientRects?.().length === 0)) return oculto('registro-invisivel');
    const valor = node => String(node?.value || node?.textContent || '').trim();
    const campos = workspace ? consultarProfundo(doc, '[name="number"], [data-field="number"]') : [];
    return {tipo: 'registro', interface: workspace ? 'workspace' : 'classica', tabela,
      sysId: sysId.toLowerCase(), numero: valor(numero || campos[0]),
      titulo: valor(doc.getElementById(tabela + '.short_description')), motivo: 'registro'};
  }
  let tabela = workspace ? url.pathname.match(/\/list\/params\/(?:.*\/)?table\/(incident|problem|change_request)(?:\/|$)/)?.[1]
    : url.pathname.match(/^\/(incident|problem|change_request)_list\.do$/)?.[1];
  if (workspace && !tabela && /\/list(?:\/|$)/.test(url.pathname))
    tabela = consultarProfundo(doc, '[table]').map(node => node.getAttribute('table')).find(t => TABELAS.has(t));
  if (!tabela) return oculto('tela');
  const grade = doc.getElementById(tabela + '_table');
  if (!workspace && !grade && !/No records to display|Nenhum registro para exibir/i.test(texto)) return oculto('sem-lista');
  const links = workspace ? consultarProfundo(doc, 'a[href]') : [...(grade?.querySelectorAll('a[href]') || [])];
  const registros = new Map();
  for (const link of links) {
    try {
      const alvo = new URL(link.getAttribute('href') || link.href, origem);
      if (alvo.origin !== origem) continue;
      const rota = alvo.pathname.match(/\/record\/(incident|problem|change_request)\/([a-f0-9]{32})(?:\/|$)/i);
      const id = rota?.[1] === tabela ? rota[2] : alvo.pathname === '/' + tabela + '.do' ? alvo.searchParams.get('sys_id') : '';
      if (!ID.test(id || '') || registros.has(id.toLowerCase())) continue;
      const linha = link.closest('tr, [role=row]');
      const titulo = linha?.querySelector('[headers*="short_description"], [data-field="short_description"]');
      registros.set(id.toLowerCase(), {id: id.toLowerCase(), numero: link.textContent.trim(), titulo: titulo?.textContent.trim() || ''});
    } catch { /* Unrelated links are not records. */ }
  }
  return {tipo: 'lista', interface: workspace ? 'workspace' : 'classica', tabela,
    total: workspace && !links.length ? undefined : registros.size, registros: [...registros.values()], motivo: 'lista'};
}

export function contextoAPI(tela) {
  if (tela.tipo === 'oculto') return {tipo: 'incompativel', motivo: tela.motivo};
  if (tela.tabela !== 'incident') return {...tela, tipoTela: tela.tipo, tipo: 'legado'};
  return tela.tipo === 'registro' ? {...tela, tipo: 'incidente', id: tela.sysId} : tela;
}
