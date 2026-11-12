
export const LIMITE = 25;
export function lotePermitido(total) {
  return Number.isInteger(total) && total >= 1 && total <= LIMITE;
}
export const MARCADOR = "retrografos_validado";
const tabelas = "incident|problem|change_request";

export function consultaURL(valor, origem) {
  let url = new URL(valor);
  if (url.origin !== origem || url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Use uma URL HTTPS da instância configurada.");
  }
  const prefixo = "/now/nav/ui/classic/params/target/";
  if (url.pathname.startsWith(prefixo)) {
    const alvo = decodeURIComponent(url.pathname.slice(prefixo.length));
    if (!new RegExp("^/?(?:" + tabelas + ")_list\\.do(?:\\?|$)").test(alvo)) {
      throw new Error("Abra uma lista clássica do ServiceNow.");
    }
    const interna = new URL(alvo.replace(/^\//, ""), origem + "/");
    for (const [chave, valor] of url.searchParams) {
      if (!interna.searchParams.has(chave)) interna.searchParams.set(chave, valor);
    }
    url = interna;
  }
  const tabela = new RegExp("^/(" + tabelas + ")_list\\.do$").exec(url.pathname)?.[1];
  if (!tabela) throw new Error("Use a URL de uma lista de incidentes, problemas ou mudanças.");
  const query = url.searchParams.get("sysparm_query") ?? "";
  url.searchParams.set("sysparm_first_row", "1");
  return {url: url.href, tabela, query, semFiltro: !query.split("^").some(p => p.trim() && !/^ORDERBY(?:DESC)?/i.test(p))};
}

export function registroURL(origem, tabela, id) {
  if (!new RegExp("^(?:" + tabelas + ")$").test(tabela) || !/^[a-f0-9]{32}$/i.test(id)) {
    throw new Error("Identificador de registro inválido.");
  }
  return origem + "/" + tabela + ".do?sys_id=" + id;
}

export function revisao(anterior, sugestoes, tagsAtuais, dias, agora = Date.now()) {
  const vencida = !!anterior?.revisadoEm && agora >= anterior.revisadoEm + dias * 86400000;
  const desejadas = new Set(sugestoes.map(s => s.tag));
  const retirar = vencida ? (anterior.proprias ?? []).filter(t =>
    t !== MARCADOR && tagsAtuais.includes(t) && !desejadas.has(t)) : [];
  return {vencida, retirar};
}

export async function processarRegistro(acesso, plano, anterior, manual = false, salvarProgresso = async () => {}) {
  const {adicionar, retirar} = plano;
  let atual = await acesso.conferir();
  const erros = [];
  const candidatas = [];
  const remocoes = [];
  if (!manual) {
    for (const tag of adicionar.filter(t => !atual.tags.includes(t))) {
      const resultado = await acesso.adicionar(tag);
      if (resultado.estado === "adicionada") candidatas.push(tag);
      if (resultado.estado === "falhou") erros.push(tag + " · " + resultado.motivo);
    }
    for (const tag of retirar.filter(t => atual.tags.includes(t))) {
      const resultado = await acesso.retirar(tag);
      if (resultado.estado === "retirada") remocoes.push(tag);
      if (resultado.estado === "falhou") erros.push(tag + " · " + resultado.motivo);
    }
  }
  if (adicionar.length || retirar.length) atual = await acesso.conferir(true);
  const proprias = [...new Set([...(anterior?.proprias ?? []), ...candidatas])].filter(t => atual.tags.includes(t));
  const faltam = adicionar.filter(t => !atual.tags.includes(t));
  const sobram = retirar.filter(t => atual.tags.includes(t));
  const gravou = candidatas.some(t => atual.tags.includes(t)) ||
    remocoes.some(t => !atual.tags.includes(t));
  if (faltam.length || sobram.length) {
    return {status: "Pendente", faltam, sobram, erros, proprias, gravou};
  }
  await salvarProgresso({status: "Pendente · conferindo marcador", proprias, faltam, sobram, erros, gravou,
    revisadoEm: anterior?.revisadoEm});
  if (!atual.tags.includes(MARCADOR) && atual.disponivel) {
    const marcador = await acesso.adicionar(MARCADOR);
    if (marcador.estado === "falhou") erros.push(MARCADOR + " · " + marcador.motivo);
    atual = await acesso.conferir(true);
    if (marcador.estado === "adicionada" && atual.tags.includes(MARCADOR)) {
      return {status: "Validado", faltam, sobram, erros, proprias, gravou: true, revisadoEm: Date.now()};
    }
  }
  const validado = atual.tags.includes(MARCADOR);
  return {status: validado ? "Validado" : "Conferido · marcador pendente",
    faltam, sobram, erros, proprias, gravou, revisadoEm: Date.now()};
}
