
import {CAMPOS, configuracao, origemHttps, sugerir, validarLista} from "./regras.mjs";

const el = id => document.getElementById(id);
let analise;
let ocupado = false;

async function executar(tabId, operacao, args) {
  const [retorno] = await chrome.scripting.executeScript({
    target: {tabId},
    func: async (op, parametros) => {
      try {
        return {valor: await globalThis.retroGrafosFormulario[op](...parametros)};
      } catch (erro) {
        return {erro: erro.message};
      }
    },
    args: [operacao, args],
  });
  if (!retorno?.result) throw new Error("Não foi possível acessar o formulário.");
  if (retorno.result.erro) throw new Error(retorno.result.erro);
  return retorno.result.valor;
}

function marcarOcupado(valor) {
  ocupado = valor;
  el("analisar").disabled = valor;
  el("aplicar").disabled = valor || !el("lista").querySelector("input:checked");
}

el("configurar").addEventListener("click", () => chrome.runtime.openOptionsPage());
el("lista").addEventListener("change", () => marcarOcupado(ocupado));

el("analisar").addEventListener("click", async () => {
  analise = null;
  el("sugestoes").hidden = el("detalhes").hidden = true;
  el("lista").replaceChildren();
  el("resultado").replaceChildren();
  marcarOcupado(true);
  el("status").textContent = "Lendo a tarefa…";
  try {
    const config = await configuracao();
    const origem = origemHttps(config.origem);
    const regras = validarLista(config.lista);
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.url || new URL(tab.url).origin !== origem) {
      throw new Error("Abra uma tarefa na instância configurada.");
    }
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ["formulario.js"]});
    const tarefa = await executar(tab.id, "analisar", [origem, Object.keys(CAMPOS)]);
    analise = {tabId: tab.id, origem, alvo: {tipo: tarefa.tipo, sysId: tarefa.sysId, numero: tarefa.numero}};
    el("registro").textContent = tarefa.numero;
    el("campos").textContent = Object.keys(tarefa.campos).map(c => CAMPOS[c]).join(", ") || "Nenhum campo preenchido.";
    el("detalhes").hidden = false;
    const sugestoes = sugerir(tarefa, regras);
    for (const {tag, motivos} of sugestoes) {
      const linha = document.createElement("label");
      linha.className = "sugestao";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = tag;
      const texto = document.createElement("span");
      const titulo = document.createElement("strong");
      titulo.textContent = tag;
      const motivo = document.createElement("small");
      motivo.textContent = motivos.map(m => CAMPOS[m.campo] + " · " + m.termo).join(" / ");
      texto.append(titulo, motivo);
      linha.append(input, texto);
      el("lista").append(linha);
    }
    el("sugestoes").hidden = !sugestoes.length;
    el("status").textContent = sugestoes.length
      ? "Selecione as tags que deseja gravar."
      : "Nenhuma regra corresponde aos campos lidos.";
  } catch (erro) {
    el("status").textContent = erro.message;
  } finally {
    marcarOcupado(false);
  }
});

el("sugestoes").addEventListener("submit", async evento => {
  evento.preventDefault();
  if (!analise || ocupado) return;
  const tags = Array.from(el("lista").querySelectorAll("input:checked"), input => input.value);
  if (!tags.length) return;
  marcarOcupado(true);
  el("resultado").replaceChildren();
  el("status").textContent = "Aplicando tags na tarefa…";
  try {
    const resultados = await executar(analise.tabId, "aplicar", [analise.origem, analise.alvo, tags]);
    const rotulos = {adicionada: "adicionada", existente: "já estava na tarefa", falhou: "falhou"};
    for (const {tag, estado, motivo} of resultados) {
      const item = document.createElement("li");
      item.textContent = tag + " — " + rotulos[estado] + (motivo ? " · " + motivo : "");
      el("resultado").append(item);
      if (estado !== "falhou") {
        const input = Array.from(el("lista").querySelectorAll("input")).find(el => el.value === tag);
        input.checked = false;
      }
    }
    el("status").textContent = "Confira o resultado de cada tag.";
  } catch (erro) {
    el("status").textContent = erro.message;
  } finally {
    marcarOcupado(false);
  }
});
