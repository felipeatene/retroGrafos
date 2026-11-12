import assert from "node:assert/strict";
import test from "node:test";
import {criarEstado, passo} from "../simulacao.mjs";

const semMola = {repulsao: 400, distancia: 50, forcaAresta: 0, centro: 0};

test("nós sobrepostos se afastam", () => {
  const estado = criarEstado([{id: "a", x: 0, y: 0}, {id: "b", x: 0, y: 0}], []);
  for (let i = 0; i < 12; i++) passo(estado, semMola);
  const [a, b] = estado.nos;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 1);
});

test("nó fixo não se move", () => {
  const estado = criarEstado([{id: "a", x: 0, y: 0, fixo: true}, {id: "b", x: 0, y: 0}], []);
  for (let i = 0; i < 12; i++) passo(estado, semMola);
  assert.equal(estado.nos[0].x, 0);
  assert.equal(estado.nos[0].y, 0);
  assert.ok(Math.hypot(estado.nos[1].x, estado.nos[1].y) > 0.5);
});

test("alpha converge e a simulação para", () => {
  const estado = criarEstado([{id: "a", x: 0, y: 0}, {id: "b", x: 12, y: 0}], []);
  let anterior = estado.alpha;
  let passos = 0;
  while (!estado.parado && passos < 500) {
    passo(estado);
    assert.ok(estado.alpha <= anterior);
    anterior = estado.alpha;
    passos++;
  }
  assert.equal(estado.parado, true);
  assert.equal(estado.alpha, 0);
  assert.ok(passos < 500);
});
