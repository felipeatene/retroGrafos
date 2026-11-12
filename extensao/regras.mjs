
export const TIPOS = ["incident", "problem", "change_request"];
export const CAMPOS = {
  short_description: "Título", description: "Descrição", category: "Categoria",
  subcategory: "Subcategoria", business_service: "Serviço", service_offering: "Oferta",
  cmdb_ci: "Componente", close_notes: "Notas de resolução", close_code: "Código de resolução",
  resolution_notes: "Notas de resolução", cause_notes: "Causa", fix_notes: "Correção",
  workaround: "Contorno", work_notes: "Nota de trabalho em edição",
  implementation_plan: "Plano de implementação", justification: "Justificativa",
  risk_impact_analysis: "Risco e impacto", backout_plan: "Plano de reversão",
  test_plan: "Plano de testes", u_system_name: "Sistema", u_system_module: "Módulo",
  u_sintoma: "Sintoma", state: "Estado", impact: "Impacto", urgency: "Urgência",
  priority: "Prioridade", problem_id: "Problema", caused_by: "Mudança causadora",
  rfc: "Mudança relacionada", parent: "Tarefa pai",
  caller_id: "Solicitante", assigned_to: "Responsável", assignment_group: "Equipe", location: "Local",
};
export const TAG = /^[a-z0-9_]{1,80}$/;
export const PADRAO = "https://dev217534.service-now.com";

export function origemHttps(valor) {
  const url = new URL(valor);
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Informe apenas a origem HTTPS da instância.");
  }
  return url.origin;
}

function normalizar(valor) {
  return valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function validarLista(lista) {
  if (!Array.isArray(lista?.value) || lista.value.length > 500) {
    throw new Error("Use value como lista de até 500 regras.");
  }
  const erros = [];
  const regras = lista.value.map((item, i) => {
    const f = item?.fields;
    const falhas = [];
    const palavras = f?.PalavrasChave;
    if (typeof f?.Title !== "string" || !TAG.test(f.Title)) falhas.push("Title");
    if (f?.Rotulo !== undefined && (typeof f.Rotulo !== "string" || f.Rotulo.length > 160 ||
        !normalizar(f.Rotulo))) falhas.push("Rotulo");
    if (!Array.isArray(palavras) || !palavras.length || palavras.length > 40 ||
        !palavras.every(t => typeof t === "string" && t.length <= 160 && normalizar(t))) {
      falhas.push("PalavrasChave");
    }
    for (const [chave, permitidos] of [["Campos", Object.keys(CAMPOS)], ["TiposTarefa", TIPOS]]) {
      if (!Array.isArray(f?.[chave]) || !f[chave].length ||
          !f[chave].every(v => permitidos.includes(v))) falhas.push(chave);
    }
    if (typeof f?.Ativa !== "boolean") falhas.push("Ativa");
    if (falhas.length) erros.push(`Regra ${i + 1}: ${falhas.join(", ")}`);
    return f;
  });
  if (erros.length) throw new Error(erros.join("\n"));
  return regras;
}

export function sugerir(tarefa, regras) {
  const resultados = new Map();
  for (const regra of regras) {
    if (!regra.Ativa || !regra.TiposTarefa.includes(tarefa.tipo)) continue;
    for (const campo of regra.Campos) {
      const valor = tarefa.campos[campo];
      if (!valor) continue;
      for (const termo of regra.PalavrasChave) {
        if (!` ${normalizar(valor)} `.includes(` ${normalizar(termo)} `)) continue;
        if (!resultados.has(regra.Title)) resultados.set(regra.Title, new Map());
        resultados.get(regra.Title).set(JSON.stringify([campo, termo]), {campo, termo});
      }
    }
  }
  return Array.from(resultados, ([tag, motivos]) => ({tag, motivos: [...motivos.values()]}));
}

export async function listaDemo() {
  const resposta = await fetch(chrome.runtime.getURL("lista-demo.json"));
  if (!resposta.ok) throw new Error("A lista de demonstração está indisponível.");
  return resposta.json();
}

export async function configuracao() {
  const {config} = await chrome.storage.local.get("config");
  return config ?? {origem: PADRAO, lista: await listaDemo()};
}
