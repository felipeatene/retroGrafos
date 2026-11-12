export const FORCAS_PADRAO = Object.freeze({
  repulsao: 280,
  distancia: 72,
  forcaAresta: 0.08,
  centro: 0.018,
});

const RESFRIAMENTO = 0.98;
const ALPHA_MINIMO = 0.012;
const VIZINHOS_BRUTOS = 280;

export function criarEstado(nos, arestas = []) {
  nos.forEach((no, i) => {
    if (!Number.isFinite(no.x) || !Number.isFinite(no.y)) {
      const angulo = i * 2.399963229728653;
      const raio = 36 + (i % 6) * 14;
      no.x = Math.cos(angulo) * raio;
      no.y = Math.sin(angulo) * raio;
    }
    no.vx = Number.isFinite(no.vx) ? no.vx : 0;
    no.vy = Number.isFinite(no.vy) ? no.vy : 0;
    no.fixo = Boolean(no.fixo);
  });
  return {nos, arestas, alpha: 1, parado: false};
}

function empurrar(a, b, forcas, alpha) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist2 = dx * dx + dy * dy;
  if (dist2 < 1e-4) {
    const angulo = ((a.id || "").length + 1) * 2.399963229728653;
    dx = Math.cos(angulo);
    dy = Math.sin(angulo);
    dist2 = 1;
  }
  const dist = Math.sqrt(dist2);
  const intensidade = (forcas.repulsao * alpha) / dist2;
  const fx = (dx / dist) * intensidade;
  const fy = (dy / dist) * intensidade;
  if (!a.fixo) { a.vx -= fx; a.vy -= fy; }
  if (!b.fixo) { b.vx += fx; b.vy += fy; }
}

function repelir(nos, forcas, alpha) {
  if (nos.length <= VIZINHOS_BRUTOS) {
    for (let i = 0; i < nos.length; i++) {
      for (let j = i + 1; j < nos.length; j++) empurrar(nos[i], nos[j], forcas, alpha);
    }
    return;
  }
  const celula = Math.max(24, forcas.distancia);
  const grades = new Map();
  for (const no of nos) {
    const chave = Math.floor(no.x / celula) + ":" + Math.floor(no.y / celula);
    const grupo = grades.get(chave);
    if (grupo) grupo.push(no);
    else grades.set(chave, [no]);
  }
  for (const no of nos) {
    const cx = Math.floor(no.x / celula);
    const cy = Math.floor(no.y / celula);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const grupo = grades.get(ix + ":" + iy);
        if (!grupo) continue;
        for (const outro of grupo) {
          if (outro === no || String(outro.id) <= String(no.id)) continue;
          empurrar(no, outro, forcas, alpha);
        }
      }
    }
  }
}

export function passo(estado, forcas = FORCAS_PADRAO) {
  if (estado.parado || estado.alpha < ALPHA_MINIMO) {
    estado.alpha = 0;
    estado.parado = true;
    return estado;
  }
  const alpha = estado.alpha;
  const porId = new Map(estado.nos.map(no => [no.id, no]));
  repelir(estado.nos, forcas, alpha);
  for (const aresta of estado.arestas) {
    const a = porId.get(aresta.origem);
    const b = porId.get(aresta.destino);
    if (!a || !b) continue;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 1e-4) { dx = 1; dy = 0; dist = 1; }
    const intensidade = (dist - forcas.distancia) * forcas.forcaAresta * alpha * (aresta.peso || 1);
    const fx = (dx / dist) * intensidade;
    const fy = (dy / dist) * intensidade;
    if (!a.fixo) { a.vx += fx; a.vy += fy; }
    if (!b.fixo) { b.vx -= fx; b.vy -= fy; }
  }
  for (const no of estado.nos) {
    if (no.fixo) { no.vx = 0; no.vy = 0; continue; }
    no.vx -= no.x * forcas.centro * alpha;
    no.vy -= no.y * forcas.centro * alpha;
    no.vx *= 0.55;
    no.vy *= 0.55;
    const velocidade = Math.hypot(no.vx, no.vy);
    if (velocidade > 28) { no.vx = no.vx / velocidade * 28; no.vy = no.vy / velocidade * 28; }
    no.x += no.vx;
    no.y += no.vy;
  }
  estado.alpha *= RESFRIAMENTO;
  if (estado.alpha < ALPHA_MINIMO) { estado.alpha = 0; estado.parado = true; }
  return estado;
}
