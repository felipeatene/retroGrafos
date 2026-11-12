
export const SIMULTANEOS = 3;

export async function emGrupos(itens, executar, aoConcluir, deveParar = () => false) {
  const resultados = [];
  for (let inicio = 0; inicio < itens.length; inicio += SIMULTANEOS) {
    const grupo = itens.slice(inicio, inicio + SIMULTANEOS);
    const concluidos = await Promise.all(grupo.map(async (item, vaga) => {
      let resultado;
      try { resultado = {valor: await executar(item, vaga)}; }
      catch (erro) { resultado = {erro}; }
      aoConcluir(resultado, item);
      return resultado;
    }));
    resultados.push(...concluidos);
    const fatal = concluidos.find(r => r.erro && deveParar(r.erro));
    if (fatal) throw fatal.erro;
  }
  return resultados;
}
