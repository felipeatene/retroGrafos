export const TIPOS_LINO = {
  sistema: "Sistema", modulo: "Módulo", servico: "Serviço", local: "Local",
  pessoa: "Pessoa", equipe: "Equipe", data: "Data", dia: "Dia",
  identificador: "Identificador", termo: "Termo",
};

const normalizar = texto => texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const NS = "http://www.w3.org/2000/svg";

export function agrupar(vinculos, busca = "", tipo = "") {
  const tags = new Map();
  const termo = normalizar(busca);
  for (const {tag, incidente, ...vinculo} of vinculos) {
    if (tipo && tag.tipo !== tipo || !normalizar(tag.valor).includes(termo)) continue;
    if (!tags.has(tag.id)) tags.set(tag.id, {...tag, incidentes: new Map()});
    tags.get(tag.id).incidentes.set(incidente.id, {...incidente, idVinculo: vinculo.id, fontes: vinculo.fontes});
  }
  return [...tags.values()].sort((a, b) => b.incidentes.size - a.incidentes.size || a.valor.localeCompare(b.valor, "pt-BR"));
}

function figura(nome, atributos) {
  const node = document.createElementNS(NS, nome);
  for (const [chave, valor] of Object.entries(atributos)) node.setAttribute(chave, valor);
  return node;
}

function no({x, y, raio, classe, rotulo, dica, abrir, duploClique}) {
  const grupo = figura("g", {class: classe, tabindex: 0, role: "button", "aria-label": dica});
  const titulo = figura("title", {});
  titulo.textContent = dica;
  grupo.append(titulo, figura("circle", {cx: x, cy: y, r: raio}));
  if (rotulo) {
    const texto = figura("text", {x, y: y - raio - 6, "text-anchor": "middle", class: "rotulo-grafo"});
    texto.textContent = rotulo.length > 17 ? rotulo.slice(0, 16) + "…" : rotulo;
    grupo.append(texto);
  }
  grupo.addEventListener(duploClique ? "dblclick" : "click", abrir);
  if (duploClique) grupo.addEventListener("click", e => { if (e.detail === 0 || e.pointerType === "touch") abrir(); });
  grupo.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
  });
  return grupo;
}

function elipse(i, total, raioX, raioY) {
  const angulo = -Math.PI / 2 + i * 2 * Math.PI / total;
  return {x: 270 + Math.cos(angulo) * raioX, y: 175 + Math.sin(angulo) * raioY};
}

export function desenhar(svg, tags, abrirTag, abrirIncidente) {
  const arestas = figura("g", {"aria-hidden": "true"});
  const vertices = figura("g", {});
  const visiveis = tags.slice(0, 8);
  const incidentes = new Map();
  // Round robin keeps a frequent tag from taking every position in the visual sample.
  const listas = visiveis.map(tag => [...tag.incidentes.values()]);
  const maximo = Math.max(0, ...listas.map(lista => lista.length));
  for (let pos = 0; pos < maximo && incidentes.size < 14; pos++) {
    for (const lista of listas) {
      const incidente = lista[pos];
      if (incidente) incidentes.set(incidente.id, incidente);
      if (incidentes.size === 14) break;
    }
  }
  const pontos = new Map();
  [...incidentes.values()].forEach((incidente, i) => {
    const pos = elipse(i, incidentes.size, 209, 139);
    pontos.set(incidente.id, pos);
    vertices.append(no({...pos, raio: 7, classe: "no-incidente",
      dica: "Abrir incidente " + incidente.numero, abrir: () => abrirIncidente(incidente)}));
  });
  visiveis.forEach((tag, i) => {
    const pos = i === 0 ? {x: 270, y: 175} : elipse(i - 1, visiveis.length - 1, 136, 91);
    for (const id of tag.incidentes.keys()) {
      const destino = pontos.get(id);
      if (destino) arestas.append(figura("path", {class: "aresta",
        d: "M" + pos.x + " " + pos.y + " Q270 175 " + destino.x + " " + destino.y}));
    }
    vertices.append(no({...pos, raio: Math.min(17, 10 + Math.sqrt(tag.incidentes.size)), classe: "no-tag",
      dica: tag.valor + ", " + tag.incidentes.size + " incidentes. Abrir detalhes.", rotulo: tag.valor,
      abrir: () => abrirTag(tag), duploClique: true}));
  });
  svg.replaceChildren(arestas, vertices);
}
