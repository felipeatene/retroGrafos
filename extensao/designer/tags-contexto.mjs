/**
 * Regras de tag de contexto do Lino.
 * A normalização segue o contrato já usado na extensão: [a-z0-9_], sem acento.
 * Dado sensível é descartado e só a categoria volta para a interface.
 */

export const STOPWORDS = new Set(
  [
    "a", "o", "os", "as", "um", "uma", "uns", "umas",
    "de", "da", "do", "das", "dos", "dum", "duma", "num", "numa",
    "ao", "aos", "à", "às", "pelo", "pela", "pelos", "pelas",
    "e", "ou", "mas", "que", "se", "como",
    "em", "na", "no", "nas", "nos", "para", "pra", "por", "com", "sem",
    "entre", "sobre", "ate", "apos", "ante", "sob", "desde", "via",
    "ele", "ela", "eles", "elas", "lhe", "lhes", "me", "mim", "te", "ti", "vos",
    "meu", "minha", "teu", "tua", "seu", "sua", "seus", "suas", "nosso", "nossa",
    "este", "esta", "esse", "essa", "estes", "estas", "esses", "essas",
    "isto", "isso", "aquele", "aquela", "aquilo",
    "nao", "sim", "ja", "tambem", "mais", "menos", "muito", "pouco",
    "bem", "mal", "quando", "onde", "porque", "qual", "quais",
    "cada", "todo", "toda", "todos", "todas", "outro", "outra", "outros", "outras",
    "mesmo", "mesma",
    "e", "ser", "foi", "sao", "esta", "estar", "eram", "era", "tem", "ter", "ha", "havia",
  ].map((palavra) => normalizarTag(palavra)).filter(Boolean),
);

const REGRAS_SENSIVEIS = [
  { categoria: "e-mail", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },
  { categoria: "CPF", re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g },
  { categoria: "telefone", re: /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2}\)[\s-]?)?\d{4,5}-\d{4}\b/g },
  { categoria: "token", re: /\b(?:tok_|sk_|sk-|bearer\s+)[a-z0-9_-]{8,}\b/gi },
  { categoria: "senha", re: /\b(?:senha|password|passwd|secret)\b\s*[:=]?\s*\S+/gi },
];

const TEXTO_SENSIVEL_EXEMPLO =
  "Contato user@example.com, CPF 000.000.000-00, telefone (31) 98888-7777, senha: naovalereportar, tok_demo_bloqueado.";

export function normalizarTag(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function diaDaSemana(iso) {
  const data = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  const rotulo = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(data);
  const id = normalizarTag(rotulo.split("-")[0]);
  return { id, rotulo };
}

export function separarTexto(texto, ignorados = []) {
  const lista = new Set(ignorados.map(normalizarTag).filter(Boolean));
  const bloqueios = [];
  let restante = String(texto ?? "");
  for (const regra of REGRAS_SENSIVEIS) {
    restante = restante.replace(regra.re, () => {
      bloqueios.push({ motivo: "sensivel", categoria: regra.categoria });
      return " ";
    });
  }
  const tags = [];
  const vistos = new Set();
  for (const bruto of restante.split(/[^\p{L}\p{N}]+/u)) {
    if (!bruto) continue;
    const id = normalizarTag(bruto);
    if (!id || id.length < 2) continue;
    if (STOPWORDS.has(id)) {
      bloqueios.push({ motivo: "stopword", palavra: id });
      continue;
    }
    if (lista.has(id)) {
      bloqueios.push({ motivo: "ignorado", palavra: id });
      continue;
    }
    if (vistos.has(id)) continue;
    vistos.add(id);
    tags.push({ id, rotulo: bruto.toLocaleLowerCase("pt-BR") });
  }
  return { tags, bloqueios };
}

export function exemploSensivel() {
  const { tags, bloqueios } = separarTexto(TEXTO_SENSIVEL_EXEMPLO);
  const categorias = [...new Set(bloqueios.filter((b) => b.motivo === "sensivel").map((b) => b.categoria))];
  return { categorias, tags };
}

function acrescentar(tags, bloqueios, vistos, ignorados, item) {
  if (!item.id) return;
  if (ignorados.has(item.id) || STOPWORDS.has(item.id)) {
    bloqueios.push({
      motivo: ignorados.has(item.id) ? "ignorado" : "stopword",
      palavra: item.id,
    });
    return;
  }
  if (vistos.has(item.id)) return;
  vistos.add(item.id);
  tags.push(item);
}

export function montarChamado(base, ignorados = []) {
  const lista = new Set(ignorados.map(normalizarTag).filter(Boolean));
  const extraido = separarTexto(base.descricao, [...lista]);
  const tags = [];
  const bloqueios = [...extraido.bloqueios];
  const vistos = new Set();
  for (const palavra of extraido.tags) {
    acrescentar(tags, bloqueios, vistos, lista, {
      id: palavra.id,
      rotulo: palavra.rotulo,
      tipo: palavra.id === "demo" ? "conjunto" : "situacao",
      exemplo: false,
      detalhe: palavra.id === "demo" ? "Prefixo [DEMO] da lista" : "Descrição",
    });
  }
  for (const contexto of base.contextos ?? []) {
    acrescentar(tags, bloqueios, vistos, lista, {
      id: contexto.id,
      rotulo: contexto.rotulo,
      tipo: contexto.tipo,
      exemplo: Boolean(contexto.exemplo),
      detalhe: contexto.detalhe ?? "",
    });
  }
  for (const id of base.existentes ?? []) {
    acrescentar(tags, bloqueios, vistos, lista, {
      id,
      rotulo: id,
      tipo: "existente",
      exemplo: false,
      detalhe: "Tag já vista na lista do ServiceNow",
    });
  }
  return {
    numero: base.numero,
    descricao: base.descricao,
    abertoEm: base.abertoEm ?? null,
    prioridade: base.prioridade ?? null,
    estado: base.estado ?? null,
    categoria: base.categoria ?? null,
    atualizadoEm: base.atualizadoEm ?? null,
    atualizadoPor: base.atualizadoPor ?? null,
    tags,
    bloqueios,
  };
}

export function criarExemplosDemo(ignorados = []) {
  const dia = diaDaSemana("2026-10-09");
  const sessao = {
    descricao: "[DEMO] Erro ao renovar sessão",
    existentes: ["erro_sessao"],
  };
  const protocolos = {
    descricao: "[DEMO] Tempo limite ao consultar protocolos",
    existentes: ["timeout_protocolos"],
  };
  const registros = [
    {
      ...sessao,
      numero: "DEMO20261004003",
      abertoEm: "2026-10-09 02:00:00",
      prioridade: "4 - Low",
      estado: "Resolved",
      categoria: "Inquiry",
      atualizadoEm: "2026-11-11 14:44:21",
      atualizadoPor: "admin",
      contextos: [
        { id: "2026_10_09", rotulo: "09/10/2026", tipo: "data", detalhe: "Data de abertura", exemplo: false },
        { id: dia.id, rotulo: dia.rotulo, tipo: "dia", detalhe: "Dia da abertura", exemplo: false },
        { id: "admin", rotulo: "admin", tipo: "pessoa", detalhe: "Quem atualizou o registro", exemplo: false },
        { id: "agencia_bh_centro", rotulo: "Agência BH Centro", tipo: "local", detalhe: "Local", exemplo: true },
        { id: "portal_do_cliente", rotulo: "Portal do cliente", tipo: "sistema", detalhe: "Sistema que abriu", exemplo: true },
        { id: "marina_costa", rotulo: "Marina Costa", tipo: "pessoa", detalhe: "Nome da pessoa", exemplo: true },
      ],
    },
    { ...sessao, numero: "DEMO20261004002" },
    { ...sessao, numero: "DEMO20261004001" },
    { ...protocolos, numero: "DEMO20261003008" },
    { ...protocolos, numero: "DEMO20261003007" },
    { ...protocolos, numero: "DEMO20261003006" },
  ];
  return registros.map((registro) => montarChamado(registro, ignorados));
}

export function aplicarRemocoes(chamados, removidas) {
  const fora = new Set(removidas);
  return chamados.map((chamado) => ({
    ...chamado,
    tags: chamado.tags.filter((tag) => !fora.has(tag.id)),
  }));
}

export function chamadosComTag(chamados, tagId) {
  return chamados.filter((chamado) => chamado.tags.some((tag) => tag.id === tagId));
}
