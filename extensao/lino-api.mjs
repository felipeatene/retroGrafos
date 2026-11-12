const ID = /^[a-f0-9]{32}$/i;

// Executed in the authenticated tab. The CSRF token stays in the page.
export async function serviceNow(origem, rota, opcoes = {}) {
  if (location.origin !== origem) return {status: 401};
  const docs = [document];
  const quadro = document.querySelector("iframe#gsft_main, iframe[name='gsft_main']");
  try {
    if (quadro?.contentDocument && quadro.contentDocument.location.origin === origem) docs.unshift(quadro.contentDocument);
  } catch { /* The frame belongs to a different origin. */ }
  const login = docs.some(doc => /\/login(?:_with_sso)?\.do|\/logout\.do/.test(doc.location.pathname) ||
    doc.querySelector("input[type=password]"));
  if (login) return {status: 401};

  if (rota === "contexto") {
    for (const doc of docs) {
      const url = new URL(doc.URL);
      const id = url.searchParams.get("sys_id")?.toLowerCase();
      const campo = nome => doc.getElementById("incident." + nome) ||
        doc.getElementById("sys_readonly.incident." + nome);
      const valor = nome => (campo(nome)?.value ?? campo(nome)?.textContent ?? "").trim();
      if (url.pathname === "/incident.do" && /^[a-f0-9]{32}$/.test(id ?? "") && valor("number")) {
        return {status: 200, dados: {tipo: "incidente", id, numero: valor("number"), titulo: valor("short_description")}};
      }
      if (url.pathname === "/incident_list.do") {
        const registros = new Map();
        for (const link of doc.querySelectorAll("#incident_table a[href]")) {
          const alvo = new URL(link.href, url);
          const sysId = alvo.searchParams.get("sys_id")?.toLowerCase();
          if (alvo.origin !== origem || alvo.pathname !== "/incident.do" || !/^[a-f0-9]{32}$/.test(sysId ?? "")) continue;
          const linha = link.closest("tr");
          if (!linha || !link.textContent.trim() || registros.has(sysId)) continue;
          const titulo = [...linha.cells].find(td => /short_description/.test(td.getAttribute("headers") ?? ""));
          registros.set(sysId, {id: sysId, numero: link.textContent.trim(), titulo: titulo?.innerText.trim() ?? ""});
        }
        return {status: 200, dados: {tipo: "lista", registros: [...registros.values()]}};
      }
      if (/^\/(problem|change_request)(?:_list)?\.do$/.test(url.pathname)) return {status: 200, dados: {tipo: "legado"}};
    }
    return {status: 200, dados: {tipo: "incompativel"}};
  }

  const url = new URL("/api/global/lino/" + rota, origem);
  for (const [chave, valor] of Object.entries(opcoes.parametros ?? {})) url.searchParams.set(chave, valor);
  const headers = {"Accept": "application/json"};
  const token = docs.map(doc => doc.defaultView?.g_ck).find(valor => typeof valor === "string" && valor);
  if (token) headers["X-UserToken"] = token;
  if (opcoes.usuario) headers["X-Lino-User"] = opcoes.usuario;
  if (opcoes.corpo) headers["Content-Type"] = "application/json";
  const resposta = await fetch(url, {
    method: opcoes.corpo ? "POST" : "GET",
    credentials: "same-origin", redirect: "manual", cache: "no-store", headers,
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  if (resposta.type === "opaqueredirect") return {status: 401};
  const dados = resposta.headers.get("content-type")?.includes("application/json") ? await resposta.json() : null;
  if (resposta.ok && !dados) return {status: 502};
  return {status: resposta.status, dados: dados?.result ?? dados};
}

export async function chamar(sessao, rota, opcoes) {
  if (rota === "contexto") {
    const [resposta] = await chrome.scripting.executeScript({target: {tabId: sessao.tabId},
      func: async origem => {
        const {classificarTela, contextoAPI} = await import(chrome.runtime.getURL('mascote-contexto.mjs'));
        return contextoAPI(classificarTela(document, location.href, origem));
      }, args: [sessao.origem]});
    if (resposta.result?.motivo === 'sessao') throw Object.assign(new Error('Sessão encerrada.'), {status: 401});
    if (resposta.result?.motivo === 'acesso') throw Object.assign(new Error('Acesso negado.'), {status: 403});
    return resposta.result;
  }

  const resposta = await chrome.scripting.executeScript({
    target: {tabId: sessao.tabId}, world: "MAIN", func: serviceNow,
    args: [sessao.origem, rota, {...opcoes, usuario: sessao.usuario}],
  });
  const valor = resposta[0]?.result;
  if (!valor || valor.status !== 200) throw Object.assign(new Error("O ServiceNow não concluiu a solicitação."), {status: valor?.status});
  return valor.dados;
}

export async function coletar(pagina) {
  const itens = [];
  let cursor = "";
  do {
    const atual = await pagina(cursor);
    if (!Array.isArray(atual?.itens) || atual.proximo && (!ID.test(atual.proximo) || atual.proximo <= cursor)) {
      throw new Error("A paginação do ServiceNow retornou um resultado inválido.");
    }
    itens.push(...atual.itens);
    cursor = atual.proximo;
  } while (cursor);
  return itens;
}

export function chavePreferencias(origem, usuario) {
  if (!ID.test(usuario)) throw new Error("A sessão do ServiceNow mudou.");
  return "lino:ignorados:" + new URL(origem).origin + ":" + usuario.toLowerCase();
}

export function preferencias(sessao, armazenamento = chrome.storage.local) {
  const chave = chavePreferencias(sessao.origem, sessao.usuario);
  return {
    async ler() {
      const dados = (await armazenamento.get(chave))[chave];
      return Array.isArray(dados) ? dados : [];
    },
    async salvar(itens) {
      await armazenamento.set({[chave]: itens});
    },
  };
}
