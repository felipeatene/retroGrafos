import assert from "node:assert/strict";
import test from "node:test";
import {
  STOPWORDS,
  aplicarRemocoes,
  chamadosComTag,
  criarExemplosDemo,
  diaDaSemana,
  exemploSensivel,
  normalizarTag,
  separarTexto,
} from "./tags-contexto.mjs";

test("normaliza a situação sem artigo", () => {
  const { tags, bloqueios } = separarTexto("Erro ao renovar sessão");
  assert.deepEqual(tags.map((tag) => tag.id), ["erro", "renovar", "sessao"]);
  assert.equal(tags.find((tag) => tag.id === "sessao").rotulo, "sessão");
  assert.ok(bloqueios.some((item) => item.motivo === "stopword" && item.palavra === "ao"));
  assert.equal(STOPWORDS.has("ao"), true);
});

test("sexta-feira 09/10/2026 vira a tag sexta", () => {
  assert.deepEqual(diaDaSemana("2026-10-09"), { id: "sexta", rotulo: "sexta-feira" });
});

test("dado sensível não volta no resultado", () => {
  const exemplo = exemploSensivel();
  const serial = JSON.stringify(exemplo);
  assert.deepEqual(exemplo.categorias.sort(), ["CPF", "e-mail", "senha", "telefone", "token"].sort());
  assert.equal(serial.includes("example.com"), false);
  assert.equal(serial.includes("000.000.000-00"), false);
  assert.equal(serial.includes("naovalereportar"), false);
  assert.equal(serial.includes("98888"), false);
  assert.equal(exemplo.tags.some((tag) => tag.id.includes("tok")), false);
});

test("a lista de ignorados tira a palavra da proposta", () => {
  const { tags, bloqueios } = separarTexto("Erro ao renovar sessão", ["renovar"]);
  assert.deepEqual(tags.map((tag) => tag.id), ["erro", "sessao"]);
  assert.ok(bloqueios.some((item) => item.motivo === "ignorado" && item.palavra === "renovar"));
});

test("os chamados DEMO explodem tags e o demo está em todos", () => {
  const chamados = criarExemplosDemo();
  const porNumero = Object.fromEntries(chamados.map((chamado) => [chamado.numero, chamado]));
  const foco = porNumero.DEMO20261004003;
  const ids = foco.tags.map((tag) => tag.id);
  for (const id of ["erro", "renovar", "sessao", "erro_sessao", "demo", "2026_10_09", "sexta", "admin", "agencia_bh_centro", "portal_do_cliente", "marina_costa"]) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(ids.includes("ao"), false);
  assert.equal(foco.tags.find((tag) => tag.id === "marina_costa").exemplo, true);
  assert.equal(foco.tags.find((tag) => tag.id === "admin").exemplo, false);
  assert.equal(porNumero.DEMO20261004002.abertoEm, null);
  for (const numero of ["DEMO20261004003", "DEMO20261004002", "DEMO20261004001", "DEMO20261003008", "DEMO20261003007", "DEMO20261003006"]) {
    assert.ok(porNumero[numero].tags.some((tag) => tag.id === "demo"));
  }
  for (const numero of ["DEMO20261003008", "DEMO20261003007", "DEMO20261003006"]) {
    assert.ok(porNumero[numero].tags.some((tag) => tag.id === "timeout_protocolos"));
    assert.ok(porNumero[numero].tags.some((tag) => tag.id === "protocolos"));
    assert.equal(porNumero[numero].tags.some((tag) => tag.id === "ao"), false);
  }
});

test("desclassificar tira a tag de todos os cards e não das outras", () => {
  const antes = criarExemplosDemo();
  const afetados = chamadosComTag(antes, "demo").map((chamado) => chamado.numero);
  assert.equal(afetados.length, 6);
  const depois = aplicarRemocoes(antes, ["demo"]);
  assert.equal(depois.some((chamado) => chamado.tags.some((tag) => tag.id === "demo")), false);
  assert.ok(depois.find((chamado) => chamado.numero === "DEMO20261004003").tags.some((tag) => tag.id === "erro_sessao"));
  assert.equal(chamadosComTag(depois, "erro_sessao").length, 3);
});
