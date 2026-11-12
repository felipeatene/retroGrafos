import {mensagensPainel} from "./mensagens-painel.mjs";

import {CAMPOS, configuracao, origemHttps, sugerir, validarLista} from "./regras.mjs";
import {consultaURL, registroURL, LIMITE, lotePermitido, MARCADOR, revisao, processarRegistro} from "./lote.mjs";
import {emGrupos, SIMULTANEOS} from "./grupos.mjs";
import {criarGrafo, palavrasDaLinha} from "./grafo.mjs";
import {abrir, aguardar, formulario, sondar} from "./navegacao.mjs";

const el = id => document.getElementById(id);
let config, origem, consulta, pagina, listaTab, usuario, abaLogin;
const abasTrabalho = [];
let abaAlvo;
chrome.tabs.query({active: true, currentWindow: true}).then(([aba]) => { abaAlvo = aba?.id; });
const comunicar = mensagensPainel("legado", () => abaAlvo);
let filtro = null;
let linhas = [];
let ocupado = false;
const status = texto => { el("estado").textContent = texto; };
const etapa = nome => document.querySelectorAll("[data-etapa]").forEach(s => {
  if (s.dataset.etapa === nome) s.setAttribute("aria-current", "step");
  else s.removeAttribute("aria-current");
});
etapa("consulta");
const grafo = criarGrafo(el("grafo"), el("grafo-legenda"), termo => {
  filtro = termo;
  el("filtro").hidden = !termo;
  el("filtro").textContent = termo ? "Limpar filtro: " + termo : "";
  for (const linha of linhas) linha.card.hidden = !!termo && !linha.palavras.includes(termo);
});
el("filtro").onclick = () => grafo.filtrar(filtro);
el('expandir-legado').onclick = async () => {
  const dados = linhas.flatMap(linha => linha.palavras.map(palavra => ({
    id: linha.alvo.sysId + ':' + palavra, tag: {id: palavra, tipo: 'termo', valor: palavra},
    incidente: {id: linha.alvo.sysId, tabela: linha.alvo.tipo, numero: linha.alvo.numero, titulo: linha.alvo.titulo}
  })));
  const resposta = await chrome.runtime.sendMessage({tipo: 'lino:expandir', fluxo: 'legado', dados});
  if (resposta?.erro) status(resposta.erro);
};

function progresso(acao, feitos, total, falhas = 0) {
  el("mapa-processamento").hidden = false;
  comunicar({etapa: /Analisando/.test(acao) ? 'revisao' : 'resultado',
    estado: feitos < total ? 'ativo' : falhas ? 'erro' : 'concluido',
    texto: feitos < total ? acao + '…' : falhas ? falhas + ' registros precisam de atenção.' : 'Lote conferido. Veja o resultado em cada registro.',
    feitos, total, acao: falhas ? {rotulo: 'Analisar consulta', comando: 'analisar'} : undefined});
}

const interromper = erro => /sessão|redirecionada|usuário.*mudou/i.test(erro.message);

async function comRegistro(alvo, vaga, executar) {
  const url = registroURL(origem, alvo.tipo, alvo.sysId);
  const tabId = await aba(abasTrabalho[vaga], url);
  abasTrabalho[vaga] = tabId;
  try {
    const sonda = await abrir(tabId, url, origem, {recarregar: false});
    await verificarSessao(tabId, usuario, sonda);
    return await executar(tabId);
  } catch (erro) {
    if (interromper(erro)) abaLogin = tabId;
    throw erro;
  }
}

function elemento(tipo, texto, classe) {
  const e = document.createElement(tipo);
  if (texto) e.textContent = texto;
  if (classe) e.className = classe;
  return e;
}

function selecionadas(linha) {
  return {
    adicionar: linha.opcoes.filter(o => o.acao === "adicionar" && o.input.checked).map(o => o.tag),
    retirar: linha.opcoes.filter(o => o.acao === "retirar" && o.input.checked).map(o => o.tag),
  };
}

function atualizar() {
  const total = linhas.filter(l => l.selecao?.checked).length;
  el("selecao").textContent = total + " de " + LIMITE + " selecionados";
  el("aplicar").disabled = ocupado || !lotePermitido(total);
  el("analisar").disabled = ocupado || !config;
  el("usar").disabled = ocupado;
  el("proxima").disabled = ocupado;
  el("registros").querySelectorAll("input, button").forEach(i => { i.disabled = ocupado; });
}
function atividade(valor) { ocupado = valor; atualizar(); }

async function aba(id, url) {
  if (id !== undefined) {
    try { await chrome.tabs.get(id); return id; } catch { /* Aba fechada. */ }
  }
  const nova = await chrome.tabs.create({url: "about:blank", active: false});
  await chrome.runtime.sendMessage({tipo: 'lino:trabalho', tabId: nova.id});
  await chrome.tabs.update(nova.id, {url});
  return nova.id;
}

function falha(erro) {
  status(erro.message);
  if (!el("mapa-processamento").hidden) comunicar({etapa: "resultado", estado: "erro", texto: "Processamento interrompido. Confira os registros antes de repetir.", acao: {rotulo: "Analisar consulta", comando: "analisar"}});
  if (/sessão|redirecionada/i.test(erro.message)) {
    el("sessao").textContent = "Expirada ou redirecionada";
    el("login").hidden = false;
  } else if (/acesso negado/i.test(erro.message)) {
    el("leitura").textContent = "Acesso negado";
  }
}

function guardarChave(alvo) {
  return "revisao:" + [origem, usuario, alvo.tipo, alvo.sysId].join("|");
}
async function lerHistorico(alvo) {
  const chave = guardarChave(alvo);
  return (await chrome.storage.local.get(chave))[chave];
}
async function registrar(alvo, resultado) {
  await chrome.storage.local.set({[guardarChave(alvo)]: resultado});
}

async function verificarSessao(tabId, esperado = usuario, sonda = null) {
  sonda ??= await sondar(tabId, origem);
  if (sonda.estado !== "Aberta") throw new Error(sonda.estado);
  if (!sonda.usuario) throw new Error("Não foi possível identificar o usuário da sessão do ServiceNow.");
  esperado ??= usuario;
  if (esperado && esperado !== sonda.usuario) throw new Error("O usuário da sessão mudou. Analise a consulta novamente.");
  usuario ??= sonda.usuario;
  el("sessao").textContent = "Identificada na instância";
  el("login").hidden = true;
  return sonda.usuario;
}

function controle(tabId, alvo, nomes) {
  const args = [origem, alvo];
  return {
    async conferir(reabrir = false) {
      if (reabrir) await abrir(tabId, registroURL(origem, alvo.tipo, alvo.sysId), origem);
      await verificarSessao(tabId);
      return formulario(tabId, "conferir", [...args, nomes]);
    },
    async adicionar(tag) {
      await verificarSessao(tabId);
      const [resultado] = await formulario(tabId, "aplicar", [...args, [tag]]);
      return resultado;
    },
    async retirar(tag) {
      await verificarSessao(tabId);
      return formulario(tabId, "retirar", [...args, tag]);
    },
  };
}

function linhaUI(alvo, tarefa, sugestoes, anterior, conferencia) {
  const card = elemento("article", "", "card registro");
  const body = elemento("div", "", "card-body py-2");
  const numero = elemento("a", alvo.numero, "fw-semibold");
  numero.href = registroURL(origem, alvo.tipo, alvo.sysId);
  numero.target = "_blank";
  numero.title = "Abrir registro";
  numero.rel = "noopener";
  const titulo = elemento("p", tarefa?.campos.short_description ?? alvo.titulo ?? "", "mb-2 small");
  const informacao = elemento("p", "", "small mb-2");
  const caixa = elemento("label", "", "form-check small mb-2");
  const selecao = elemento("input", "", "form-check-input");
  selecao.type = "checkbox";
  caixa.append(selecao, document.createTextNode(" Incluir no lote"));
  const opcoes = [];
  body.append(numero, titulo, informacao, caixa);
  const aval = revisao(anterior, sugestoes, conferencia.tags, config.prazoDias ?? 30);
  if (aval.vencida) body.append(elemento("p", "Reanálise vencida", "badge text-bg-warning"));
  function opcao(tag, acao, motivos) {
    const rotulo = elemento("label", "", "form-check small");
    const input = elemento("input", "", "form-check-input");
    input.type = "checkbox";
    rotulo.append(input, document.createTextNode((acao === "retirar" ? "Retirar " : "Adicionar ") + tag));
    if (motivos?.length) rotulo.append(elemento("small",
      motivos.map(m => CAMPOS[m.campo] + " · " + m.termo).join(" / "), "d-block text-secondary"));
    body.append(rotulo);
    opcoes.push({input, tag, acao});
  }
  for (const sugestao of sugestoes) opcao(sugestao.tag, "adicionar", sugestao.motivos);
  for (const tag of aval.retirar) opcao(tag, "retirar");
  if (!opcoes.length) caixa.hidden = true;
  const botoes = elemento("div", "", "d-flex flex-wrap gap-2 mt-2");
  const copiar = elemento("button", "Copiar tags", "btn btn-outline-secondary btn-sm");
  const conferir = elemento("button", "Conferir novamente", "btn btn-outline-secondary btn-sm");
  const reanalisar = elemento("button", "Reanalisar", "btn btn-outline-secondary btn-sm");
  const abrirRegistro = elemento("a", "Abrir registro", "btn btn-outline-secondary btn-sm");
  abrirRegistro.href = numero.href;
  abrirRegistro.target = "_blank";
  abrirRegistro.rel = "noopener";
  botoes.append(abrirRegistro, copiar, conferir, reanalisar);
  body.append(botoes);
  card.append(body);
  el("registros").append(card);
  const palavras = palavrasDaLinha(sugestoes);
  card.hidden = !!filtro && !palavras.includes(filtro);
  const linha = {alvo, card, selecao, opcoes, informacao, anterior, palavras, sugestoes};
  card.addEventListener("change", atualizar);
  copiar.onclick = async () => {
    const {adicionar, retirar} = selecionadas(linha);
    const texto = [
      ...adicionar.map(t => "Adicionar: " + t),
      ...retirar.map(t => "Retirar: " + t),
    ].join("\n");
    if (!texto) { informacao.textContent = "Selecione as tags que deseja copiar."; return; }
    try {
      await navigator.clipboard.writeText(texto);
      informacao.textContent = "Tags copiadas. Abra o registro e use ⋯ → Tags → Add Tag.";
    } catch { informacao.textContent = texto; }
  };
  conferir.onclick = () => rodar([linha], true);
  reanalisar.onclick = async () => {
    if (ocupado) return;
    atividade(true);
    try {
      config = await configuracao();
      if (origemHttps(config.origem) !== origem) throw new Error("A instância configurada mudou. Faça uma nova consulta.");
      await montarLinha(alvo, linha);
    } catch (erro) { falha(erro); }
    finally { atividade(false); }
  };
  informacao.textContent = conferencia.disponivel !== false
    ? (anterior?.status ?? (sugestoes.length ? "Pronto para revisão" : "Sem correspondências"))
    : "Add Tag indisponível. Abra o registro e, se necessário, encaminhe as tags a alguém com permissão.";
  return linha;
}

async function analisarLinha(alvo, vaga, regras) {
  return comRegistro(alvo, vaga, async tabId => {
    const tarefa = await formulario(tabId, "analisar", [origem, Object.keys(CAMPOS)]);
    if (tarefa.sysId !== alvo.sysId || tarefa.tipo !== alvo.tipo) {
      throw new Error("O registro retornado não é o solicitado.");
    }
    const atual = {...alvo, numero: tarefa.numero};
    const sugestoes = sugerir(tarefa, regras).filter(s => s.tag !== MARCADOR);
    const anterior = await lerHistorico(atual);
    const vencida = revisao(anterior, sugestoes, [], config.prazoDias ?? 30).vencida;
    const conferencia = vencida && anterior?.proprias?.length && tarefa.tagsDisponiveis
      ? await controle(tabId, atual, anterior.proprias).conferir()
      : {disponivel: tarefa.tagsDisponiveis, tags: []};
    return {alvo: atual, tarefa, sugestoes, anterior, conferencia};
  });
}

function apresentar(dados) {
  return linhaUI(dados.alvo, dados.tarefa, dados.sugestoes, dados.anterior, dados.conferencia);
}

async function montarLinha(alvo, substituir) {
  const dados = await analisarLinha(alvo, 0, validarLista(config.lista));
  const linha = apresentar(dados);
  substituir.card.replaceWith(linha.card);
  linhas[linhas.indexOf(substituir)] = linha;
  grafo.limpar();
  for (const item of linhas) grafo.add(item.alvo, item.palavras);
}

async function mostrarPagina(registros) {
  linhas = [];
  grafo.limpar();
  el("registros").replaceChildren();
  el("revisao").hidden = el("barra").hidden = true;
  if (!registros.length) {
    el("mapa-processamento").hidden = true;
    status("Consulta sem registros acessíveis.");
    return;
  }
  etapa("revisao");
  status("A revisão ficará disponível ao final da análise.");
  const regras = validarLista(config.lista);
  let feitos = 0, falhas = 0;
  progresso("Analisando registros", feitos, registros.length);
  const resultados = await emGrupos(registros, (alvo, vaga) => analisarLinha(alvo, vaga, regras),
    resultado => {
      if (resultado.erro) falhas++;
      else grafo.add(resultado.valor.alvo, palavrasDaLinha(resultado.valor.sugestoes));
      progresso("Analisando registros", ++feitos, registros.length, falhas);
    }, interromper);
  for (const [i, resultado] of resultados.entries()) {
    if (resultado.valor) linhas.push(apresentar(resultado.valor));
    else {
      const linha = linhaUI(registros[i], null, [], null, {tags: [], disponivel: false});
      linha.informacao.textContent = resultado.erro.message;
      linhas.push(linha);
    }
  }
  el("gravacao").textContent = resultados.some(r => r.valor?.conferencia.disponivel)
    ? "Add Tag disponível · aguardando gravação" : "Add Tag indisponível nos formulários lidos";
  el("revisao").hidden = el("barra").hidden = false;
  status("Revise as sugestões antes de aplicar as tags.");
}

function origemPermitida(url) {
  return chrome.permissions.request({origins: [url + "/*"]});
}

el("configurar").onclick = () => chrome.runtime.openOptionsPage();
el("entrar").onclick = async () => {
  for (const id of [abaLogin, ...abasTrabalho, listaTab]) {
    if (id === undefined) continue;
    try { await chrome.tabs.update(id, {active: true}); return; } catch { /* Aba fechada. */ }
  }
};
el("usar").onclick = async () => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (tab?.url) el("url").value = tab.url;
  else status("Cole a URL da lista ou do registro.");
};

el("consulta").onsubmit = async evento => {
  evento.preventDefault();
  if (ocupado || !config) return;
  atividade(true);
  try {
    origem = origemHttps(config.origem);
    const entrada = el("url").value;
    let alvo;
    try { consulta = consultaURL(entrada, origem); }
    catch (erro) {
      const u = new URL(entrada);
      const prefixo = "/now/nav/ui/classic/params/target/";
      const interno = u.pathname.startsWith(prefixo)
        ? new URL(decodeURIComponent(u.pathname.slice(prefixo.length)).replace(/^\//, ""), origem + "/")
        : u;
      const tipo = /^\/(incident|problem|change_request)\.do$/.exec(interno.pathname)?.[1];
      const sysId = interno.searchParams.get("sys_id") ?? u.searchParams.get("sys_id");
      if (u.origin !== origem || u.username || u.password || !tipo || !/^[a-f0-9]{32}$/i.test(sysId ?? "")) throw erro;
      alvo = {tipo, sysId, numero: "", titulo: ""};
      consulta = null;
    }
    if (!await origemPermitida(origem)) throw new Error("Autorize o acesso à instância para analisar a consulta.");
    usuario = null;
    abaLogin = undefined;
    el("mapa-processamento").hidden = true;
    pagina = null;
    el("proxima").hidden = true;
    el("revisao").hidden = el("barra").hidden = true;
    el("sessao").textContent = el("gravacao").textContent = el("leitura").textContent = "A verificar";
    etapa("acesso");
    el("query").hidden = false;
    el("query").textContent = consulta
      ? (consulta.semFiltro ? "Sem filtro de registros. Selecione cada item explicitamente.\n" : "") + (consulta.query || "Todos os registros")
      : "Registro individual";
    if (alvo) {
      await mostrarPagina([alvo]);
      if (linhas.length) el("leitura").textContent = "Registro acessível";
    } else {
      const listaExistente = listaTab;
      listaTab = await aba(listaTab, consulta.url);
      await abrir(listaTab, consulta.url, origem, {recarregar: listaTab === listaExistente});
      pagina = await aguardar(() => sondar(listaTab, origem, consulta.tabela),
        r => r.estado !== "Carregando" && r.estado !== "Lista indisponível", "A lista não ficou disponível.");
      if (pagina.estado !== "Lista disponível") throw new Error(pagina.estado);
      usuario = pagina.usuario;
      if (usuario) el("sessao").textContent = "Identificada na instância";
      el("leitura").textContent = "Lista acessível";
      await mostrarPagina(pagina.registros);
      el("proxima").hidden = !pagina.proxima;
    }
  } catch (erro) { falha(erro); }
  finally { atividade(false); }
};

el("proxima").onclick = async () => {
  if (ocupado || !pagina?.proxima) return;
  atividade(true);
  try {
    const sessaoLista = await sondar(listaTab, origem);
    if (sessaoLista.estado !== "Aberta") throw new Error(sessaoLista.estado);
    if (sessaoLista.usuario && usuario && sessaoLista.usuario !== usuario) throw new Error("O usuário da sessão mudou. Analise a consulta novamente.");
    const anterior = pagina.pagina;
    await sondar(listaTab, origem, consulta.tabela, "proxima");
    pagina = await aguardar(() => sondar(listaTab, origem, consulta.tabela),
      r => (r.estado === "Lista disponível" && r.pagina !== anterior) || /expirada|negado/i.test(r.estado),
      "A paginação nativa não avançou.");
    if (pagina.estado !== "Lista disponível") throw new Error(pagina.estado);
    await mostrarPagina(pagina.registros);
    el("proxima").hidden = !pagina.proxima;
  } catch (erro) { falha(erro); }
  finally { atividade(false); }
};

async function rodar(lote, manual = false) {
  if (ocupado || !lotePermitido(lote.length)) return;
  atividade(true);
  etapa("resultado");
  let feitos = 0, falhas = 0;
  const titulo = manual ? "Conferindo tags" : "Aplicando tags";
  progresso(titulo, feitos, lote.length);
  status("Acompanhe o processamento no mapa.");
  try {
    await emGrupos(lote, async (linha, vaga) => {
      const plano = selecionadas(linha);
      if (!plano.adicionar.length && !plano.retirar.length) {
        throw new Error("Escolha pelo menos uma tag deste registro.");
      }
      const a = linha.alvo;
      return comRegistro(a, vaga, async tabId => {
        const anterior = await lerHistorico(a);
        if (plano.retirar.some(t => !anterior?.proprias?.includes(t))) {
          throw new Error("A lista de tags próprias mudou. Reanalise o registro.");
        }
        const nomes = [...new Set([MARCADOR, ...plano.adicionar, ...plano.retirar, ...(anterior?.proprias ?? [])])];
        const acesso = controle(tabId, a, nomes);
        const {disponivel} = await acesso.conferir();
        const resultado = await processarRegistro(acesso, plano, anterior, manual || !disponivel,
          progresso => registrar(a, {...progresso, atualizadoEm: Date.now()}));
        await registrar(a, {...resultado, revisadoEm: resultado.revisadoEm ?? anterior?.revisadoEm, atualizadoEm: Date.now()});
        linha.informacao.textContent = [resultado.status,
          ...resultado.faltam.map(t => "Falta adicionar " + t),
          ...resultado.sobram.map(t => "Falta retirar " + t), ...resultado.erros,
          ...(!disponivel ? ["Use Abrir registro e Copiar tags para concluir manualmente."] : []),
        ].join(" · ");
        if (resultado.gravou) el("gravacao").textContent = "Confirmada após reabertura";
        if (resultado.status === "Validado") linha.selecao.checked = false;
        return resultado;
      });
    }, (r, linha) => {
      if (r.erro) linha.informacao.textContent = "Pendente · " + r.erro.message;
      const validado = r.valor?.status === "Validado";
      grafo.marcar(linha.alvo, validado);
      if (!validado) falhas++;
      progresso(titulo, ++feitos, lote.length, falhas);
    }, interromper);
    status("Lote conferido. Veja o resultado em cada registro.");
  } catch (erro) {
    falha(erro);
    comunicar({etapa: "resultado", estado: "erro", texto: "Processamento interrompido. Confira os registros antes de repetir.", acao: {rotulo: "Analisar consulta", comando: "analisar"}});
  } finally { atividade(false); }
}

el("aplicar").onclick = () => rodar(linhas.filter(l => l.selecao.checked));
try {
  config = await configuracao();
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (tab?.url && new URL(tab.url).origin === origemHttps(config.origem)) el("url").value = tab.url;
} catch (erro) { falha(erro); }
atualizar();
