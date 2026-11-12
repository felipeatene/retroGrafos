
export function lerPagina(origem, tabela, acao) {
  if (location.origin !== origem) return {estado: "Sessão expirada ou redirecionada"};
  const text = (document.title + " " + document.body?.innerText?.slice(0, 700)).toLowerCase();
  if (/\/login(?:_with_sso)?\.do|\/logout\.do/.test(location.pathname) ||
      document.querySelector("input[type=password]") || /session expired|sessão expirada/.test(text)) {
    return {estado: "Sessão expirada"};
  }
  if (/access denied|not authorized|security constraints|acesso negado|insufficient rights/.test(text)) {
    return {estado: "Acesso negado"};
  }
  const candidato = window.g_user?.userID || window.g_user?.getUserID?.() ||
    window.NOW?.user?.userID || window.NOW?.user?.sys_id;
  const usuario = /^[a-f0-9]{32}$/i.test(candidato ?? "") ? candidato : null;
  if (!tabela) return {estado: "Aberta", usuario};
  if (location.pathname !== "/" + tabela + "_list.do") return {estado: "Lista incompatível"};
  const grid = document.getElementById(tabela + "_table");
  if (!grid) {
    const vazio = /no records to display|nenhum registro para exibir/.test(text);
    return vazio ? {estado: "Lista disponível", usuario, registros: [], proxima: false}
      : {estado: "Lista indisponível", usuario};
  }
  const registros = new Map();
  for (const link of grid.querySelectorAll("a[href]")) {
    const alvo = new URL(link.href, location.href);
    const id = alvo.searchParams.get("sys_id");
    if (alvo.origin !== origem || alvo.pathname !== "/" + tabela + ".do" ||
        !/^[a-f0-9]{32}$/i.test(id ?? "") || registros.has(id)) continue;
    const linha = link.closest("tr");
    const campos = [...(linha?.querySelectorAll("td") ?? [])];
    const titulo = campos.find(td => /short_description/.test(td.getAttribute("headers") ?? ""))?.innerText;
    registros.set(id, {sysId: id, tipo: tabela, numero: link.textContent.trim(), titulo: titulo?.trim() ?? ""});
  }
  const controles = [...document.querySelectorAll(
    "[id$='_next'], [id$='_next_page'], [aria-label='Next page'], [title='Next page'], [aria-label='Próxima página']"
  )];
  const proxima = controles.find(el => !el.disabled && el.getAttribute("aria-disabled") !== "true" &&
    !el.classList.contains("disabled") && el.getClientRects().length);
  if (acao === "proxima" && proxima) proxima.click();
  return {estado: "Lista disponível", usuario, registros: [...registros.values()], proxima: !!proxima,
    pagina: location.href + "|" + [...registros.keys()].join(",")};
}

const pausa = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function aguardar(medir, aceitar, mensagem) {
  const fim = Date.now() + 15000;
  do {
    const valor = await medir();
    if (aceitar(valor)) return valor;
    await pausa(180);
  } while (Date.now() < fim);
  throw new Error(mensagem);
}

export async function sondar(tabId, origem, tabela, acao) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.pendingUrl || tab.status !== "complete") return {estado: "Carregando"};
  if (!tab.url || new URL(tab.url).origin !== origem) return {estado: "Sessão expirada ou redirecionada"};
  const [saida] = await chrome.scripting.executeScript({
    target: {tabId}, world: "MAIN", func: lerPagina, args: [origem, tabela ?? null, acao ?? null],
  });
  return saida.result;
}

export async function abrir(tabId, url, origem, {recarregar = true} = {}) {
  const anterior = await chrome.tabs.get(tabId);
  if (recarregar && anterior.url === url && anterior.status === "complete") await chrome.tabs.reload(tabId);
  else if (anterior.url !== url && anterior.pendingUrl !== url) await chrome.tabs.update(tabId, {url});
  const resultado = await aguardar(
    () => sondar(tabId, origem),
    r => r.estado !== "Carregando",
    "O ServiceNow demorou a responder.",
  );
  if (resultado.estado !== "Aberta") throw new Error(resultado.estado);
  const aba = await chrome.tabs.get(tabId);
  const destino = new URL(url);
  const atual = new URL(aba.url);
  if (destino.pathname !== atual.pathname ||
      destino.searchParams.get("sys_id") !== atual.searchParams.get("sys_id")) {
    throw new Error("O ServiceNow abriu uma página diferente da esperada.");
  }
  return resultado;
}

export async function formulario(tabId, op, args) {
  await chrome.scripting.executeScript({target: {tabId}, files: ["formulario.js"]});
  const [saida] = await chrome.scripting.executeScript({
    target: {tabId},
    func: async (nome, argumentos) => {
      try { return {valor: await globalThis.retroGrafosFormulario[nome](...argumentos)}; }
      catch (erro) { return {erro: erro.message}; }
    },
    args: [op, args],
  });
  if (!saida?.result) throw new Error("O formulário deixou de responder.");
  if (saida.result.erro) throw new Error(saida.result.erro);
  return saida.result.valor;
}
