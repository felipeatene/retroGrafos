export const TIPOS_LINO = {
  sistema: "Sistema", modulo: "Módulo", servico: "Serviço", local: "Local",
  pessoa: "Pessoa", equipe: "Equipe", data: "Data", dia: "Dia",
  identificador: "Identificador", termo: "Termo",
};

export const CAMADAS = [
  {id: "incidente", nome: "Incidentes"},
  {id: "tag", nome: "Tags"},
  {id: "grupo", nome: "Grupo de solução"},
  {id: "prioridade", nome: "Prioridade"},
  {id: "estado", nome: "Estado"},
  {id: "categoria", nome: "Categoria"},
  {id: "ic", nome: "Item de configuração"},
];

export const CAMPOS_COR = [
  {id: "tipo", nome: "Tipo de tag"},
  {id: "grupo", nome: "Grupo de solução"},
  {id: "prioridade", nome: "Prioridade"},
  {id: "estado", nome: "Estado"},
  {id: "categoria", nome: "Categoria"},
  {id: "ic", nome: "Item de configuração"},
  {id: "calor:prioridade", nome: "Calor · prioridade"},
  {id: "calor:idade", nome: "Calor · idade do chamado"},
  {id: "calor:volume", nome: "Calor · volume de ligações"},
];

export const LIMITE_NOS = 1500;
export const PALETA = ["#7dde21", "#8fb8c9", "#d4b483", "#c98b9a", "#b7a6d9", "#9dbe8c", "#d2c07a", "#7fbfb0", "#c4b49a", "#89a67a"];
export const COR_NEUTRA = "#b9d5c9";
export const COR_LINHA = "#374739";
export const COR_VERDE = "#7dde21";
export const COR_AMBAR = "#e0b15a";

const VAZIO = {
  grupo: "Sem grupo", prioridade: "Sem prioridade", estado: "Sem estado",
  categoria: "Sem categoria", ic: "Sem IC",
};
const CAMPOS = ["grupo", "prioridade", "estado", "categoria", "ic"];
const normalizar = texto => String(texto ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function filtrarVinculos(vinculos, busca = "", tipo = "") {
  const termo = normalizar(busca);
  return vinculos.filter(vinculo => (!tipo || vinculo.tag?.tipo === tipo) && normalizar(vinculo.tag?.valor).includes(termo));
}

export function agrupar(vinculos, busca = "", tipo = "") {
  const tags = new Map();
  for (const {tag, incidente, ...vinculo} of filtrarVinculos(vinculos, busca, tipo)) {
    if (!tags.has(tag.id)) tags.set(tag.id, {...tag, incidentes: new Map()});
    tags.get(tag.id).incidentes.set(incidente.id, {...incidente, idVinculo: vinculo.id, fontes: vinculo.fontes});
  }
  return [...tags.values()].sort((a, b) => b.incidentes.size - a.incidentes.size || a.valor.localeCompare(b.valor, "pt-BR"));
}

function canais(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function misturar(origem, destino, t) {
  const a = canais(origem);
  const b = canais(destino);
  return "#" + a.map((canal, i) => Math.round(canal + (b[i] - canal) * t).toString(16).padStart(2, "0")).join("");
}

export function corCalor(t) {
  const u = Math.min(1, Math.max(0, t));
  if (u <= 0.5) return misturar(COR_LINHA, COR_VERDE, u / 0.5);
  return misturar(COR_VERDE, COR_AMBAR, (u - 0.5) / 0.5);
}

export function escalaCalor(valores) {
  const numeros = valores.filter(valor => Number.isFinite(valor));
  if (!numeros.length) return {min: null, max: null, cor: () => COR_NEUTRA};
  const min = Math.min(...numeros);
  const max = Math.max(...numeros);
  return {
    min, max,
    cor(valor) {
      if (!Number.isFinite(valor)) return COR_NEUTRA;
      if (max === min) return corCalor(0.5);
      return corCalor((valor - min) / (max - min));
    },
  };
}

export function numeroPrioridade(texto) {
  if (!texto || texto === VAZIO.prioridade) return null;
  const achado = String(texto).match(/\d+/);
  return achado ? Number(achado[0]) : null;
}

export function instanteAberto(abertoEm) {
  if (!abertoEm) return null;
  const texto = String(abertoEm).trim();
  const iso = /[zZ]|[+-]\d{2}:\d{2}$/.test(texto) || texto.endsWith("Z") ? texto : texto.includes("T") ? texto + "Z" : texto.replace(" ", "T") + "Z";
  const valor = Date.parse(iso);
  return Number.isFinite(valor) ? valor : null;
}

function anel(i, total, raio) {
  const angulo = -Math.PI / 2 + (total <= 1 ? 0 : i * 2 * Math.PI / total);
  return {x: Math.cos(angulo) * raio, y: Math.sin(angulo) * raio};
}

export function rotuloCampo(incidente, camada) {
  const bruto = String(incidente?.campos?.[camada] ?? "").trim();
  return bruto || VAZIO[camada];
}

function legendaCategoria(itens) {
  return {tipo: "categorica", itens, de: null, ate: null, min: null, max: null, quenteNoMinimo: false};
}

function pintar(nos, cor, agora) {
  if (cor === "tipo") {
    const tipos = Object.keys(TIPOS_LINO).filter(tipo => nos.some(no => no.tipo === tipo));
    const mapa = new Map(tipos.map((tipo, i) => [tipo, PALETA[i % PALETA.length]]));
    for (const no of nos) no.cor = no.camada === "tag" ? mapa.get(no.tipo) || COR_NEUTRA : COR_NEUTRA;
    const itens = tipos.map(tipo => ({rotulo: TIPOS_LINO[tipo], cor: mapa.get(tipo)}));
    if (nos.some(no => no.camada === "incidente")) itens.push({rotulo: "Incidente", cor: COR_NEUTRA});
    return legendaCategoria(itens);
  }
  if (cor.startsWith("calor:")) {
    const medida = cor.slice(6);
    const bruto = new Map();
    for (const no of nos) {
      let valor = null;
      if (medida === "volume") valor = no.grau;
      else if (medida === "prioridade" && no.prioridade) {
        const numero = numeroPrioridade(no.prioridade);
        valor = numero == null ? null : numero;
      } else if (medida === "idade" && no.camada === "incidente" && no.quando != null) valor = Math.max(0, agora - no.quando);
      bruto.set(no.id, valor);
    }
    const escala = escalaCalor([...bruto.values()]);
    const prioridade = medida === "prioridade" && escala.min != null && escala.max !== escala.min;
    for (const no of nos) {
      const valor = bruto.get(no.id);
      if (!Number.isFinite(valor)) no.cor = COR_NEUTRA;
      else if (prioridade) no.cor = corCalor((escala.max - valor) / (escala.max - escala.min));
      else no.cor = escala.cor(valor);
    }
    return {tipo: "calor", itens: [], de: prioridade ? COR_AMBAR : COR_LINHA, ate: prioridade ? COR_LINHA : COR_AMBAR,
      min: escala.min, max: escala.max, quenteNoMinimo: prioridade};
  }
  const valores = [];
  for (const no of nos) {
    const valor = cor === no.camada ? no.rotulo : no[cor];
    if (!valor || valores.includes(valor)) continue;
    valores.push(valor);
  }
  const mapa = new Map(valores.map((valor, i) => [valor, PALETA[i % PALETA.length]]));
  for (const no of nos) {
    const valor = cor === no.camada ? no.rotulo : no[cor];
    no.cor = mapa.get(valor) || COR_NEUTRA;
  }
  return legendaCategoria(valores.map(valor => ({rotulo: valor, cor: mapa.get(valor)})));
}

export function projetar(vinculos, mapa = {}) {
  const vertices = mapa.vertices?.length ? [...mapa.vertices] : ["tag", "incidente"];
  const modo = mapa.arestas === "juntos" || !vertices.includes("incidente") ? "juntos" : "pertence";
  const cor = mapa.cor || "tipo";
  const ancora = mapa.ancora && vertices.includes(mapa.ancora) ? mapa.ancora : null;
  const agora = Number.isFinite(mapa.agora) ? mapa.agora : Date.now();
  const lista = filtrarVinculos(vinculos, mapa.busca || "", mapa.tipo || "");
  const nos = new Map();
  const pesos = new Map();
  const nascer = new Map();

  function no(id, campos) {
    if (!nos.has(id)) nos.set(id, {id, grau: 0, fixo: false, ancora: false, aparecerEm: null, semData: false,
      abrir: "", tagId: "", incidenteId: "", cor: COR_NEUTRA, tipo: "", prioridade: "", quando: null, ...campos});
    return nos.get(id);
  }
  function ligar(origem, destino) {
    if (!origem || !destino || origem === destino) return;
    const chave = origem < destino ? origem + "\0" + destino : destino + "\0" + origem;
    pesos.set(chave, (pesos.get(chave) || 0) + 1);
  }
  function cedo(id, tempo) {
    if (tempo == null) return;
    const atual = nascer.get(id);
    if (atual == null || tempo < atual) nascer.set(id, tempo);
  }

  const porIncidente = new Map();
  for (const vinculo of lista) {
    const incidente = vinculo.incidente || {};
    const quando = instanteAberto(incidente.abertoEm);
    const grupo = porIncidente.get(incidente.id) || {incidente, quando, tags: []};
    grupo.tags.push(vinculo.tag);
    porIncidente.set(incidente.id, grupo);
  }

  for (const grupo of porIncidente.values()) {
    const presentes = [];
    if (vertices.includes("incidente")) {
      const id = "inc:" + grupo.incidente.id;
      no(id, {camada: "incidente", rotulo: grupo.incidente.numero || "Incidente", abrir: "incidente",
        incidenteId: grupo.incidente.id, quando: grupo.quando, semData: grupo.quando == null,
        prioridade: rotuloCampo(grupo.incidente, "prioridade"),
        grupo: rotuloCampo(grupo.incidente, "grupo"), estado: rotuloCampo(grupo.incidente, "estado"),
        categoria: rotuloCampo(grupo.incidente, "categoria"), ic: rotuloCampo(grupo.incidente, "ic")});
      presentes.push(id);
      cedo(id, grupo.quando ?? 0);
    }
    if (vertices.includes("tag")) {
      for (const tag of grupo.tags) {
        const id = "tag:" + tag.id;
        no(id, {camada: "tag", rotulo: tag.valor, abrir: "tag", tagId: tag.id, tipo: tag.tipo});
        presentes.push(id);
        cedo(id, grupo.quando ?? 0);
      }
    }
    for (const campo of CAMPOS) {
      if (!vertices.includes(campo)) continue;
      const rotulo = rotuloCampo(grupo.incidente, campo);
      const id = campo + ":" + rotulo;
      no(id, {camada: campo, rotulo, [campo]: rotulo, prioridade: campo === "prioridade" ? rotulo : ""});
      presentes.push(id);
      cedo(id, grupo.quando ?? 0);
    }
    const unicos = [...new Set(presentes)];
    if (modo === "pertence") {
      const centro = unicos.find(id => id.startsWith("inc:"));
      if (centro) for (const id of unicos) ligar(centro, id);
    } else {
      const valores = unicos.filter(id => !id.startsWith("inc:"));
      for (let i = 0; i < valores.length; i++) {
        for (let j = i + 1; j < valores.length; j++) ligar(valores[i], valores[j]);
      }
    }
  }

  let arestas = [...pesos].map(([chave, peso]) => {
    const [origem, destino] = chave.split("\0");
    return {origem, destino, peso};
  });
  for (const aresta of arestas) {
    nos.get(aresta.origem).grau += aresta.peso;
    nos.get(aresta.destino).grau += aresta.peso;
  }

  let listaNos = [...nos.values()];
  const total = listaNos.length;
  let aviso = "";
  if (listaNos.length > LIMITE_NOS) {
    const mantidos = new Set([...listaNos].sort((a, b) => Number(b.camada === ancora) - Number(a.camada === ancora) || b.grau - a.grau)
      .slice(0, LIMITE_NOS).map(item => item.id));
    listaNos = listaNos.filter(item => mantidos.has(item.id));
    arestas = arestas.filter(aresta => mantidos.has(aresta.origem) && mantidos.has(aresta.destino));
    for (const item of listaNos) item.grau = 0;
    for (const aresta of arestas) {
      nos.get(aresta.origem).grau += aresta.peso;
      nos.get(aresta.destino).grau += aresta.peso;
    }
    aviso = "O grafo mostra " + LIMITE_NOS + " de " + total + " nós. Refine o filtro para ver o restante.";
  }

  const ancoras = listaNos.filter(item => item.camada === ancora);
  const livres = listaNos.filter(item => item.camada !== ancora);
  ancoras.forEach((item, i) => {
    const ponto = anel(i, ancoras.length, 240);
    item.x = ponto.x;
    item.y = ponto.y;
    item.fixo = true;
    item.ancora = true;
    item.aparecerEm = null;
  });
  livres.forEach((item, i) => {
    const ponto = anel(i, Math.max(livres.length, 1), 80 + Math.sqrt(i) * 18);
    item.x = ponto.x;
    item.y = ponto.y;
    item.aparecerEm = item.camada === "incidente"
      ? (item.quando ?? 0)
      : (nascer.get(item.id) ?? 0);
  });

  const legenda = pintar(listaNos, cor, agora);
  return {nos: listaNos, arestas, legenda, aviso, total};
}
