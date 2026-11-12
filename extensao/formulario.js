
(() => {
  if (globalThis.retroGrafosFormulario) return;
  const tipos = new Set(["incident", "problem", "change_request"]);
  const hex = /^[a-f0-9]{32}$/i;
  const tagPattern = /^[a-z0-9_]{1,80}$/;
  let aplicando = false;

  function campoVisivel(doc, id) {
    return ["sys_display." + id, id, "sys_readonly." + id]
      .map(chave => doc.getElementById(chave))
      .find(el => el && el.type !== "hidden" && el.type !== "password");
  }

  function localizar(origem) {
    if (location.origin !== origem) throw new Error("A aba não está na instância configurada.");
    const docs = [document];
    const quadro = document.querySelector("iframe#gsft_main, iframe[name='gsft_main']");
    try {
      if (quadro?.contentDocument) docs.push(quadro.contentDocument);
    } catch { /* Quadros de outra origem ficam fora da análise. */ }

    for (const doc of docs) {
      const url = new URL(doc.URL);
      if (url.origin !== origem) continue;
      const tipo = /^\/(incident|problem|change_request)\.do$/.exec(url.pathname)?.[1];
      const sysId = url.searchParams.get("sys_id")?.toLowerCase();
      if (!tipos.has(tipo) || !hex.test(sysId ?? "")) continue;
      const numero = campoVisivel(doc, tipo + ".number")?.value?.trim();
      if (numero) return {doc, tipo, sysId, origem, numero};
    }
    throw new Error("Abra um incidente, problema ou mudança já salvo no formulário clássico.");
  }

  function analisar(origem, camposPermitidos) {
    const {doc, tipo, sysId, numero} = localizar(origem);
    const campos = {};
    for (const campo of camposPermitidos) {
      const id = tipo + "." + campo;
      const el = campoVisivel(doc, id);
      if (!el) continue;
      const valor = el.selectedOptions ? el.selectedOptions[0]?.textContent : el.value;
      if (typeof valor === "string" && valor.trim()) campos[campo] = valor.trim();
    }
    return {tipo, sysId, numero, campos, tagsDisponiveis: !!doc.getElementById("tags_menu")};
  }

  function mesmoRegistro(origem, alvo) {
    const atual = localizar(origem);
    if (atual.tipo !== alvo.tipo || atual.sysId !== alvo.sysId || atual.numero !== alvo.numero) {
      throw new Error("O registro aberto mudou. Analise a tarefa novamente.");
    }
    return atual.doc;
  }

  const visivel = el => !!el?.getClientRects().length;
  function abrirMenu(doc) {
    const menu = doc.getElementById("toggleMoreOptions");
    const add = doc.getElementById("tags_menu");
    if (!menu || !add) throw new Error("O menu nativo Add Tag está indisponível neste formulário.");
    if (!visivel(add)) menu.click();
    if (!visivel(add) || add.disabled) throw new Error("O controle Add Tag está indisponível.");
    return add;
  }

  const pausa = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function esperar(condicao, ms) {
    const limite = Date.now() + ms;
    do {
      const resultado = condicao();
      if (resultado) return resultado;
      await pausa(80);
    } while (Date.now() < limite);
    return null;
  }

  function temTag(doc, tag) {
    return Array.from(doc.querySelectorAll("#document_tags [aria-label], [id^='document_tags'] [aria-label], .document_tags [aria-label], #moreOptionsContainer [aria-label]"))
      .some(el => el.getAttribute("aria-label") === "Remove tag: " + tag ||
                  el.getAttribute("aria-label") === "Edit audience for tag: " + tag ||
                  el.getAttribute("aria-label") === "View records tagged with " + tag) ||
      Array.from(doc.querySelectorAll("#moreOptionsContainer [id]"))
        .some(el => el.id === tag);
  }

  function campoTag(doc) {
    const escopos = "#moreOptionsContainer input, #document_tags input, [id^='document_tags'] input, .document_tags input";
    const candidatos = [...new Set(doc.querySelectorAll(escopos))].filter(el =>
      (el.type === "text" || el.type === "search") && visivel(el) && !el.disabled && !el.readOnly);
    return candidatos.length === 1 ? candidatos[0] : null;
  }

  function enter(el, tipo) {
    const ev = new el.ownerDocument.defaultView.KeyboardEvent(tipo, {
      key: "Enter", code: "Enter", keyCode: 13, charCode: tipo === "keypress" ? 13 : 0,
      which: 13, bubbles: true, cancelable: true,
    });
    return el.dispatchEvent(ev);
  }

  async function aplicar(origem, alvo, selecionadas) {
    if (aplicando) throw new Error("Já existe uma aplicação em andamento nesta aba.");
    if (!Array.isArray(selecionadas) || !selecionadas.every(t => typeof t === "string" && tagPattern.test(t))) {
      throw new Error("Há nomes de tag inválidos na seleção.");
    }
    aplicando = true;
    try {
      const doc = mesmoRegistro(origem, alvo);
      abrirMenu(doc);
      const resultados = [];
      for (const tag of new Set(selecionadas)) {
        try {
          if (mesmoRegistro(origem, alvo) !== doc) throw new Error("O formulário foi recarregado.");
          const add = abrirMenu(doc);
          // O componente carrega as etiquetas de forma assíncrona ao abrir.
          await esperar(() => doc.querySelector("#document_tags, [id^='document_tags'], .document_tags"), 1000);
          if (mesmoRegistro(origem, alvo) !== doc) throw new Error("O formulário foi recarregado.");
          if (temTag(doc, tag)) {
            resultados.push({tag, estado: "existente"});
            continue;
          }
          let campo = campoTag(doc);
          if (!campo) {
            add.click();
            campo = await esperar(() => campoTag(doc), 1500);
          }
          if (!campo) throw new Error("O campo nativo de etiqueta não apareceu.");
          if (campo.value) throw new Error("Finalize a edição de tag que já está aberta.");
          if (mesmoRegistro(origem, alvo) !== doc) throw new Error("O formulário foi recarregado.");
          campo.focus();
          campo.value = tag;
          const win = doc.defaultView;
          campo.dispatchEvent(new win.Event("input", {bubbles: true}));
          const prosseguir = enter(campo, "keydown");
          if (prosseguir && campo.isConnected && campo.value === tag && !temTag(doc, tag)) {
            enter(campo, "keypress");
          }
          if (!await esperar(() => mesmoRegistro(origem, alvo) === doc && temTag(doc, tag), 5000)) {
            if (campo.isConnected && campo.value === tag) {
              campo.value = "";
              campo.dispatchEvent(new win.Event("input", {bubbles: true}));
            }
            throw new Error("O formulário não confirmou a etiqueta.");
          }
          resultados.push({tag, estado: "adicionada"});
        } catch (erro) {
          resultados.push({tag, estado: "falhou", motivo: erro.message});
        }
      }
      return resultados;
    } finally {
      aplicando = false;
    }
  }

  async function conferir(origem, alvo, nomes) {
    const doc = mesmoRegistro(origem, alvo);
    let disponivel = true;
    try { abrirMenu(doc); } catch { disponivel = false; }
    if (disponivel) {
      await esperar(() => doc.querySelector("#document_tags, [id^='document_tags'], .document_tags, [aria-label='document_tags']"), 1300);
    }
    if (mesmoRegistro(origem, alvo) !== doc) throw new Error("O formulário foi recarregado.");
    return {disponivel, tags: nomes.filter(tag => temTag(doc, tag))};
  }

  async function retirar(origem, alvo, tag) {
    if (!tagPattern.test(tag) || tag === "retrografos_validado") throw new Error("Tag inválida para remoção.");
    const doc = mesmoRegistro(origem, alvo);
    abrirMenu(doc);
    const controles = [...doc.querySelectorAll("#moreOptionsContainer [aria-label], [id^='document_tags'] [aria-label], .document_tags [aria-label]")];
    const controle = controles.find(el => el.getAttribute("aria-label") === "Remove tag: " + tag && visivel(el));
    if (!controle) return {estado: "falhou", motivo: "A remoção nativa não está disponível."};
    mesmoRegistro(origem, alvo);
    controle.click();
    const ok = await esperar(() => mesmoRegistro(origem, alvo) === doc && !temTag(doc, tag), 5000);
    return ok ? {estado: "retirada"} : {estado: "falhou", motivo: "O formulário não confirmou a remoção."};
  }

  globalThis.retroGrafosFormulario = {analisar, aplicar, conferir, retirar};
})();
