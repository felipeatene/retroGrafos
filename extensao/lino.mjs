import {chamar, coletar, preferencias} from "./lino-api.mjs";
import {agrupar, desenhar, TIPOS_LINO} from "./lino-grafo.mjs";
import {CAMPOS, configuracao, origemHttps, validarLista} from "./regras.mjs";
import {LIMITE, registroURL} from "./lote.mjs";

const el = id => document.getElementById(id);
const detalhe = el("detalhe");
const dialogoIgnorados = el("ignorado-dialogo");
const selecionados = new Set();
let sessao, config, ativa, revisao = 0, atualizacao = 0, ocupado = false;
let vinculos = [], ignorados = [], tagAberta, impacto = [], erroGrafo = "";
let limiteTags = 12, limiteIncidentes = 10, consultandoGrafo = false;

function elemento(tipo, texto) {
  const node = document.createElement(tipo);
  if (texto) node.textContent = texto;
  return node;
}

function contagem(total, singular, plural) {
  return total + " " + (total === 1 ? singular : plural);
}

function conexao(texto, estado) {
  el("conexao-texto").textContent = texto;
  el("conexao").dataset.estado = estado;
}

function mascote(alerta) {
  el("lina").src = alerta ? "assets/lina-alerta.png" : "assets/lina.jpg";
  el("lina").classList.toggle("alerta", alerta);
}

function situacao({titulo = "Categorização de incidentes", texto, status = "ServiceNow", estado = "espera", acao, numero}) {
  el("contexto-titulo").textContent = titulo;
  el("contexto-texto").textContent = texto;
  el("contexto-numero").textContent = numero || "";
  el("contexto-numero").hidden = !numero;
  conexao(status, estado);
  mascote(estado === "erro");
  for (const id of ["autorizar", "entrar", "verificar", "legado"]) el(id).hidden = id !== acao;
}

function limparSessao() {
  sessao = null;
  vinculos = [];
  ignorados = [];
  selecionados.clear();
  ocupado = false;
  erroGrafo = "";
  consultandoGrafo = false;
  detalhe.close();
  dialogoIgnorados.close();
  for (const id of ["classificacao", "selecao", "exploracao", "resultados"]) el(id).hidden = true;
  for (const id of ["candidatos", "grafo", "tags", "resultado-lista", "detalhe-incidentes", "ignorado-lista"]) el(id).replaceChildren();
  el("resultado-status").textContent = "";
  el("busca").value = "";
  el("tipo").value = "";
}

function erroAcesso(erro) {
  revisao++;
  limparSessao();
  if (erro.status === 401) {
    situacao({titulo: "Sessão do ServiceNow encerrada", texto: "Entre novamente para continuar.",
      status: "Sessão expirada", estado: "erro", acao: "entrar"});
  } else if (erro.status === 403) {
    situacao({titulo: "Acesso restrito", texto: "Você não tem acesso para categorizar chamados.",
      status: "Acesso restrito", estado: "erro", acao: "verificar"});
  } else {
    const texto = [404, 503].includes(erro.status)
      ? "A integração do Lino ainda não está disponível nesta instância."
      : "Não foi possível validar a conexão com o ServiceNow.";
    situacao({titulo: "Integração indisponível", texto, status: "Indisponível", estado: "erro", acao: "verificar"});
  }
}

function atualizarSelecao() {
  el("classificar").disabled = ocupado || selecionados.size === 0;
  el("classificar").textContent = ocupado ? "Classificando…" : "Classificar e aplicar tags";
  if (sessao?.contexto.tipo !== "lista") return;
  el("selecionados").textContent = selecionados.size + " de " + LIMITE + " selecionados";
  for (const campo of el("candidatos").querySelectorAll("input")) {
    campo.disabled = ocupado || !campo.checked && selecionados.size === LIMITE;
  }
}

function montarSelecao(contexto) {
  el("selecao").hidden = contexto.tipo !== "lista" || !contexto.registros.length;
  el("classificacao").hidden = contexto.tipo === "lista" && !contexto.registros.length;
  el("selecionados").textContent = "";
  if (contexto.tipo === "incidente") selecionados.add(contexto.id);
  else {
    for (const registro of contexto.registros) {
      const label = elemento("label");
      label.className = "candidato";
      const check = elemento("input");
      check.type = "checkbox";
      check.addEventListener("change", () => {
        if (check.checked) selecionados.add(registro.id);
        else selecionados.delete(registro.id);
        atualizarSelecao();
      });
      label.append(check, elemento("span", [registro.numero, registro.titulo].filter(Boolean).join(" · ")));
      el("candidatos").append(label);
    }
  }
  atualizarSelecao();
}

async function verificar() {
  const versao = ++revisao;
  try {
    const [aba] = await chrome.tabs.query({active: true, currentWindow: true});
    config = await configuracao();
    if (versao !== revisao) return;
    const origem = origemHttps(config.origem);
    ativa = aba;
    limparSessao();
    situacao({texto: "Verificando a aba ativa…"});
    if (aba?.status === "loading") return;
    const autorizado = await chrome.permissions.contains({origins: [origem + "/*"]});
    if (versao !== revisao) return;
    if (aba?.url && new URL(aba.url).origin !== origem) {
      situacao({texto: "Abra um incidente ou a lista de incidentes na instância configurada."});
      return;
    }
    if (!autorizado) {
      situacao({texto: "Autorize o Lino a usar a aba do ServiceNow para verificar seu acesso.", acao: "autorizar"});
      return;
    }
    if (!aba?.id || !aba.url) {
      situacao({texto: "Abra um incidente ou a lista de incidentes na instância configurada."});
      return;
    }
    const destino = {tabId: aba.id, url: aba.url, origem};
    const contexto = await chamar(destino, "contexto");
    if (versao !== revisao) return;
    if (contexto.tipo === "incompativel" || contexto.tipo === "legado") {
      situacao({texto: contexto.tipo === "legado" ? "Use o painel de problemas e mudanças para trabalhar com esta tarefa."
        : "Abra um incidente salvo ou a lista de incidentes do ServiceNow.",
        acao: contexto.tipo === "legado" ? "legado" : undefined});
      return;
    }
    const parametros = contexto.id ? {incidente: contexto.id} : {};
    const acesso = await chamar(destino, "acesso", {parametros});
    const verificada = {...destino, usuario: acesso.usuario, contexto};
    const pessoais = await preferencias(verificada).ler();
    if (versao !== revisao) return;
    sessao = verificada;
    ignorados = pessoais;
    if (contexto.tipo === "incidente") {
      situacao({titulo: contexto.titulo || "Incidente aberto", numero: contexto.numero,
        texto: "O Lino analisa o contexto deste chamado e aplica as tags no ServiceNow.",
        status: "Conectado", estado: "ativo"});
    } else {
      situacao({titulo: "Incidentes da página", texto: contexto.registros.length
        ? "Selecione os chamados que deseja classificar."
        : "A lista atual não contém incidentes para classificar.", status: "Conectado", estado: "ativo"});
    }
    montarSelecao(contexto);
    el("exploracao").hidden = false;
    await carregarGrafo();
  } catch (erro) {
    if (versao === revisao) erroAcesso(erro);
  }
}

async function executar(alvo, rota, opcoes) {
  if (alvo !== sessao) throw new Error("O contexto da aba mudou.");
  const [aba] = await chrome.tabs.query({active: true, currentWindow: true});
  if (aba?.id !== alvo.tabId || aba.url !== alvo.url) throw new Error("O contexto da aba mudou.");
  const resposta = await chamar(alvo, rota, opcoes);
  if (alvo !== sessao) throw new Error("O contexto da aba mudou.");
  return resposta;
}

function tratarErro(erro, alvo, mensagem) {
  if (alvo !== sessao) return;
  if ([401, 403].includes(erro.status)) erroAcesso(erro);
  else mensagem();
}

function abrirIncidente(incidente) {
  if (sessao) chrome.tabs.create({url: registroURL(sessao.origem, "incident", incidente.id)});
}

function renderizarGrafo() {
  const tags = agrupar(vinculos, el("busca").value, el("tipo").value);
  const incidentes = new Set(tags.flatMap(tag => [...tag.incidentes.keys()]));
  el("grafo").hidden = tags.length === 0;
  el("grafo-legenda").hidden = !tags.length;
  el("grafo-estado").textContent = erroGrafo || (tags.length ? ""
    : consultandoGrafo ? "Carregando o grafo…"
    : vinculos.length ? "Nenhuma tag corresponde aos filtros." : "Classifique um incidente para começar o grafo.");
  el("grafo-contagem").textContent = tags.length ? tags.length + " tags · " + incidentes.size + " incidentes" : "";
  el("catalogo").hidden = !tags.length;
  el("mais-tags").hidden = tags.length <= limiteTags;
  desenhar(el("grafo"), tags, abrirTag, abrirIncidente);
  el("tags").replaceChildren(...tags.slice(0, limiteTags).map(tag => {
    const li = elemento("li");
    const botao = elemento("button");
    botao.type = "button";
    botao.append(elemento("span", tag.valor), elemento("small", TIPOS_LINO[tag.tipo] + " · " + tag.incidentes.size));
    botao.addEventListener("click", () => abrirTag(tag));
    li.append(botao);
    return li;
  }));
}

async function carregarGrafo() {
  const alvo = sessao;
  const versao = ++atualizacao;
  consultandoGrafo = true;
  erroGrafo = "";
  el("atualizar").disabled = true;
  renderizarGrafo();
  try {
    const resultado = await coletar(cursor => executar(alvo, "grafo", {parametros: {cursor}}));
    if (alvo === sessao && versao === atualizacao) vinculos = resultado;
  } catch (erro) {
    if (versao === atualizacao) tratarErro(erro, alvo, () => {
      erroGrafo = "Não foi possível atualizar o grafo. Tente novamente.";
    });
  } finally {
    if (alvo === sessao && versao === atualizacao) {
      consultandoGrafo = false;
      el("atualizar").disabled = false;
      renderizarGrafo();
    }
  }
}

function mostrarResultado(itens) {
  const nomes = {adicionada: "adicionada", existente: "já presente", falha: "falhou"};
  const totais = {adicionada: 0, existente: 0, falha: 0};
  let negados = 0;
  let falhasDeRegistro = 0;
  const linhas = itens.map(item => {
    const li = elemento("li");
    if (item.estado !== "analisado") {
      const contexto = sessao.contexto;
      const registro = contexto.tipo === "lista" ? contexto.registros.find(registro => registro.id === item.id) : contexto;
      const negado = item.estado === "sem_acesso";
      if (negado) negados++;
      else falhasDeRegistro++;
      li.textContent = (registro?.numero ?? "Incidente") + (negado
        ? " · Sem acesso para categorizar." : " · Classificação não confirmada.");
      return li;
    }
    li.append(elemento("strong", item.numero || "Incidente"));
    if (!item.tags.length) li.append(" · Sem tags elegíveis.");
    else {
      const lista = elemento("ul");
      for (const tag of item.tags) {
        totais[tag.estado]++;
        const fonte = tag.fontes.map(campo => campo === "opened_at" ? "Abertura" : CAMPOS[campo] || campo).join(", ");
        lista.append(elemento("li", tag.valor + " · " + nomes[tag.estado] + " · " + fonte));
      }
      li.append(lista);
    }
    return li;
  });
  el("resultado-lista").replaceChildren(...linhas);
  el("resultados").hidden = false;
  el("resultado-status").textContent = [contagem(totais.adicionada, "adicionada", "adicionadas"),
    contagem(totais.existente, "já presente", "já presentes"), contagem(totais.falha, "falha de tag", "falhas de tag"),
    falhasDeRegistro ? contagem(falhasDeRegistro, "incidente com falha", "incidentes com falha") : "",
    negados ? negados + " sem acesso" : ""].filter(Boolean).join(" · ");
  mascote(Boolean(totais.falha || negados || falhasDeRegistro));
}

async function classificar() {
  const alvo = sessao;
  if (!alvo || ocupado || !selecionados.size) return;
  ocupado = true;
  atualizarSelecao();
  el("resultados").hidden = true;
  el("resultado-status").textContent = "Aplicando as tags no ServiceNow…";
  try {
    const ids = [...selecionados];
    const contexto = await executar(alvo, "contexto");
    const atuais = contexto.tipo === "lista" ? contexto.registros.map(registro => registro.id) : [contexto.id];
    if (contexto.tipo !== alvo.contexto.tipo || ids.some(id => !atuais.includes(id))) {
      await verificar();
      return;
    }
    const regras = validarLista(config.lista);
    const itens = [];
    const termos = ignorados.map(item => item.chave);
    const porRequisicao = 5;
    for (let i = 0; i < ids.length; i += porRequisicao) {
      const lote = ids.slice(i, i + porRequisicao);
      el("resultado-status").textContent = "Aplicando as tags · " + i + " de " + ids.length + " incidentes";
      try {
        const resposta = await executar(alvo, "classificar", {corpo: {ids: lote, regras, ignorados: termos}});
        if (resposta.itens.length !== lote.length) throw new Error("Resultado incompleto.");
        itens.push(...resposta.itens);
      } catch (erro) {
        if (alvo !== sessao || [401, 403].includes(erro.status)) throw erro;
        itens.push(...ids.slice(i).map(id => ({id, estado: "falha"})));
        break;
      }
    }
    mostrarResultado(itens);
    await carregarGrafo();
  } catch (erro) {
    tratarErro(erro, alvo, () => {
      mascote(true);
      el("resultado-status").textContent = "O ServiceNow não confirmou a classificação. Tente novamente para conferir as tags.";
    });
  } finally {
    if (alvo === sessao) {
      ocupado = false;
      atualizarSelecao();
    }
  }
}

function renderizarIncidentes() {
  const registros = [...tagAberta.incidentes.values()];
  el("mais-incidentes").hidden = registros.length <= limiteIncidentes;
  el("detalhe-incidentes").replaceChildren(...registros.slice(0, limiteIncidentes).map(registro => {
    const li = elemento("li");
    const link = elemento("a", [registro.numero, registro.titulo].filter(Boolean).join(" · ") || "Abrir incidente");
    link.href = registroURL(sessao.origem, "incident", registro.id);
    link.target = "_blank";
    link.rel = "noopener";
    li.append(link);
    return li;
  }));
}

function estadoIgnorar() {
  el("ignorar").textContent = ignorados.some(item => item.chave === tagAberta.chave)
    ? "Voltar a sugerir esta tag" : "Ignorar nas próximas análises";
}

function abrirTag(tag) {
  if (detalhe.open) return;
  tagAberta = tag;
  limiteIncidentes = 10;
  impacto = [];
  el("detalhe-titulo").textContent = tag.valor;
  el("detalhe-contexto").textContent = TIPOS_LINO[tag.tipo] + " · " + contagem(tag.incidentes.size, "incidente", "incidentes");
  el("impacto").hidden = true;
  el("prever").disabled = false;
  el("ignorar").disabled = false;
  estadoIgnorar();
  renderizarIncidentes();
  detalhe.showModal();
}

async function prever() {
  const alvo = sessao;
  const tag = tagAberta;
  impacto = [];
  el("impacto").hidden = false;
  el("confirmar").hidden = true;
  el("remocao-falhas").hidden = true;
  el("prever").disabled = true;
  el("impacto-texto").textContent = "Consultando todos os vínculos removíveis da instância…";
  try {
    const itens = await coletar(cursor => executar(alvo, "impacto", {parametros: {tag: tag.id, cursor}}));
    if (alvo !== sessao || tag !== tagAberta || !detalhe.open || el("impacto").hidden) return;
    impacto = itens.map(item => item.id);
    el("impacto-texto").textContent = impacto.length
      ? "Remover a tag de " + impacto.length + (impacto.length === 1 ? " incidente?" : " incidentes?")
      : "Nenhum vínculo gerenciado pode ser removido nesta sessão.";
    el("confirmar").textContent = "Confirmar remoção";
    el("confirmar").hidden = !impacto.length;
  } catch (erro) {
    tratarErro(erro, alvo, () => { el("impacto-texto").textContent = "Não foi possível verificar o impacto."; });
  } finally {
    if (alvo === sessao && tag === tagAberta) el("prever").disabled = false;
  }
}

function travarRemocao(travar) {
  for (const id of ["cancelar-remocao", "confirmar", "prever", "ignorar"]) el(id).disabled = travar;
  detalhe.querySelector(".fechar").disabled = travar;
  detalhe.dataset.removendo = String(travar);
}

async function remover() {
  const alvo = sessao;
  const tag = tagAberta;
  const ids = [...impacto];
  if (!ids.length) return;
  travarRemocao(true);
  el("remocao-falhas").hidden = true;
  let removidos = 0;
  let processados = 0;
  const falhas = [];
  try {
    while (processados < ids.length) {
      el("impacto-texto").textContent = "Removendo vínculos · " + processados + " de " + ids.length;
      const lote = ids.slice(processados, processados + LIMITE);
      const {itens} = await executar(alvo, "remover", {corpo: {tag: tag.id, ids: lote}});
      if (itens.length !== lote.length) throw new Error("Resposta incompleta do ServiceNow.");
      for (const item of itens) {
        if (item.estado === "removido") removidos++;
        else if (item.estado !== "indisponivel") falhas.push(item);
      }
      processados += lote.length;
    }
  } catch (erro) {
    tratarErro(erro, alvo, () => {
      falhas.push(...ids.slice(processados).map(id => ({id, estado: "falha"})));
    });
  } finally {
    travarRemocao(false);
  }
  if (alvo !== sessao || tag !== tagAberta) return;
  impacto = falhas.map(item => item.id);
  el("impacto-texto").textContent = [contagem(removidos, "removido", "removidos"),
    contagem(falhas.length, "falha", "falhas"),
    contagem(ids.length - removidos - falhas.length, "indisponível", "indisponíveis")].join(" · ");
  el("remocao-falhas").replaceChildren(...falhas.map(item => {
    const li = elemento("li");
    const anterior = [...tag.incidentes.values()].find(registro => registro.idVinculo === item.id);
    li.append(elemento("span", (item.incidente?.numero || anterior?.numero || "Incidente") + " · " +
      (item.estado === "sem_acesso" ? "Acesso insuficiente" : "Remoção não confirmada")));
    return li;
  }));
  el("remocao-falhas").hidden = !falhas.length;
  el("confirmar").textContent = "Tentar falhas novamente";
  el("confirmar").hidden = !falhas.length;
  await carregarGrafo();
  if (alvo === sessao && tag === tagAberta) {
    tagAberta = agrupar(vinculos).find(item => item.id === tag.id) ?? {...tag, incidentes: new Map()};
    el("detalhe-contexto").textContent = TIPOS_LINO[tag.tipo] + " · " + contagem(tagAberta.incidentes.size, "incidente", "incidentes");
    renderizarIncidentes();
  }
}

function renderizarIgnorados() {
  el("ignorado-estado").textContent = ignorados.length ? "Estas preferências valem para a sua conta neste navegador."
    : "Você ainda não ignorou nenhuma tag. Abra uma tag no grafo para adicioná-la à lista.";
  el("ignorado-lista").replaceChildren(...ignorados.map(item => {
    const li = elemento("li");
    const botao = elemento("button");
    botao.type = "button";
    botao.append(elemento("span", item.valor), elemento("small", "Voltar a sugerir"));
    botao.setAttribute("aria-label", "Voltar a sugerir " + item.valor);
    botao.addEventListener("click", () => alternarIgnorado(item));
    li.append(botao);
    return li;
  }));
}

async function alternarIgnorado(tag) {
  const alvo = sessao;
  try {
    const existe = ignorados.some(item => item.chave === tag.chave);
    if (!existe && ignorados.length >= 1000) throw new Error("Remova um termo da lista antes de adicionar outro.");
    const lista = existe ? ignorados.filter(item => item.chave !== tag.chave)
      : [...ignorados, {chave: tag.chave, valor: tag.valor}];
    await preferencias(alvo).salvar(lista);
    if (alvo !== sessao) return;
    ignorados = lista;
    if (detalhe.open) estadoIgnorar();
    if (dialogoIgnorados.open) renderizarIgnorados();
  } catch (erro) {
    if (alvo !== sessao) return;
    if (detalhe.open) el("detalhe-contexto").textContent = "Não foi possível salvar a preferência. " + erro.message;
    else el("ignorado-estado").textContent = "Não foi possível salvar a preferência.";
  }
}

for (const [tipo, nome] of Object.entries(TIPOS_LINO)) {
  const opcao = elemento("option", nome);
  opcao.value = tipo;
  el("tipo").append(opcao);
}
for (const dialogo of [detalhe, dialogoIgnorados]) {
  dialogo.querySelector(".fechar").addEventListener("click", () => dialogo.close());
}
detalhe.addEventListener("cancel", evento => {
  if (detalhe.dataset.removendo === "true") evento.preventDefault();
});
detalhe.addEventListener("close", () => { tagAberta = null; impacto = []; });

el("autorizar").addEventListener("click", async () => {
  const origem = origemHttps(config.origem);
  if (await chrome.permissions.request({origins: [origem + "/*"]})) await verificar();
  else el("contexto-texto").textContent = "O Lino precisa de acesso à origem do ServiceNow para continuar.";
});
el("entrar").addEventListener("click", () => chrome.tabs.update(ativa.id, {url: origemHttps(config.origem) + "/login.do"}));
el("legado").addEventListener("click", () => chrome.tabs.create({url: chrome.runtime.getURL("legado.html")}));
el("configurar").addEventListener("click", () => chrome.runtime.openOptionsPage());
el("verificar").addEventListener("click", verificar);
el("classificar").addEventListener("click", classificar);
el("atualizar").addEventListener("click", carregarGrafo);
el("prever").addEventListener("click", prever);
el("confirmar").addEventListener("click", remover);
el("cancelar-remocao").addEventListener("click", () => { el("impacto").hidden = true; impacto = []; });
el("ignorar").addEventListener("click", () => alternarIgnorado(tagAberta));
el("preferencias").addEventListener("click", () => { renderizarIgnorados(); dialogoIgnorados.showModal(); });
el("mais-tags").addEventListener("click", () => { limiteTags += 12; renderizarGrafo(); });
el("mais-incidentes").addEventListener("click", () => { limiteIncidentes += 10; renderizarIncidentes(); });
el("busca").addEventListener("input", () => { limiteTags = 12; renderizarGrafo(); });
el("tipo").addEventListener("change", () => { limiteTags = 12; renderizarGrafo(); });

chrome.tabs.onActivated.addListener(verificar);
chrome.tabs.onUpdated.addListener((id, mudanca) => {
  if (id === ativa?.id && (mudanca.status === "loading" || mudanca.status === "complete")) verificar();
});
chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && mudancas.config) verificar();
});
await verificar();
