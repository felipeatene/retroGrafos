(() => {
  if (globalThis.__linoMascote) { globalThis.__linoMascote(); return; }
  let reavaliar = () => {};
  globalThis.__linoMascote = () => reavaliar();
  (async () => {
    const {classificarTela, consultarProfundo} = await import(chrome.runtime.getURL('mascote-contexto.mjs'));
    const {criarBaloes} = await import(chrome.runtime.getURL('baloes.mjs'));
    let host, ui, tela, timer, negativos = 0, ultimaURL = '', ocultoURL = '', mover = false, posicao, criando = false;
    let inicio = performance.now();
    const enviar = m => chrome.runtime.sendMessage(m).catch(() => ({}));
    const metrica = evento => enviar({tipo: 'lino:metrica', evento: {evento, interface: tela?.interface}});
    const evitar = 'thead, .list_bottom, .list_nav, .form_action_button, #toggleMoreOptions, #tags_menu, #document_tags, [role=tablist], [role=toolbar], [aria-label*="pagination"], [aria-label*="Pagination"]';
    function posicionar() {
      if (!host || host.hidden) return;
      const bloqueios = consultarProfundo(document, evitar).map(n => n.getBoundingClientRect()).filter(r => r.width && r.height);
      const rect = host.getBoundingClientRect(), margem = 16;
      const maxX = Math.max(margem, innerWidth - rect.width - margem), maxY = Math.max(margem, innerHeight - rect.height - margem);
      const pontos = [posicao, {x: maxX, y: maxY}, {x: margem, y: maxY}, {x: maxX, y: margem}, {x: margem, y: margem}].filter(Boolean);
      const livre = pontos.find(p => !bloqueios.some(r => p.x < r.right && p.x + rect.width > r.left && p.y < r.bottom && p.y + rect.height > r.top));
      if (!livre) { ui.minimizar(); host.hidden = true; return; }
      host.style.left = Math.max(margem, Math.min(maxX, livre.x)) + 'px'; host.style.top = Math.max(margem, Math.min(maxY, livre.y)) + 'px';
    }
    async function comando(nome) {
      if (nome === 'mover') { mover = !mover; ui.root.querySelector('.personagem').focus(); return; }
      if (nome === 'ocultar') { ocultoURL = location.href; host.hidden = true; return; }
      if (nome === 'desativar') { await chrome.storage.local.set({'lino:ativo': false}); host.hidden = true; return; }
      if (nome === 'classico') {
        const url = new URL('/' + tela.tabela + (tela.sysId ? '.do' : '_list.do'), location.origin);
        if (tela.sysId) url.searchParams.set('sys_id', tela.sysId); location.assign(url); return;
      }
      if (nome === 'abrir-painel') { await enviar({tipo: 'lino:abrir-painel'}); return; }
      if (nome !== 'minimizar') await enviar({tipo: 'lino:acao', comando: nome});
      posicionar();
    }
    async function montar() {
      if (ui || criando) return;
      criando = true;
      try {
        host = document.createElement('div'); host.id = 'lino-assistente'; host.setAttribute('aria-label', 'Lino, assistente do RetroGrafos');
        host.style.cssText = 'position:fixed;z-index:1040;left:16px;top:16px;pointer-events:none;max-width:calc(100vw - 32px);';
        document.documentElement.append(host);
        ui = await criarBaloes(host, {pagina: true, acao: comando, metrica});
        new ResizeObserver(posicionar).observe(host);
        let arraste;
        const botao = ui.root.querySelector('.personagem');
        botao.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          const r = host.getBoundingClientRect(); arraste = {x: e.clientX, y: e.clientY, left: r.left, top: r.top}; botao.setPointerCapture(e.pointerId);
        });
        botao.addEventListener('pointermove', e => {
          if (!arraste) return;
          host.style.left = Math.max(16, Math.min(innerWidth - host.offsetWidth - 16, arraste.left + e.clientX - arraste.x)) + 'px';
          host.style.top = Math.max(16, Math.min(innerHeight - host.offsetHeight - 16, arraste.top + e.clientY - arraste.y)) + 'px';
        });
        botao.addEventListener('pointerup', async () => {
          if (!arraste) return; arraste = null;
          const r = host.getBoundingClientRect(); posicao = {x: r.left < innerWidth / 2 ? 16 : innerWidth - r.width - 16, y: r.top < innerHeight / 2 ? 16 : innerHeight - r.height - 16};
          posicionar(); await chrome.storage.local.set({['lino:posicao:' + location.origin]: posicao});
        });
        botao.addEventListener('pointercancel', () => { arraste = null; });
        botao.addEventListener('keydown', e => {
          if (e.key === 'Escape') { mover = false; return; }
          if (!mover || !e.key.startsWith('Arrow')) return;
          e.preventDefault(); const r = host.getBoundingClientRect();
          posicao = {x: r.left + (e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0), y: r.top + (e.key === 'ArrowUp' ? -16 : e.key === 'ArrowDown' ? 16 : 0)};
          posicionar(); chrome.storage.local.set({['lino:posicao:' + location.origin]: posicao});
        });
        posicao = (await chrome.storage.local.get('lino:posicao:' + location.origin))['lino:posicao:' + location.origin];
      } finally { criando = false; }
    }
    async function avaliar() {
      const url = location.href, estado = await enviar({tipo: 'lino:estado'});
      const ativo = (await chrome.storage.local.get('lino:ativo'))['lino:ativo'] !== false;
      if (!ativo || estado.trabalho || !estado.origem) { if (host) host.hidden = true; return; }
      if (url !== location.href) return;
      const nova = classificarTela(document, url, estado.origem);
      if (nova.tipo === 'oculto' || ocultoURL === url) {
        if (++negativos >= 2) { if (host) host.hidden = true; }
        else reavaliar();
        return;
      }
      negativos = 0;
      const mudou = ultimaURL !== url || tela?.total !== nova.total;
      tela = nova; await montar(); if (!ui) return;
      host.hidden = false;
      const modal = consultarProfundo(document, '.modal.in, [role=dialog][aria-modal=true]').some(n => n.getClientRects().length && n.getAttribute('aria-hidden') !== 'true');
      if (modal) { ui.minimizar(); posicionar(); return; }
      if (mudou) {
        const plural = {incident: 'incidentes', problem: 'problemas', change_request: 'mudanças'}[tela.tabela];
        const singular = {incident: 'Incidente', problem: 'Problema', change_request: 'Mudança'}[tela.tabela];
        const texto = tela.tipo === 'registro' ? `${singular}${tela.numero ? ' ' + tela.numero : ''} aberto.`
          : tela.total === undefined ? `Lista de ${plural} aberta.` : `Encontrei ${tela.total} ${plural} nesta página.`;
        ui.mostrar({etapa: 'contexto', estado: 'aguardando', texto, acao: tela.interface === 'workspace' && tela.tabela !== 'incident'
          ? {rotulo: 'Abrir no formulário clássico', comando: 'classico'} : {rotulo: 'Abrir Lino', comando: 'abrir-painel'}});
        ultimaURL = url; posicionar();
        if (estado.entrada) { ui.pose('entrada'); await enviar({tipo: 'lino:entrada'}); await metrica('sessao'); }
        requestAnimationFrame(() => {
          if (host.hidden) return;
          for (const evento of ['aparicao', 'informacao']) enviar({tipo: 'lino:metrica', evento: {evento, interface: tela.interface, ms: performance.now() - inicio}});
        });
      }
      posicionar();
    }
    reavaliar = () => { clearTimeout(timer); timer = setTimeout(() => avaliar().catch(() => { if (host) host.hidden = true; }), 300); };
    chrome.runtime.onMessage.addListener((m, sender, responder) => {
      if (m.tipo === 'lino:reavaliar') { reavaliar(); return; }
      if (['lino:etapa', 'lino:resultado'].includes(m.tipo)) {
        if (!ui || host.hidden || ocultoURL === location.href) { responder({entregue: false}); return; }
        ui.mostrar(m); posicionar(); responder({entregue: !host.hidden});
      }
    });
    chrome.storage.onChanged.addListener((m, area) => { if (area === 'local' && (m['lino:ativo'] || m.config)) reavaliar(); });
    const navegar = () => { inicio = performance.now(); reavaliar(); };
    window.navigation?.addEventListener('navigatesuccess', navegar);
    addEventListener('popstate', navegar); addEventListener('resize', posicionar);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reavaliar(); });
    document.addEventListener('load', e => { if (e.target.localName === 'iframe') navegar(); }, true);
    const observer = new MutationObserver(m => { if (m.some(e => e.target !== host && !host?.contains(e.target))) reavaliar(); });
    if (document.body) observer.observe(document.body, {childList: true, subtree: true});
    reavaliar();
  })().catch(() => { delete globalThis.__linoMascote; });
})();
