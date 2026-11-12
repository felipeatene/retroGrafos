import {FORCAS_PADRAO, criarEstado, passo} from "./simulacao.mjs";

const COR_ARESTA = "rgba(156, 205, 159, 0.38)";
const COR_ANCORA = "#a8f769";
const COR_HALO = "#19291d";

function raioDe(no) {
  return Math.min(16, 4.4 + Math.sqrt(no.grau || 0) * 1.8);
}

function deslocamento(id) {
  let hash = 0;
  for (const caractere of id) hash = (hash * 33 + caractere.charCodeAt(0)) >>> 0;
  const angulo = (hash % 360) * Math.PI / 180;
  return {x: Math.cos(angulo) * 28, y: Math.sin(angulo) * 28};
}

export function criarGrafoVivo(canvas, {aoAbrir, aoSelecionar} = {}) {
  const contexto = canvas.getContext("2d");
  const abortar = new AbortController();
  const sinal = abortar.signal;
  let estado = null;
  let forcas = {...FORCAS_PADRAO};
  let camera = {x: 0, y: 0, k: 1};
  let hover = null;
  let destaqueId = null;
  let revelado = Infinity;
  let quadro = 0;
  let vivo = true;
  let ponteiros = new Map();
  let arraste = null;
  let ultimoClique = {id: "", quando: 0};
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function dimensoes() {
    return {w: canvas.clientWidth || 1, h: canvas.clientHeight || 1};
  }
  function ajustarBitmap() {
    const {w, h} = dimensoes();
    const dpr = window.devicePixelRatio || 1;
    const largura = Math.max(1, Math.round(w * dpr));
    const altura = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== largura || canvas.height !== altura) {
      canvas.width = largura;
      canvas.height = altura;
    }
  }
  function paraTela(x, y) {
    const {w, h} = dimensoes();
    return {x: w / 2 + (x - camera.x) * camera.k, y: h / 2 + (y - camera.y) * camera.k};
  }
  function paraMundo(x, y) {
    const {w, h} = dimensoes();
    return {x: camera.x + (x - w / 2) / camera.k, y: camera.y + (y - h / 2) / camera.k};
  }
  function visivel(no) {
    return no.aparecerEm == null || no.aparecerEm <= revelado;
  }
  function nosVisiveis() {
    return (estado?.nos || []).filter(visivel);
  }
  function arestasVisiveis() {
    if (!estado) return [];
    const ids = new Set(nosVisiveis().map(no => no.id));
    return estado.arestas.filter(aresta => ids.has(aresta.origem) && ids.has(aresta.destino));
  }
  function noEm(x, y) {
    let escolhido = null;
    let melhor = 18;
    for (const no of nosVisiveis()) {
      const tela = paraTela(no.x, no.y);
      const distancia = Math.hypot(tela.x - x, tela.y - y);
      const alcance = raioDe(no) + 6;
      if (distancia <= alcance && distancia < melhor) { melhor = distancia; escolhido = no; }
    }
    return escolhido;
  }
  function pedirQuadro() {
    if (!vivo || quadro) return;
    quadro = requestAnimationFrame(tick);
  }
  function aquecer(valor) {
    if (!estado) return;
    estado.alpha = Math.max(estado.alpha, valor);
    estado.parado = false;
    pedirQuadro();
  }
  function assentar() {
    if (!estado || !reduzido) return;
    let guarda = 0;
    while (!estado.parado && guarda < 240) { passo(estado, forcas); guarda++; }
  }
  function colocarPerto(no) {
    const porId = new Map(estado.nos.map(item => [item.id, item]));
    for (const aresta of estado.arestas) {
      const outroId = aresta.origem === no.id ? aresta.destino : aresta.destino === no.id ? aresta.origem : null;
      const outro = outroId && porId.get(outroId);
      if (!outro?.ancora) continue;
      const salto = deslocamento(no.id);
      no.x = outro.x + salto.x;
      no.y = outro.y + salto.y;
      no.vx = 0;
      no.vy = 0;
      return;
    }
  }
  function desenhar() {
    if (!vivo) return;
    ajustarBitmap();
    const {w, h} = dimensoes();
    const dpr = canvas.width / w;
    contexto.setTransform(dpr, 0, 0, dpr, 0, 0);
    contexto.clearRect(0, 0, w, h);
    if (!estado) return;
    const nos = nosVisiveis();
    const arestas = arestasVisiveis();
    const porId = new Map(nos.map(no => [no.id, no]));
    const foco = hover || destaqueId;
    let relacionados = null;
    if (foco && porId.has(foco)) {
      relacionados = new Set([foco]);
      for (const aresta of arestas) {
        if (aresta.origem === foco) relacionados.add(aresta.destino);
        if (aresta.destino === foco) relacionados.add(aresta.origem);
      }
    }
    contexto.lineCap = "round";
    for (const aresta of arestas) {
      const a = porId.get(aresta.origem);
      const b = porId.get(aresta.destino);
      const ta = paraTela(a.x, a.y);
      const tb = paraTela(b.x, b.y);
      const ativa = !relacionados || relacionados.has(a.id) && relacionados.has(b.id);
      contexto.globalAlpha = ativa ? 0.5 : 0.08;
      contexto.strokeStyle = COR_ARESTA;
      contexto.lineWidth = Math.min(3.2, 0.7 + Math.log2((aresta.peso || 1) + 1));
      contexto.beginPath();
      contexto.moveTo(ta.x, ta.y);
      contexto.lineTo(tb.x, tb.y);
      contexto.stroke();
    }
    const mostrarRotulo = camera.k >= 0.85 || nos.length <= 14;
    const caixas = [];
    for (const no of nos) {
      const tela = paraTela(no.x, no.y);
      const raio = raioDe(no);
      const ativo = !relacionados || relacionados.has(no.id);
      contexto.globalAlpha = ativo ? 1 : 0.14;
      contexto.beginPath();
      contexto.fillStyle = no.cor || COR_NEUTRA;
      contexto.arc(tela.x, tela.y, raio, 0, Math.PI * 2);
      contexto.fill();
      if (no.ancora) {
        contexto.strokeStyle = COR_ANCORA;
        contexto.lineWidth = 1.6;
        contexto.beginPath();
        contexto.arc(tela.x, tela.y, raio + 3.5, 0, Math.PI * 2);
        contexto.stroke();
      }
      const forcar = relacionados?.has(no.id) || no.ancora && camera.k >= 0.45;
      if ((!forcar && !mostrarRotulo) || !no.rotulo) continue;
      const texto = no.rotulo.length > 22 ? no.rotulo.slice(0, 21) + "…" : no.rotulo;
      contexto.font = "650 12px Inter, system-ui, sans-serif";
      const larguraTexto = contexto.measureText(texto).width;
      const paraEsquerda = tela.x + raio + 8 + larguraTexto > w - 8;
      const textoX = paraEsquerda ? tela.x - raio - 4 - larguraTexto : tela.x + raio + 4;
      const caixa = {x: textoX, y: tela.y - 8, w: larguraTexto, h: 14};
      const colide = caixas.some(outra => caixa.x < outra.x + outra.w && caixa.x + caixa.w > outra.x && caixa.y < outra.y + outra.h && caixa.y + caixa.h > outra.y);
      if (colide && !forcar) continue;
      caixas.push(caixa);
      contexto.globalAlpha = ativo ? 1 : 0.2;
      contexto.lineWidth = 4;
      contexto.lineJoin = "round";
      contexto.strokeStyle = COR_HALO;
      contexto.strokeText(texto, textoX, tela.y + 4);
      contexto.fillStyle = "#f4f8f2";
      contexto.fillText(texto, textoX, tela.y + 4);
    }
    contexto.globalAlpha = 1;
  }
  function tick() {
    quadro = 0;
    if (!vivo) return;
    if (estado && !estado.parado && !reduzido) passo(estado, forcas);
    desenhar();
    if (estado && !estado.parado && !reduzido) pedirQuadro();
  }
  function definir(grafo) {
    const anterior = new Map((estado?.nos || []).map(no => [no.id, no]));
    const nos = (grafo.nos || []).map(no => {
      const velho = anterior.get(no.id);
      if (!velho) return {...no};
      return {...no, x: velho.x, y: velho.y, vx: 0, vy: 0};
    });
    estado = criarEstado(nos, grafo.arestas || []);
    if (anterior.size) estado.alpha = 0.55;
    assentar();
    pedirQuadro();
  }
  function enquadrar() {
    const nos = nosVisiveis();
    if (!nos.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const no of nos) {
      minX = Math.min(minX, no.x); minY = Math.min(minY, no.y);
      maxX = Math.max(maxX, no.x); maxY = Math.max(maxY, no.y);
    }
    const {w, h} = dimensoes();
    const largura = Math.max(48, maxX - minX + 80);
    const altura = Math.max(48, maxY - minY + 48);
    camera.k = Math.min(2.2, Math.max(0.2, Math.min((w - 28) / largura, (h - 28) / altura)));
    camera.x = (minX + maxX) / 2;
    camera.y = (minY + maxY) / 2;
    pedirQuadro();
  }
  function destacar(id) {
    destaqueId = id || null;
    pedirQuadro();
  }
  function revelarAte(tempo, {reposicionar = false} = {}) {
    const limite = tempo == null ? Infinity : tempo;
    const antes = revelado;
    revelado = limite;
    if (estado) {
      for (const no of estado.nos) {
        if (no.ancora || no.aparecerEm == null) continue;
        const agoraVisivel = no.aparecerEm <= limite;
        const estava = no.aparecerEm <= antes;
        if (agoraVisivel && (reposicionar || !estava)) colocarPerto(no);
      }
      aquecer(0.45);
    } else pedirQuadro();
  }
  function ajustarForcas(novas) {
    forcas = {...forcas, ...novas};
    aquecer(0.7);
  }
  function destruir() {
    vivo = false;
    if (quadro) cancelAnimationFrame(quadro);
    abortar.abort();
    observador.disconnect();
  }

  canvas.addEventListener("wheel", evento => {
    evento.preventDefault();
    const antes = paraMundo(evento.offsetX, evento.offsetY);
    camera.k = Math.min(4, Math.max(0.18, camera.k * Math.exp(-evento.deltaY * 0.0011)));
    const depois = paraMundo(evento.offsetX, evento.offsetY);
    camera.x += antes.x - depois.x;
    camera.y += antes.y - depois.y;
    pedirQuadro();
  }, {passive: false, signal: sinal});

  canvas.addEventListener("pointerdown", evento => {
    canvas.setPointerCapture(evento.pointerId);
    ponteiros.set(evento.pointerId, {x: evento.offsetX, y: evento.offsetY});
    const no = ponteiros.size === 1 ? noEm(evento.offsetX, evento.offsetY) : null;
    arraste = {id: evento.pointerId, no, x: evento.offsetX, y: evento.offsetY, moveu: false, noX: no?.x, noY: no?.y};
    if (no) {
      no.fixo = true;
      no.vx = 0;
      no.vy = 0;
      canvas.style.cursor = "grabbing";
    }
  }, {signal: sinal});
  canvas.addEventListener("pointermove", evento => {
    const ponto = ponteiros.get(evento.pointerId);
    if (!ponto) {
      const sob = noEm(evento.offsetX, evento.offsetY);
      const id = sob?.id || null;
      if (id !== hover) { hover = id; canvas.style.cursor = id ? "grab" : "grab"; pedirQuadro(); }
      canvas.style.cursor = sob ? "pointer" : "grab";
      return;
    }
    ponto.x = evento.offsetX;
    ponto.y = evento.offsetY;
    if (ponteiros.size >= 2 && estado) {
      const [primeiro, segundo] = [...ponteiros.values()];
      const dist = Math.hypot(primeiro.x - segundo.x, primeiro.y - segundo.y) || 1;
      if (arraste.pinça) camera.k = Math.min(4, Math.max(0.18, arraste.k * dist / arraste.pinça));
      else { arraste.pinça = dist; arraste.k = camera.k; }
      pedirQuadro();
      return;
    }
    if (!arraste || arraste.id !== evento.pointerId) return;
    const dx = evento.offsetX - arraste.x;
    const dy = evento.offsetY - arraste.y;
    if (Math.hypot(dx, dy) > 4) arraste.moveu = true;
    if (arraste.no) {
      const mundo = paraMundo(evento.offsetX, evento.offsetY);
      arraste.no.x = mundo.x;
      arraste.no.y = mundo.y;
      aquecer(0.32);
    } else {
      camera.x -= dx / camera.k;
      camera.y -= dy / camera.k;
      arraste.x = evento.offsetX;
      arraste.y = evento.offsetY;
      pedirQuadro();
    }
  }, {signal: sinal});
  function soltar(evento) {
    ponteiros.delete(evento.pointerId);
    if (!arraste || arraste.id !== evento.pointerId) return;
    const no = arraste.no;
    if (no) {
      no.fixo = Boolean(no.ancora);
      canvas.style.cursor = "pointer";
      if (!arraste.moveu) {
        const agora = performance.now();
        const duplo = ultimoClique.id === no.id && agora - ultimoClique.quando < 450;
        ultimoClique = {id: no.id, quando: agora};
        aoSelecionar?.(no);
        if (no.abrir === "incidente" || duplo) aoAbrir?.(no);
      }
    }
    arraste = null;
  }
  canvas.addEventListener("pointerup", soltar, {signal: sinal});
  canvas.addEventListener("pointercancel", soltar, {signal: sinal});
  canvas.addEventListener("pointerleave", () => {
    if (arraste) return;
    if (hover) { hover = null; pedirQuadro(); }
    canvas.style.cursor = "grab";
  }, {signal: sinal});

  const observador = new ResizeObserver(() => pedirQuadro());
  observador.observe(canvas);
  canvas.style.cursor = "grab";
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pedirQuadro(); }, {signal: sinal});

  return {definir, destacar, revelarAte, ajustarForcas, enquadrar, destruir};
}
