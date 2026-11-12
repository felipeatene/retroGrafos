import {lerMetricas, CHAVE_METRICAS} from "./metricas.mjs";

import {CAMPOS, configuracao, listaDemo, origemHttps, validarLista} from "./regras.mjs";
const el = id => document.getElementById(id);
const json = valor => JSON.stringify(valor, null, 2);
const mostrar = texto => { el("status").textContent = texto; };

for (const [chave, nome] of Object.entries(CAMPOS)) {
  const item = document.createElement("li");
  item.textContent = nome + " · " + chave;
  el("campos").append(item);
}
try {
  const config = await configuracao();
  el("origem").value = config.origem;
  el("lista").value = json(config.lista);
  el("prazo").value = config.prazoDias ?? 30;
} catch (erro) {
  mostrar(erro.message);
}

el("config").addEventListener("submit", async evento => {
  evento.preventDefault();
  try {
    const origem = origemHttps(el("origem").value);
    const lista = JSON.parse(el("lista").value);
    validarLista(lista);
    const prazoDias = el("prazo").valueAsNumber;
    if (!Number.isInteger(prazoDias) || prazoDias < 1 || prazoDias > 365) throw new Error("Informe um prazo entre 1 e 365 dias.");
    await chrome.storage.local.set({config: {origem, lista, prazoDias}});
    el("origem").value = origem;
    mostrar("Configuração salva.");
  } catch (erro) { mostrar(erro.message); }
});

el("importar").addEventListener("click", () => el("arquivo").click());
el("arquivo").addEventListener("change", async () => {
  const [arquivo] = el("arquivo").files;
  el("arquivo").value = "";
  if (!arquivo) return;
  try {
    if (arquivo.size > 2_000_000) throw new Error("O arquivo deve ter até 2 MB.");
    const lista = JSON.parse((await arquivo.text()).replace(/^\uFEFF/, ""));
    validarLista(lista);
    el("lista").value = json(lista);
    mostrar("Lista carregada no editor. Salve para colocá-la em uso.");
  } catch (erro) { mostrar(erro.message); }
});

el("exportar").addEventListener("click", () => {
  try {
    const lista = JSON.parse(el("lista").value);
    validarLista(lista);
    const url = URL.createObjectURL(new Blob([json(lista) + "\n"], {type: "application/json"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = "lino-regras.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (erro) { mostrar(erro.message); }
});

el("restaurar").addEventListener("click", async () => {
  try {
    el("lista").value = json(await listaDemo());
    mostrar("Exemplo restaurado no editor. Salve para colocá-lo em uso.");
  } catch (erro) { mostrar(erro.message); }
});

el('mostrar-lino').checked = (await chrome.storage.local.get('lino:ativo'))['lino:ativo'] !== false;
el('mostrar-lino').onchange = async () => {
  await chrome.storage.local.set({'lino:ativo': el('mostrar-lino').checked}); mostrar('Preferência do assistente salva.');
};
el('exportar-metricas').onclick = async () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({versao: 1, eventos: await lerMetricas()}, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'lino-metricas.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); mostrar('Métricas exportadas.');
};
el('apagar-metricas').onclick = async () => { await chrome.storage.local.remove(CHAVE_METRICAS); mostrar('Métricas apagadas deste navegador.'); };
