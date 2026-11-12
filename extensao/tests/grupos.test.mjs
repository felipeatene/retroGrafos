
import test from "node:test";
import assert from "node:assert/strict";
import {emGrupos} from "../grupos.mjs";

test("usa três vagas distintas, espera o grupo e conserva a ordem dos resultados", async () => {
  const iniciados = [], finalizados = [];
  const tarefas = [0, 1, 2, 3, 4, 5, 6];
  const liberacoes = new Map();
  const lote = emGrupos(tarefas, (item, vaga) => {
    iniciados.push([item, vaga]);
    return new Promise(resolve => liberacoes.set(item, resolve));
  }, (_r, item) => finalizados.push(item));
  assert.deepEqual(iniciados, [[0, 0], [1, 1], [2, 2]]);
  liberacoes.get(2)(2);
  liberacoes.get(0)(0);
  await new Promise(setImmediate);
  assert.deepEqual(finalizados, [2, 0]);
  assert.equal(iniciados.length, 3);
  liberacoes.get(1)(1);
  await new Promise(setImmediate);
  assert.deepEqual(iniciados.slice(3), [[3, 0], [4, 1], [5, 2]]);
  [3, 4, 5].forEach(i => liberacoes.get(i)(i));
  await new Promise(setImmediate);
  liberacoes.get(6)(6);
  assert.deepEqual((await lote).map(r => r.valor), tarefas);
});

test("sessão expirada aguarda as vagas em curso e não inicia o próximo grupo", async () => {
  const iniciados = [], concluidos = [];
  const lote = emGrupos([1, 2, 3, 4], async item => {
    iniciados.push(item);
    if (item === 2) throw new Error("Sessão expirada");
    await new Promise(setImmediate);
    return item;
  }, (_r, item) => concluidos.push(item), erro => /Sessão/.test(erro.message));
  await assert.rejects(lote, /Sessão expirada/);
  assert.deepEqual(iniciados, [1, 2, 3]);
  assert.deepEqual(concluidos.sort(), [1, 2, 3]);
});
