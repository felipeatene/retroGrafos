const nomes = {aba: 'Aba', contexto: 'Contexto', acesso: 'Acesso', grafo: 'Grafo', classificar: 'Classificação', resultado: 'Resultado', consulta: 'Consulta', revisao: 'Revisão', permissao: 'Conexão'};

function miniGrafo({tags, incidentes}) {
  const figura = document.createElement('figure');
  const ns = 'http://www.w3.org/2000/svg';
  function elemento(nome, atributos) {
    const node = document.createElementNS(ns, nome);
    for (const [chave, valor] of Object.entries(atributos)) node.setAttribute(chave, valor);
    return node;
  }
  const svg = elemento('svg', {viewBox: '0 0 240 96', 'aria-hidden': 'true'});
  const legenda = document.createElement('figcaption');
  legenda.className = 'sr';
  legenda.textContent = tags.map(tag => `${tag.valor}: ${tag.conexoes.length} incidentes`).join('. ');
  tags.forEach((tag, i) => {
    const y = 96 * (i + 1) / (tags.length + 1);
    for (const j of tag.conexoes) svg.append(elemento('line', {x1: 16, y1: y, x2: 224, y2: 96 * (j + 1) / (incidentes + 1), class: 'mini-ligacao'}));
    const rotulo = elemento('text', {x: 28, y: y - 8});
    rotulo.textContent = tag.valor.length > 22 ? tag.valor.slice(0, 21) + '…' : tag.valor;
    svg.append(elemento('circle', {cx: 16, cy: y, r: 5, class: 'mini-tag'}), rotulo);
  });
  for (let i = 0; i < incidentes; i++) svg.append(elemento('circle', {cx: 224, cy: 96 * (i + 1) / (incidentes + 1), r: 4, class: 'mini-incidente'}));
  figura.className = 'mini-grafo'; figura.append(svg, legenda); return figura;
}
export const PRESETS = {
  idle: {pose: 'neutral', eyes: 'normal', mouth: 'smile'},
  entrada: {pose: 'wave', eyes: 'happy', mouth: 'happy', handL: 'open-wave'},
  pensando: {pose: 'think', eyes: 'normal', mouth: 'serious', handL: 'thinking'},
  confuso: {pose: 'confused', eyes: 'worried', mouth: 'neutral', handL: 'thinking', props: 'bulb'},
  comemorando: {pose: 'jump', eyes: 'happy', mouth: 'happy', handL: 'open-wave', handR: 'open-wave'},
  alerta: {pose: 'alert', eyes: 'wide', mouth: 'surprised', handL: 'open-up', handR: 'open-up'},
  apresentando: {pose: 'present', eyes: 'normal', mouth: 'smile', handL: 'holding', handR: 'holding', props: 'clipboard'},
  dormindo: {pose: 'sleep', eyes: 'closed', mouth: 'neutral', props: 'zzz'},
  apontando: {pose: 'point', eyes: 'normal', mouth: 'smile', handR: 'pointing'},
};

export async function criarBaloes(host, {pagina = false, acao = () => {}, metrica = () => {}, aoClicarMascote} = {}) {
  const root = host.attachShadow({mode: 'open'});
  const base = chrome.runtime.getURL('');
  const [css, poses, svg] = await Promise.all(['baloes.css', 'assets/mascote/mascote-poses.css', 'assets/mascote/mascote.svg'].map(async arquivo => {
    const res = await fetch(base + arquivo); if (!res.ok) throw new Error('Não foi possível carregar o Lino.'); return res.text();
  }));
  // Only packaged, trusted extension assets are inserted as markup.
  root.innerHTML = `<style>${css}\n${poses}</style><div class="assistente">
    <section class="balao" hidden><span class="etapa"></span><p class="fala"></p><div class="contador"></div><progress hidden></progress><div class="totais"></div><button class="acao" hidden></button></section>
    <div class="chips" aria-label="Etapas da análise"></div><details class="historico" hidden><summary>Ver histórico</summary><ol></ol></details>
    <div class="base"><div id="controles-mascote" class="controles" hidden><button data-comando="mover">Mover</button><button data-comando="minimizar">Minimizar</button><button data-comando="ocultar">Ocultar nesta página</button><button data-comando="desativar">Desativar o Lino</button></div>
    <button class="personagem" aria-label="${aoClicarMascote ? 'Abrir Lino' : 'Lino, assistente do RetroGrafos. Abrir mensagens'}">${svg}</button>
    <button class="opcoes-mascote" aria-label="Opções do mascote" aria-controls="controles-mascote" aria-expanded="false" ${pagina ? '' : 'hidden'}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg></button></div>
    <div class="sr anuncio" role="status" aria-live="polite" aria-atomic="true"></div><div class="sr erro" role="alert" aria-atomic="true"></div></div>`;
  const q = s => root.querySelector(s), rig = q('.personagem > svg'), painel = q('.assistente');
  q('.fala').setAttribute('aria-hidden', 'true');
  let historia = [], atual, recolher, retorno, ocioso, piscar, fala, limparPiscar, estado = 'idle', pausado = false, fora = false, destruido = false, ultimaFaixa = -1, ultimoAnuncio = 0;
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)');
  function pararFala() { clearInterval(fala); rig.dataset.mouth = (PRESETS[estado] || PRESETS.idle).mouth; }
  function pausa() {
    pausado = document.hidden || fora || destruido;
    rig.classList.toggle('is-paused', pausado);
    if (pausado || reduzido.matches) pararFala();
  }
  function pose(nome) {
    estado = nome; clearTimeout(retorno); clearTimeout(ocioso); pararFala();
    for (const [chave, valor] of Object.entries({handL: 'relaxed', handR: 'relaxed', props: '', ...PRESETS[nome]})) rig.dataset[chave] = valor;
    rig.classList.toggle('is-idle', nome === 'idle' && !reduzido.matches);
    rig.classList.remove('is-walking');
    rig.classList.toggle('is-paused', pausado);
    if (nome === 'comemorando' || nome === 'entrada') retorno = setTimeout(() => pose('idle'), 1800);
    ocioso = setTimeout(() => { rig.classList.add('is-paused'); pararFala(); }, 30000);
  }
  function blink() {
    piscar = setTimeout(() => {
      if (!pausado && !reduzido.matches && !rig.classList.contains('is-paused')) {
        rig.classList.add('is-blinking'); limparPiscar = setTimeout(() => rig.classList.remove('is-blinking'), 180);
      }
      if (!destruido) blink();
    }, 3000 + Math.random() * 3000);
  }
  function historico() {
    q('.chips').replaceChildren(); q('.historico ol').replaceChildren();
    for (const item of historia.slice(-3)) {
      const botao = document.createElement('button'); botao.textContent = nomes[item.etapa] || item.etapa;
      botao.addEventListener('click', () => render(item, false)); q('.chips').append(botao);
    }
    for (const item of historia) { const li = document.createElement('li'); li.textContent = (nomes[item.etapa] || item.etapa) + ': ' + item.texto; q('.historico ol').append(li); }
    q('.historico').hidden = historia.length < 4;
  }
  function render(evento, anunciar = true) {
    clearTimeout(recolher);
    const mesma = atual?.etapa === evento.etapa;
    atual = evento; q('.balao').hidden = false; q('.balao').dataset.estado = evento.estado;
    q('.etapa').textContent = nomes[evento.etapa] || evento.etapa;
    q('.fala').textContent = evento.texto || '';
    const temTotal = Number.isFinite(evento.total) && evento.total > 0;
    q('.contador').textContent = temTotal ? `${evento.feitos || 0} de ${evento.total}` : '';
    q('progress').hidden = !temTotal; q('progress').max = evento.total || 1; q('progress').value = evento.feitos || 0;
    q('progress').setAttribute('aria-label', 'Progresso da etapa');
    q('.acao').hidden = !evento.acao; q('.acao').textContent = evento.acao?.rotulo || '';
    q('.acao').onclick = () => acao(evento.acao?.comando);
    q('.totais').replaceChildren();
    if (evento.miniGrafo) q('.totais').append(miniGrafo(evento.miniGrafo));
    if (evento.totais) {
      const nomesTotais = {adicionada: 'Tags adicionadas', existente: 'Já presentes', falha: 'Tags com falha', negados: 'Sem acesso', falhasDeRegistro: 'Registros com falha'};
      const maior = Math.max(1, ...Object.values(evento.totais));
      for (const [chave, rotulo] of Object.entries(nomesTotais)) {
        const valor = Number(evento.totais[chave]) || 0;
        const linha = document.createElement('div'); linha.className = 'total'; linha.dataset.falha = String(['falha', 'negados', 'falhasDeRegistro'].includes(chave));
        const label = document.createElement('span'); label.textContent = rotulo;
        const trilho = document.createElement('span'); trilho.className = 'trilho'; trilho.setAttribute('aria-hidden', 'true');
        const barra = document.createElement('i'); barra.style.width = (100 * valor / maior) + '%'; trilho.append(barra);
        const numero = document.createElement('b'); numero.textContent = valor; linha.append(label, trilho, numero); q('.totais').append(linha);
      }
    }
    const faixa = temTotal ? Math.floor(4 * (evento.feitos || 0) / evento.total) : 0;
    if (anunciar && (!mesma || faixa !== ultimaFaixa || Date.now() - ultimoAnuncio >= 5000 || evento.estado !== 'ativo')) {
      q('.anuncio').textContent = ''; q('.erro').textContent = '';
      q(evento.estado === 'erro' ? '.erro' : '.anuncio').textContent = [evento.texto, q('.contador').textContent].filter(Boolean).join(' ');
      ultimaFaixa = faixa; ultimoAnuncio = Date.now();
    }
    pose(evento.estado === 'erro' ? 'alerta' : evento.estado === 'ativo' ? 'pensando' : evento.etapa === 'resultado' ? 'comemorando' : 'apontando');
    if (!reduzido.matches && !pausado) {
      let n = 0; fala = setInterval(() => { rig.dataset.mouth = ['talk-a', 'talk-o', 'neutral'][n++ % 3]; if (n > 10) pararFala(); }, 120);
    }
    if (evento.estado === 'concluido') recolher = setTimeout(() => {
      q('.balao').hidden = true;
      historia = [...historia.filter(item => item.etapa !== evento.etapa), evento].slice(-20);
      historico();
      pose('idle');
    }, evento.etapa === 'resultado' ? 12000 : 1200);
  }
  function mostrar(evento) {
    if (evento.limpar) historia = [];
    if (!evento.limpar && atual && atual.etapa !== evento.etapa) historia = [...historia.filter(e => e.etapa !== atual.etapa), atual].slice(-20);
    render(evento); historico();
  }
  function minimizar(valor = true) {
    painel.classList.toggle('compacto', valor); rig.dataset.detail = valor ? 'low' : 'full'; rig.dataset.view = valor ? 'head' : 'body';
    rig.setAttribute('viewBox', valor ? '52 0 152 105' : '0 0 256 320');
  }
  q('.personagem').addEventListener('click', () => {
    if (aoClicarMascote) { aoClicarMascote(); return; }
    minimizar(false);
    if (atual) render(atual, false);
  });
  const fecharOpcoes = () => {
    q('.controles').hidden = true;
    q('.opcoes-mascote').setAttribute('aria-expanded', 'false');
  };
  q('.opcoes-mascote').onclick = () => {
    if (!q('.controles').hidden) { fecharOpcoes(); return; }
    q('.controles').hidden = false;
    q('.opcoes-mascote').setAttribute('aria-expanded', 'true');
    q('.controles button').focus();
  };
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { q('.balao').hidden = true; pose('idle'); } });
  for (const botao of root.querySelectorAll('[data-comando]')) botao.onclick = () => {
    const comando = botao.dataset.comando;
    fecharOpcoes();
    if (comando === 'minimizar') minimizar();
    if (['minimizar', 'ocultar', 'desativar'].includes(comando)) metrica(comando);
    acao(comando);
  };
  const observer = new IntersectionObserver(entries => { fora = !entries[0].isIntersecting; pausa(); }); observer.observe(host);
  document.addEventListener('visibilitychange', pausa); reduzido.addEventListener('change', pausa);
  pose('idle'); blink();
  return {root, rig, mostrar, pose, minimizar, destruir() {
    destruido = true; [recolher, retorno, ocioso, piscar, limparPiscar].forEach(clearTimeout); clearInterval(fala);
    observer.disconnect(); document.removeEventListener('visibilitychange', pausa); reduzido.removeEventListener('change', pausa); host.remove();
  }};
}
