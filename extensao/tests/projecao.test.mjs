import assert from "node:assert/strict";
import test from "node:test";
import {CAMADAS, COR_AMBAR, COR_LINHA, COR_NEUTRA, COR_VERDE, LIMITE_NOS, corCalor, escalaCalor, projetar} from "../projecao.mjs";

const tag = (id, valor, tipo = "sistema") => ({id, valor, tipo});
const vinculo = (incidente, etiqueta, extra = {}) => ({
  id: etiqueta.id + ":" + incidente.id,
  tag: etiqueta,
  incidente: {numero: "INC" + incidente.id, titulo: "Chamado", campos: {}, abertoEm: "", ...incidente, ...extra},
  fontes: ["short_description"],
});

test("cada camada vira nó e os dois tipos de aresta ligam o que prometem", () => {
  const estoque = tag("t1", "Estoque");
  const rede = tag("t2", "Rede", "servico");
  const base = {campos: {grupo: "Service Desk", prioridade: "1 - Crítica", estado: "Novo", categoria: "Rede", ic: "Roteador"}};
  const dados = [
    vinculo({id: "a", ...base}, estoque),
    vinculo({id: "a", ...base}, rede),
    vinculo({id: "b", campos: {grupo: "Campo"}}, estoque),
  ];
  for (const camada of CAMADAS) {
    const proj = projetar(dados, {vertices: [camada.id], arestas: "juntos"});
    assert.ok(proj.nos.length >= 1, camada.id);
    assert.ok(proj.nos.every(no => no.camada === camada.id));
  }
  const pertence = projetar(dados, {vertices: ["tag", "incidente"], arestas: "pertence"});
  assert.equal(pertence.arestas.length, 3);
  assert.ok(pertence.arestas.every(aresta => aresta.origem.startsWith("inc:") || aresta.destino.startsWith("inc:")));
  const juntos = projetar(dados, {vertices: ["tag"], arestas: "juntos"});
  const pares = juntos.arestas.map(aresta => [aresta.origem, aresta.destino].sort().join());
  assert.deepEqual(pares, ["tag:t1,tag:t2"]);
  const semIncidente = projetar(dados, {vertices: ["tag", "grupo"], arestas: "pertence"});
  assert.ok(semIncidente.arestas.every(aresta => !aresta.origem.startsWith("inc:") && !aresta.destino.startsWith("inc:")));
});

test("coocorrência acumula o peso e valores vazios caem na âncora Sem grupo", () => {
  const comum = tag("t1", "Estoque");
  const dados = [
    vinculo({id: "a", campos: {grupo: "Rede"}}, comum),
    vinculo({id: "a", campos: {grupo: "Rede"}}, tag("t2", "Link")),
    vinculo({id: "b", campos: {grupo: "Rede"}}, comum),
    vinculo({id: "b", campos: {grupo: "Rede"}}, tag("t2", "Link")),
    vinculo({id: "c", campos: {}}, comum),
  ];
  const juntos = projetar(dados, {vertices: ["tag"], arestas: "juntos"});
  assert.equal(juntos.arestas[0].peso, 2);
  const ancorado = projetar(dados, {vertices: ["incidente", "grupo"], arestas: "pertence", ancora: "grupo"});
  const sem = ancorado.nos.find(no => no.id === "grupo:Sem grupo");
  assert.equal(sem.fixo, true);
  assert.equal(sem.aparecerEm, null);
  assert.ok(ancorado.arestas.some(aresta => aresta.origem === "grupo:Sem grupo" || aresta.destino === "grupo:Sem grupo"));
  assert.ok(ancorado.nos.filter(no => no.ancora).every(no => Math.abs(Math.hypot(no.x, no.y) - 240) < 0.01));
});

test("cor categórica, calor e valores vazios", () => {
  assert.equal(corCalor(0), COR_LINHA);
  assert.equal(corCalor(0.5), COR_VERDE);
  assert.equal(corCalor(1), COR_AMBAR);
  const escala = escalaCalor([1, null, 5, undefined]);
  assert.equal(escala.min, 1);
  assert.equal(escala.max, 5);
  assert.equal(escala.cor(null), COR_NEUTRA);
  assert.equal(escalaCalor([3, 3]).cor(3), COR_VERDE);

  const dados = [
    vinculo({id: "a", abertoEm: "2026-11-01 00:00:00", campos: {prioridade: "1 - Crítica", grupo: "Rede"}}, tag("t1", "Estoque")),
    vinculo({id: "b", abertoEm: "2026-11-03 00:00:00", campos: {prioridade: "3 - Moderada", grupo: "Rede"}}, tag("t2", "Link", "servico")),
    vinculo({id: "c", abertoEm: "", campos: {prioridade: "", grupo: "Campo"}}, tag("t3", "Queda", "local")),
  ];
  const tipos = projetar(dados, {cor: "tipo"});
  const estoque = tipos.nos.find(no => no.id === "tag:t1");
  const incidente = tipos.nos.find(no => no.camada === "incidente");
  assert.equal(estoque.cor, tipos.legenda.itens.find(item => item.rotulo === "Sistema").cor);
  assert.equal(incidente.cor, COR_NEUTRA);
  assert.equal(tipos.legenda.tipo, "categorica");

  const agora = Date.parse("2026-11-04T00:00:00Z");
  const calor = projetar(dados, {vertices: ["incidente"], cor: "calor:prioridade", agora});
  const porNumero = Object.fromEntries(calor.nos.map(no => [no.rotulo, no.cor]));
  assert.equal(porNumero.INCa, COR_AMBAR);
  assert.equal(porNumero.INCc, COR_NEUTRA);
  assert.equal(calor.legenda.min, 1);
  assert.equal(calor.legenda.max, 3);
  assert.equal(calor.legenda.quenteNoMinimo, true);
  const iguais = projetar(dados.slice(0, 1).concat([vinculo({id: "d", campos: {prioridade: "1 - Crítica"}}, tag("t9", "Outro"))]),
    {vertices: ["incidente"], cor: "calor:prioridade"});
  assert.ok(iguais.nos.every(no => no.cor === COR_VERDE));

  const idade = projetar(dados, {vertices: ["incidente"], cor: "calor:idade", agora});
  const antigo = idade.nos.find(no => no.rotulo === "INCa");
  const semData = idade.nos.find(no => no.rotulo === "INCc");
  const recente = idade.nos.find(no => no.rotulo === "INCb");
  assert.equal(antigo.cor, COR_AMBAR);
  assert.equal(recente.cor, COR_LINHA);
  assert.equal(semData.cor, COR_NEUTRA);
  assert.equal(idade.legenda.min, agora - Date.parse("2026-11-03T00:00:00Z"));
});

test("a ordem temporal coloca chamados sem data na frente", () => {
  const dados = [
    vinculo({id: "3", abertoEm: "2026-11-03 00:00:00"}, tag("t3", "C")),
    vinculo({id: "1", abertoEm: ""}, tag("t1", "A")),
    vinculo({id: "2", abertoEm: "2026-11-01 00:00:00"}, tag("t2", "B")),
  ];
  const proj = projetar(dados, {vertices: ["incidente", "tag"]});
  const ordem = proj.nos.filter(no => no.camada === "incidente").sort((a, b) => a.aparecerEm - b.aparecerEm);
  assert.equal(ordem[0].semData, true);
  assert.equal(ordem[0].rotulo, "INC1");
  assert.ok(ordem[1].aparecerEm < ordem[2].aparecerEm);
  const tagA = proj.nos.find(no => no.id === "tag:t1");
  assert.equal(tagA.aparecerEm, 0);
});

test("o teto de nós avisa e preserva as âncoras", () => {
  const dados = [];
  for (let i = 0; i < LIMITE_NOS; i++) dados.push(vinculo({id: String(i), campos: {grupo: "Núcleo"}}, tag("t" + i, "Tag " + i)));
  const proj = projetar(dados, {vertices: ["tag", "incidente", "grupo"], arestas: "pertence", ancora: "grupo"});
  assert.equal(proj.nos.length, LIMITE_NOS);
  assert.match(proj.aviso, new RegExp(LIMITE_NOS + " de " + (LIMITE_NOS * 2 + 1)));
  assert.ok(proj.nos.some(no => no.id === "grupo:Núcleo" && no.fixo));
});
