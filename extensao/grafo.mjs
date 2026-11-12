
export function palavrasDaLinha(sugestoes) {
  return [...new Set(sugestoes.flatMap(s => s.motivos.map(m => m.termo)))];
}

const NS = "http://www.w3.org/2000/svg";
function svgElement(tipo, atributos) {
  const node = document.createElementNS(NS, tipo);
  for (const [chave, valor] of Object.entries(atributos)) node.setAttribute(chave, valor);
  return node;
}

export function criarGrafo(svg, legenda, aoFiltrar) {
  const arestas = svgElement("g", {class: "conexoes"});
  const vertices = svgElement("g", {class: "vertices"});
  svg.append(arestas, vertices);
  const termos = new Map();
  const registros = new Map();
  let filtro = null;

  function mostrarFiltro(termo) {
    filtro = filtro === termo ? null : termo;
    for (const [chave, node] of termos) node.g.setAttribute("aria-pressed", String(chave === filtro));
    for (const node of registros.values()) {
      const destaque = !filtro || node.palavras.includes(filtro);
      node.g.classList.toggle("atenuado", !destaque);
      node.arestas.forEach((a, i) => a.classList.toggle("atenuado", !!filtro && node.palavras[i] !== filtro));
    }
    aoFiltrar(filtro);
  }

  function add(alvo, palavras) {
    if (!palavras.length || registros.has(alvo.sysId)) return;
    const n = registros.size;
    const a = n * 2.399963;
    const raio = 108 + (n % 4) * 15;
    const x = 210 + Math.cos(a) * raio;
    const y = 145 + Math.sin(a) * raio * .72;
    const g = svgElement("g", {class: "vertice vertice-registro"});
    const title = svgElement("title", {});
    title.textContent = alvo.numero;
    g.append(title, svgElement("circle", {cx: x, cy: y, r: 3.6}));
    const exibidas = palavras.filter(p => termos.has(p) || termos.size < 16);
    const ligacoes = [];
    for (const palavra of exibidas) {
      if (!termos.has(palavra) && termos.size >= 16) continue;
      if (!termos.has(palavra)) {
        const i = termos.size;
        const angulo = i * 2.399963;
        const distancia = i === 0 ? 0 : 27 + Math.sqrt(i) * 15;
        const tx = 210 + Math.cos(angulo) * distancia;
        const ty = 145 + Math.sin(angulo) * distancia * .72;
        const palavraNode = svgElement("g", {class: "vertice vertice-termo", role: "button", tabindex: "0",
          "aria-label": "Filtrar por " + palavra, "aria-pressed": "false"});
        const circ = svgElement("circle", {cx: tx, cy: ty, r: 6});
        const tooltip = svgElement("title", {});
        tooltip.textContent = palavra;
        const label = svgElement("text", {x: tx, y: ty - 12, "text-anchor": "middle"});
        label.textContent = palavra.length > 20 ? palavra.slice(0, 18) + "…" : palavra;
        palavraNode.append(tooltip, circ, label);
        palavraNode.onclick = () => mostrarFiltro(palavra);
        palavraNode.onkeydown = e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mostrarFiltro(palavra); }
        };
        termos.set(palavra, {x: tx, y: ty, g: palavraNode, circ, count: 0});
        vertices.append(palavraNode);
      }
      const termo = termos.get(palavra);
      termo.count++;
      termo.circ.setAttribute("r", String(Math.min(11, 6 + Math.sqrt(termo.count))));
      const linha = svgElement("line", {x1: x, y1: y, x2: termo.x, y2: termo.y, class: "ligacao"});
      arestas.append(linha);
      ligacoes.push(linha);
    }
    vertices.prepend(g);
    registros.set(alvo.sysId, {g, palavras: exibidas.slice(0, ligacoes.length), arestas: ligacoes});
    legenda.textContent = termos.size + " termos no grafo · " + registros.size + " chamados com correspondência";
  }

  return {
    add,
    filtrar: mostrarFiltro,
    marcar(alvo, validado) {
      const no = registros.get(alvo.sysId);
      if (!no) return;
      no.g.classList.toggle("validado", validado);
      no.g.classList.toggle("pendente", !validado);
    },
    limpar() {
      termos.clear();
      registros.clear();
      arestas.replaceChildren();
      vertices.replaceChildren();
      filtro = null;
      legenda.textContent = "As conexões aparecem conforme as regras encontram correspondências.";
      aoFiltrar(null);
    },
  };
}
