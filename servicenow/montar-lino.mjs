import {readFile} from 'node:fs/promises';

const [classificador, servico, endpoint] = await Promise.all(
  ['LinoClassificador.js', 'LinoService.js', 'LinoEndpoint.js'].map(nome =>
    readFile(new URL(nome, import.meta.url), 'utf8')),
);

const includes = {LinoClassificador: classificador, LinoService: servico};
const rotas = Object.fromEntries(Object.entries({acesso: 'GET', grafo: 'GET', impacto: 'GET',
  classificar: 'POST', remover: 'POST'}).map(([nome, metodo]) => [nome, {
  metodo, script: endpoint.replace(/\bLINO_ROTA\b/g, JSON.stringify(nome)),
}]));

// ServiceNow Scripts - Background, global. Run in the intended Update Set.
const instalador = function (includes, rotas) {
  function gravar(tabela, filtro, campos) {
    var registro = new GlideRecord(tabela);
    Object.keys(filtro).forEach(function (campo) { registro.addQuery(campo, filtro[campo]); });
    registro.query();
    var existe = registro.next();
    if (!existe) registro.initialize();
    Object.keys(campos).forEach(function (campo) { registro.setValue(campo, campos[campo]); });
    var id = existe ? registro.update() : registro.insert();
    if (!id) throw new Error('Não foi possível gravar ' + tabela + ' ' + JSON.stringify(filtro));
    return String(id);
  }

  var global = new GlideRecord('sys_scope');
  if (!global.get('scope', 'global')) throw new Error('Escopo global indisponível.');
  var escopo = global.getUniqueValue();
  Object.keys(includes).forEach(function (nome) {
    gravar('sys_script_include', {name: nome, sys_scope: escopo}, {
      name: nome, api_name: 'global.' + nome, sys_scope: escopo, active: true,
      client_callable: false, script: includes[nome],
    });
  });
  var api = gravar('sys_ws_definition', {service_id: 'lino', namespace: 'global'}, {
    name: 'Lino', service_id: 'lino', namespace: 'global', sys_scope: escopo, active: true,
  });
  Object.keys(rotas).forEach(function (nome) {
    var rota = rotas[nome];
    gravar('sys_ws_operation', {web_service_definition: api, relative_path: '/' + nome, http_method: rota.metodo}, {
      web_service_definition: api, name: 'Lino ' + nome, relative_path: '/' + nome, http_method: rota.metodo,
      operation_script: rota.script, requires_authentication: true, sys_scope: escopo,
    });
  });
  gs.info('[Lino] API instalada em /api/global/lino.');
};

process.stdout.write(`(${instalador.toString()})(${JSON.stringify(includes)}, ${JSON.stringify(rotas)});\n`);
