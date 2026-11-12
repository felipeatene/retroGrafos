import {
  aplicarRemocoes,
  chamadosComTag,
  criarExemplosDemo,
  exemploSensivel,
  normalizarTag,
} from "./tags-contexto.mjs";

const LUGARES = {
  demo: [450, 270],
  erro_sessao: [250, 220],
  erro: [145, 150],
  renovar: [240, 105],
  sessao: [370, 125],
  admin: [120, 260],
  "2026_10_09": [155, 340],
  sexta: [310, 355],
  agencia_bh_centro: [500, 390],
  portal_do_cliente: [220, 425],
  marina_costa: [390, 460],
  timeout_protocolos: [668, 250],
  tempo: [560, 140],
  limite: [690, 112],
  consultar: [710, 188],
  protocolos: [760, 360],
};

const ROTULOS_TIPO = {
  situacao: "Situação",
  conjunto: "Conjunto",
  data: "Data",
  dia: "Dia",
  pessoa: "Pessoa",
  local: "Local",
  sistema: "Sistema",
  existente: "Já no ServiceNow",
};

const estado = {
  acesso: "pendente",
  estacao: "acesso",
  ignorados: [],
  removidas: [],
  selecionado: "DEMO20261004003",
  foco: null,
  pendente: null,
};

const $ = (id) => document.getElementById(id);

function chamados() {
  return aplicarRemocoes(criarExemplosDemo(estado.ignorados), estado.removidas);
}

function chamadoAtual() {
  return chamados().find((item) => item.numero === estado.selecionado) ?? chamados()[0];
}

function avisar(texto) {
  $("aviso").textContent = texto;
}

function estacao(nome) {
  if (estado.acesso !== "permitido" && nome !== "acesso") return;
  estado.estacao = nome;
  for (const id of ["acesso", "chamado", "grafo"]) {
    const secao = $(`estacao-${id}`);
    const botao = $(`ir-${id}`);
    const aberta = id === nome;
    secao.hidden = !aberta;
    if (aberta) botao.setAttribute("aria-current", "page");
    else botao.removeAttribute("aria-current");
    botao.disabled = estado.acesso !== "permitido" && id !== "acesso";
  }
  if (nome === "grafo") desenharGrafo();
  if (nome === "chamado") desenharChamado();
}

function desenharAcesso() {
  const negado = estado.acesso === "negado";
  const permitido = estado.acesso === "permitido";
  $("acoes-acesso").hidden = negado;
  $("acesso-negado").hidden = !negado;
  $("lina-acesso").src = negado ? "assets/lina-alerta.png" : "assets/lina-aceno.png";
  $("lina-acesso").alt = negado
    ? "Lina surpresa, em pé na plataforma verde, avisando que o acesso foi negado."
    : "Lina, mascote do Lino, acenando de jaleco branco e capacete verde.";
  $("fala-acesso").textContent = negado
    ? "Infelizmente você não tem acesso para o processo de categorização."
    : permitido
      ? "Acesso confirmado. Pode abrir o chamado e ver a explosão de tags."
      : "Antes de etiquetar, eu confiro se você pode categorizar.";
  $("titulo-acesso").textContent = negado
    ? "Sem acesso à categorização"
    : "Você pode categorizar este chamado?";
  const selo = $("selo-acesso");
  selo.dataset.estado = estado.acesso;
  selo.textContent = negado ? "Sem acesso" : permitido ? "Pode categorizar" : "Conferindo acesso";
}

function meta(chamado) {
  const partes = [];
  if (chamado.abertoEm) partes.push(["Aberto", chamado.abertoEm]);
  if (chamado.estado) partes.push(["Estado", chamado.estado]);
  if (chamado.prioridade) partes.push(["Prioridade", chamado.prioridade]);
  if (chamado.categoria) partes.push(["Categoria", chamado.categoria]);
  if (chamado.atualizadoPor) partes.push(["Atualizado por", `${chamado.atualizadoPor} em ${chamado.atualizadoEm}`]);
  if (!partes.length) partes.push(["Lista", "Descrição e tag nativa. Data, pessoa e local não estavam na leitura."]);
  return partes;
}

function desenharChamado() {
  const atual = chamadoAtual();
  const todos = chamados();
  $("ficha").innerHTML = `
    <p class="numero">${atual.numero}</p>
    <p class="descricao">${atual.descricao}</p>
    <div class="meta">${meta(atual).map(([k, v]) => `<span>${k}: ${v}</span>`).join("")}</div>
    <p class="apoio">${atual.tags.length} tags neste card. Artigos e dado sensível não entram.</p>`;
  $("chips").replaceChildren(...atual.tags.map((tag) => {
    const item = document.createElement("li");
    item.className = "chip";
    item.dataset.tipo = tag.tipo;
    item.dataset.exemplo = String(tag.exemplo);
    item.innerHTML = `<small>${ROTULOS_TIPO[tag.tipo] ?? tag.tipo}${tag.exemplo ? " · exemplo" : ""}</small>
      <span class="linha"><strong></strong><button type="button">Ignorar</button></span>
      <small></small>`;
    item.querySelector("strong").textContent = tag.rotulo;
    item.querySelectorAll("small")[1].textContent = tag.detalhe;
    item.querySelector("button").addEventListener("click", () => ignorar(tag.id));
    return item;
  }));
  desenharIgnorados(atual);
  $("cards").replaceChildren(...todos.map((chamado) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "card";
    botao.setAttribute("aria-pressed", String(chamado.numero === atual.numero));
    botao.innerHTML = `<b></b><span></span>`;
    botao.querySelector("b").textContent = chamado.numero;
    botao.querySelector("span").textContent = chamado.tags.map((tag) => tag.rotulo).join(" · ") || "Sem tags";
    botao.addEventListener("click", () => {
      estado.selecionado = chamado.numero;
      desenharChamado();
    });
    return botao;
  }));
}

function desenharIgnorados(atual) {
  const raiz = $("ignorados");
  raiz.replaceChildren();
  const stop = [...new Set(atual.bloqueios.filter((item) => item.motivo === "stopword").map((item) => item.palavra))];
  const proprios = estado.ignorados;
  const sensivel = exemploSensivel();
  const bloco = (titulo, itens) => {
    const secao = document.createElement("section");
    const tituloEl = document.createElement("h3");
    tituloEl.className = "sobretitulo";
    tituloEl.textContent = titulo;
    const lista = document.createElement("ul");
    lista.className = "lista-fora";
    if (!itens.length) {
      const vazio = document.createElement("li");
      vazio.textContent = "Nada nesta lista.";
      lista.append(vazio);
    }
    for (const item of itens) {
      const li = document.createElement("li");
      li.textContent = item;
      lista.append(li);
    }
    secao.append(tituloEl, lista);
    return secao;
  };
  raiz.append(
    bloco("Stopwords deste chamado", stop),
    bloco("Ignoradas por você", proprios),
    bloco("Dado sensível, bloqueado por padrão", sensivel.categorias.map((categoria) => `${categoria} (texto fictício, fora dos DEMO)`)),
    bloco("Desclassificadas no grafo", estado.removidas),
  );
}

function ignorar(palavra) {
  const id = normalizarTag(palavra);
  if (!id) return;
  if (!estado.ignorados.includes(id)) estado.ignorados.push(id);
  desenharChamado();
  avisar(`A palavra ${id} entrou na base de ignorados e saiu das propostas.`);
}

function ns(nome) {
  return document.createElementNS("http://www.w3.org/2000/svg", nome);
}

function desenharGrafo() {
  const todos = chamados();
  const contagem = new Map();
  const amostra = new Map();
  for (const chamado of todos) {
    for (const tag of chamado.tags) {
      contagem.set(tag.id, (contagem.get(tag.id) ?? 0) + 1);
      if (!amostra.has(tag.id)) amostra.set(tag.id, tag);
    }
  }
  const svg = $("grafo");
  svg.replaceChildren();
  const vazio = contagem.size === 0;
  $("vazio-grafo").hidden = !vazio;
  svg.hidden = vazio;
  $("desclassificar-foco").disabled = !estado.foco || !contagem.has(estado.foco);
  desenharEfeito(todos);
  if (vazio) return;

  const hex = ns("polygon");
  hex.setAttribute("points", "450,28 812,196 812,430 450,534 88,430 88,196");
  hex.setAttribute("fill", "rgba(125,222,33,0.28)");
  hex.setAttribute("stroke", "rgba(255,255,255,0.9)");
  hex.setAttribute("stroke-width", "2");
  svg.append(hex);

  const ids = [...contagem.keys()];
  const ancora = (id) => {
    if (["erro", "renovar", "sessao", "admin", "2026_10_09", "sexta", "agencia_bh_centro", "portal_do_cliente", "marina_costa"].includes(id)) return "erro_sessao";
    if (["tempo", "limite", "consultar", "protocolos"].includes(id)) return "timeout_protocolos";
    return "demo";
  };
  for (const id of ids) {
    const destino = ancora(id);
    if (destino === id || !contagem.has(destino)) continue;
    const [x1, y1] = lugar(id, ids);
    const [x2, y2] = lugar(destino, ids);
    const linha = ns("line");
    linha.setAttribute("class", "aresta");
    linha.setAttribute("x1", x1);
    linha.setAttribute("y1", y1);
    linha.setAttribute("x2", x2);
    linha.setAttribute("y2", y2);
    svg.append(linha);
  }
  ids.forEach((id) => {
    const tag = amostra.get(id);
    const [x, y] = lugar(id, ids);
    const largura = Math.max(108, tag.rotulo.length * 8.2 + 36);
    const grupo = ns("g");
    grupo.setAttribute("class", `no-tag${estado.foco === id ? " selecionado" : ""}`);
    grupo.dataset.tipo = tag.tipo;
    grupo.dataset.exemplo = String(tag.exemplo);
    grupo.setAttribute("role", "button");
    grupo.setAttribute("tabindex", "0");
    const quantidade = contagem.get(id);
    const chamada = quantidade === 1 ? "1 chamado" : `${quantidade} chamados`;
    grupo.setAttribute("aria-label", `Tag ${tag.rotulo}, em ${chamada}. Dois cliques ou Enter desclassificam.`);
    const rect = ns("rect");
    rect.setAttribute("x", x - largura / 2);
    rect.setAttribute("y", y - 22);
    rect.setAttribute("width", largura);
    rect.setAttribute("height", 44);
    rect.setAttribute("rx", 22);
    const texto = ns("text");
    texto.setAttribute("x", x);
    texto.setAttribute("y", y - 2);
    texto.setAttribute("text-anchor", "middle");
    texto.textContent = tag.rotulo;
    const conta = ns("text");
    conta.setAttribute("class", "contagem");
    conta.setAttribute("x", x);
    conta.setAttribute("y", y + 14);
    conta.setAttribute("text-anchor", "middle");
    conta.textContent = chamada;
    grupo.append(rect, texto, conta);
    grupo.addEventListener("click", () => {
      estado.foco = id;
      for (const no of svg.querySelectorAll(".no-tag")) no.classList.remove("selecionado");
      grupo.classList.add("selecionado");
      $("desclassificar-foco").disabled = false;
    });
    grupo.addEventListener("dblclick", (evento) => {
      evento.preventDefault();
      pedirDesclassificacao(id);
    });
    grupo.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" || evento.key === " ") {
        evento.preventDefault();
        pedirDesclassificacao(id);
      }
    });
    svg.append(grupo);
  });
}

function lugar(id, ids) {
  if (LUGARES[id]) return LUGARES[id];
  const indice = ids.indexOf(id);
  const angulo = (Math.PI * 2 * indice) / ids.length;
  return [450 + Math.cos(angulo) * 220, 290 + Math.sin(angulo) * 160];
}

function desenharEfeito(todos) {
  $("efeito").replaceChildren(...todos.map((chamado) => {
    const item = document.createElement("li");
    item.innerHTML = "<b></b><span></span>";
    item.querySelector("b").textContent = chamado.numero;
    item.querySelector("span").textContent = chamado.tags.map((tag) => tag.rotulo).join(" · ") || "Sem tags";
    return item;
  }));
}

function pedirDesclassificacao(tagId) {
  const todos = chamados();
  const tag = todos.flatMap((chamado) => chamado.tags).find((item) => item.id === tagId);
  const alvos = chamadosComTag(todos, tagId);
  if (!tag || !alvos.length) return;
  estado.foco = tagId;
  estado.pendente = tagId;
  $("confirma-titulo").textContent = `Desclassificar “${tag.rotulo}”?`;
  $("confirma-texto").textContent = `A tag sai de ${alvos.length} ${alvos.length === 1 ? "chamado" : "chamados"}. O Lino percorre os cards classificados com ela e desclassifica.`;
  $("confirma-lista").replaceChildren(...alvos.map((chamado) => {
    const item = document.createElement("li");
    item.textContent = chamado.numero;
    return item;
  }));
  $("confirma").showModal();
  $("cancelar-remocao").focus();
}

function concluirDesclassificacao() {
  const tagId = estado.pendente;
  estado.pendente = null;
  if (!tagId) return;
  if ($("falhar").checked) {
    $("falhar").checked = false;
    $("erro-grafo").hidden = false;
    $("erro-grafo").textContent = "Não consegui desclassificar a tag. Os chamados continuam como estavam.";
    avisar("A desclassificação falhou. Nenhum chamado foi alterado.");
    return;
  }
  $("erro-grafo").hidden = true;
  const quantidade = chamadosComTag(chamados(), tagId).length;
  estado.removidas.push(tagId);
  if (estado.foco === tagId) estado.foco = null;
  desenharGrafo();
  avisar(`A tag ${tagId} saiu de ${quantidade} chamados.`);
}

function restaurar() {
  estado.ignorados = [];
  estado.removidas = [];
  estado.foco = null;
  estado.selecionado = "DEMO20261004003";
  $("erro-grafo").hidden = true;
  $("nova-ignorada").value = "";
  if (estado.estacao === "chamado") desenharChamado();
  if (estado.estacao === "grafo") desenharGrafo();
  avisar("O exemplo DEMO foi restaurado.");
}

function portao() {
  estado.acesso = "pendente";
  desenharAcesso();
  estacao("acesso");
}

document.addEventListener("DOMContentLoaded", () => {
  $("permitir").addEventListener("click", () => {
    estado.acesso = "permitido";
    desenharAcesso();
    estacao("chamado");
    avisar("Acesso permitido. O chamado DEMO20261004003 está aberto.");
  });
  $("negar").addEventListener("click", () => {
    estado.acesso = "negado";
    desenharAcesso();
    estacao("acesso");
    avisar("Infelizmente você não tem acesso para o processo de categorização.");
  });
  $("verificar-de-novo").addEventListener("click", () => {
    estado.acesso = "pendente";
    desenharAcesso();
    avisar("A conferência de acesso voltou ao início.");
  });
  for (const nome of ["acesso", "chamado", "grafo"]) {
    $(`ir-${nome}`).addEventListener("click", () => estacao(nome));
  }
  $("form-ignorar").addEventListener("submit", (evento) => {
    evento.preventDefault();
    ignorar($("nova-ignorada").value);
    $("nova-ignorada").value = "";
  });
  $("desclassificar-foco").addEventListener("click", () => {
    if (estado.foco) pedirDesclassificacao(estado.foco);
  });
  $("confirma").addEventListener("close", () => {
    if ($("confirma").returnValue === "confirmar") concluirDesclassificacao();
    else estado.pendente = null;
  });
  $("restaurar").addEventListener("click", restaurar);
  $("portao").addEventListener("click", portao);
  desenharAcesso();
  estacao("acesso");
});
