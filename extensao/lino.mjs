import {mensagensPainel} from "./mensagens-painel.mjs";
import {chamar, coletar, preferencias} from "./lino-api.mjs";
import {criarGrafoVivo} from "./grafo-vivo.mjs";
import {agrupar, projetar, TIPOS_LINO} from "./projecao.mjs";
import {CAMPOS, configuracao, origemHttps, validarLista} from "./regras.mjs";
import {LIMITE, registroURL} from "./lote.mjs";

const el = id => document.getElementById(id);
const flutuante = window.parent !== window;
if (flutuante) document.body.classList.add('painel-flutuante');
const janela = flutuante ? await chrome.runtime.sendMessage({tipo: 'lino:vincular-janela'}).catch(() => null) : null;
if (janela?.origem) {
  el('fechar-lino').hidden = false;
  const recolher = () => window.parent.postMessage({tipo: 'lino:recolher-janela'}, janela.origem);
  el('fechar-lino').addEventListener('click', recolher);
  document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape' && !document.querySelector('dialog[open]')) recolher();
  });
}

async function abaDeTrabalho() {
  if (flutuante) return janela?.id ? chrome.tabs.get(janela.id) : null;
  const [aba] = await chrome.tabs.query({active: true, currentWindow: true});
  return aba;
}
const detalhe = el("detalhe");
const dialogoIgnorados = el("ignorado-dialogo");
const selecionados = new Set();
let sessao, config, ativa, revisao = 0, atualizacao = 0, ocupado = false;
let vinculos = [], ignorados = [], tagAberta, impacto = [], erroGrafo = "";
const comunicar = mensagensPainel('lino', () => sessao?.tabId || ativa?.id, () => mostrarVista('chamado'));
let limiteTags = 12, limiteIncidentes = 10, consultandoGrafo = false, enquadrado = false;
const vivo = criarGrafoVivo(el("grafo"), {
  aoAbrir(no) {
    if (no.abrir === "incidente") {
      const encontrado = vinculos.find(item => item.incidente.id === no.incidenteId);
      if (encontrado) abrirIncidente(encontrado.incidente);
    } else if (no.abrir === "tag") {
      const tag = agrupar(vinculos).find(item => item.id === no.tagId);
      if (tag) abrirTag(tag);
    }
  },
});

function mostrarVista(vista, focar = false) {
  const grafo = vista === 'grafo' && Boolean(sessao);
  el('vista-chamado').hidden = grafo;
  el('exploracao').hidden = !grafo;
  el('aba-chamado').setAttribute('aria-pressed', String(!grafo));
  el('aba-grafo').setAttribute('aria-pressed', String(grafo));
  if (focar) el(grafo ? 'grafo-titulo' : 'contexto-titulo').focus();
  if (grafo) requestAnimationFrame(caberGrafo);
}

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
  el("lino").src = alerta ? "assets/lino-avatar.webp" : "assets/lino-avatar.webp";
  el("lino").classList.toggle("alerta", alerta);
}

function situacao({titulo = "Categorização de incidentes", texto, status = "ServiceNow", estado = "espera", acao, numero}) {
  el("contexto-titulo").textContent = titulo;
  const progresso = /Verificando|Carregando/.test(texto || '');
  el("contexto-texto").textContent = progresso || estado === 'erro' ? "" : texto;
  comunicar({etapa: progresso ? 'aba' : 'contexto', estado: estado === 'erro' ? 'erro' : progresso ? 'ativo' : estado === 'ativo' ? 'concluido' : 'aguardando', texto: estado === 'ativo' ? 'Contexto confirmado.' : texto,
    acao: acao ? {rotulo: el(acao).textContent, comando: acao} : undefined});
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
  mostrarVista('chamado');
  for (const id of ["classificacao", "selecao", "navegacao-lino", "resultados"]) el(id).hidden = true;
  el('selecionados').textContent = '';
  enquadrado = false;
  vivo.definir({nos: [], arestas: []});
  for (const id of ["candidatos", "tags", "resultado-lista", "detalhe-incidentes", "ignorado-lista"]) el(id).replaceChildren();
  el("resultado-status").textContent = "";
  el("resultado-barras").replaceChildren();
  el("resultado-barras").hidden = true;
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
  el('classificar-rotulo').textContent = ocupado ? 'Aplicando…' : 'Classificar';
  el('classificar').setAttribute('aria-label', ocupado ? 'Classificando e aplicando tags' : 'Classificar e aplicar tags');
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
    const aba = await abaDeTrabalho();
    config = await configuracao();
    if (versao !== revisao) return;
    const origem = origemHttps(config.origem);
    ativa = aba;
    limparSessao();
    if (flutuante && !janela?.id) {
      el('contexto-titulo').textContent = 'Abra o Lino pelo mascote';
      el('contexto-texto').textContent = 'A janela precisa estar vinculada a uma aba do ServiceNow.';
      return;
    }
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
    comunicar({etapa: "acesso", estado: "ativo", texto: "Conferindo seu acesso…"});
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
        : contexto.interface === 'workspace' && contexto.total === undefined
          ? "Não consigo ler as linhas deste workspace. Abra um incidente para classificá-lo."
          : "A lista atual não contém incidentes para classificar.", status: "Conectado", estado: "ativo"});
    }
    montarSelecao(contexto);
    el('navegacao-lino').hidden = false;
    await carregarGrafo();
  } catch (erro) {
    if (versao === revisao) erroAcesso(erro);
  }
}

async function executar(alvo, rota, opcoes) {
  if (alvo !== sessao) throw new Error("O contexto da aba mudou.");
  const aba = await abaDeTrabalho();
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

function pintarLegenda(legenda) {
  const caixa = el("grafo-legenda");
  const itens = legenda?.tipo === "categorica" ? legenda.itens : [];
  caixa.replaceChildren();
  caixa.hidden = !itens.length;
  for (const item of itens.slice(0, 4)) {
    const marca = elemento("i");
    marca.style.background = item.cor;
    caixa.append(marca, elemento("span", item.rotulo));
  }
}

function caberGrafo() {
  if (enquadrado || el("grafo").hidden || el("grafo").clientWidth < 40) return;
  vivo.enquadrar();
  enquadrado = true;
}

function renderizarGrafo() {
  const busca = el("busca").value;
  const tipo = el("tipo").value;
  const tags = agrupar(vinculos, busca, tipo);
  el("expandir").disabled = !vinculos.length;
  const incidentes = new Set(tags.flatMap(tag => [...tag.incidentes.keys()]));
  const proj = projetar(vinculos, {vertices: ["tag", "incidente"], arestas: "pertence", cor: "tipo", busca, tipo});
  const vazio = proj.nos.length === 0;
  el("grafo").hidden = vazio;
  el("grafo-estado").textContent = erroGrafo || (vazio
    ? consultandoGrafo ? "Carregando o grafo…"
    : vinculos.length ? "Nenhuma tag corresponde aos filtros." : "Classifique um incidente para começar o grafo."
    : "");
  el("grafo-contagem").textContent = tags.length ? tags.length + " tags · " + incidentes.size + " incidentes" + (proj.aviso ? " · " + proj.aviso : "") : "";
  pintarLegenda(vazio ? null : proj.legenda);
  el("catalogo").hidden = !tags.length;
  el("mais-tags").hidden = tags.length <= limiteTags;
  vivo.definir(proj);
  requestAnimationFrame(caberGrafo);
  el("tags").replaceChildren(...tags.slice(0, limiteTags).map(tag => {
    const li = elemento("li");
    const botao = elemento("button");
    botao.type = "button";
    botao.append(elemento("span", tag.valor), elemento("small", TIPOS_LINO[tag.tipo] + " · " + tag.incidentes.size));
    botao.addEventListener("click", () => abrirTag(tag));
    botao.addEventListener("focus", () => vivo.destacar("tag:" + tag.id));
    botao.addEventListener("blur", () => vivo.destacar(null));
    botao.addEventListener("mouseenter", () => vivo.destacar("tag:" + tag.id));
    botao.addEventListener("mouseleave", () => vivo.destacar(null));
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
  if (!ocupado) comunicar({etapa: 'grafo', estado: 'ativo', texto: 'Montando o grafo de tags…'});
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
      if (!ocupado && !erroGrafo && vinculos.length) {
        const tags = agrupar(vinculos);
        const ids = [...new Set(vinculos.map(vinculo => vinculo.incidente.id))];
        const compacto = tags.length <= 2 && ids.length <= 4 && tags.length + ids.length <= 6;
        comunicar({etapa: 'grafo', estado: 'concluido', texto: `${tags.length} tags ligadas a ${ids.length} incidentes.`,
          miniGrafo: compacto ? {tags: tags.map(tag => ({valor: tag.valor, conexoes: [...tag.incidentes.keys()].map(id => ids.indexOf(id))})), incidentes: ids.length} : undefined,
          acao: compacto ? undefined : {rotulo: 'Expandir', comando: 'expandir'}});
      }
      if (!ocupado) {
        const tags = agrupar(vinculos), registros = new Set(vinculos.map(v => v.incidente.id));
        comunicar({etapa: 'grafo', estado: erroGrafo ? 'erro' : 'concluido',
          texto: erroGrafo || (tags.length ? `${tags.length} tags ligadas a ${registros.size} incidentes.` : 'Classifique um incidente para começar o grafo.'),
          acao: erroGrafo ? {rotulo: 'Atualizar grafo', comando: 'atualizar'} : tags.length + registros.size > 6 ? {rotulo: 'Expandir', comando: 'expandir'} : undefined});
      }
    }
  }
}

function barrasResultado(totais) {
  const nomes = {adicionada: "Adicionadas", existente: "Já presentes", falha: "Falhas"};
  const maior = Math.max(1, ...Object.values(totais));
  const caixa = el("resultado-barras");
  caixa.replaceChildren();
  for (const [chave, rotulo] of Object.entries(nomes)) {
    const valor = Number(totais[chave]) || 0;
    const linha = elemento("div");
    linha.className = "barra-resultado";
    linha.dataset.falha = String(chave === "falha");
    const trilho = elemento("span");
    trilho.className = "trilho";
    trilho.setAttribute("aria-hidden", "true");
    const preenchimento = elemento("i");
    preenchimento.style.width = (100 * valor / maior) + "%";
    trilho.append(preenchimento);
    linha.append(elemento("span", rotulo), trilho, elemento("b", String(valor)));
    caixa.append(linha);
  }
  caixa.hidden = false;
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
  barrasResultado(totais);
  const resumo = [contagem(totais.adicionada, "adicionada", "adicionadas"),
    contagem(totais.existente, "já presente", "já presentes"), contagem(totais.falha, "falha de tag", "falhas de tag"),
    falhasDeRegistro ? contagem(falhasDeRegistro, "incidente com falha", "incidentes com falha") : "",
    negados ? negados + " sem acesso" : ""].filter(Boolean).join(" · ");
  comunicar({etapa: 'resultado', estado: totais.falha || negados || falhasDeRegistro ? 'erro' : 'concluido', texto: resumo,
    totais: {...totais, negados, falhasDeRegistro}, acao: {rotulo: 'Ver detalhes', comando: 'detalhes'}});
  mascote(Boolean(totais.falha || negados || falhasDeRegistro));
}

async function classificar() {
  const alvo = sessao;
  if (!alvo || ocupado || !selecionados.size) return;
  mostrarVista('chamado');
  ocupado = true;
  atualizarSelecao();
  el("resultados").hidden = true;
  el("resultado-barras").hidden = true;
  comunicar({etapa: "classificar", estado: "ativo", texto: "Aplicando as tags no ServiceNow…", limpar: true});
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
      comunicar({etapa: "classificar", estado: "ativo", texto: "Classificando os incidentes selecionados…", feitos: i, total: ids.length});
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
      comunicar({etapa: "classificar", estado: "erro", texto: "O ServiceNow não confirmou a classificação.", acao: {rotulo: "Classificar e aplicar tags", comando: "classificar"}});
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
el("legado").addEventListener("click", () => {
  const url = new URL(chrome.runtime.getURL('legado.html'));
  if (ativa?.id) url.searchParams.set('aba', ativa.id);
  chrome.tabs.create({url: url.href});
});
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

if (!flutuante) chrome.tabs.onActivated.addListener(verificar);
chrome.tabs.onUpdated.addListener((id, mudanca) => {
  if (id === (janela?.id || ativa?.id) && (mudanca.url || mudanca.status === 'loading' || mudanca.status === 'complete')) verificar();
});
chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && mudancas.config) verificar();
});
el("enquadrar").addEventListener("click", () => { enquadrado = true; vivo.enquadrar(); });
el("expandir").addEventListener("click", async () => {
  const resposta = await chrome.runtime.sendMessage({tipo: 'lino:expandir', fluxo: 'lino', dados: vinculos});
  if (resposta?.erro) comunicar({etapa: 'grafo', estado: 'erro', texto: resposta.erro, acao: {rotulo: 'Expandir', comando: 'expandir'}});
});

el('aba-chamado').addEventListener('click', () => mostrarVista('chamado', true));
el('aba-grafo').addEventListener('click', () => mostrarVista('grafo', true));

await verificar();
