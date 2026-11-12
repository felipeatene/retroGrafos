/* RetroGrafos: execute em Scripts - Background, Global, com rollback.
 * O gerador acrescenta o argumento com os dados no final deste arquivo.
 */
function carregarRetroGrafos(dados, aplicar) {
    if (gs.getProperty('instance_name') !== 'dev217534')
        throw new Error('Carga destinada à PDI dev217534.');

    var etapas = [
        ['problem', dados.problemas, ['number', 'short_description', 'description', 'opened_at']],
        ['change_request', dados.mudancas, ['number', 'short_description', 'description', 'start_date']],
        ['incident', dados.incidentes, ['number', 'short_description', 'description',
            'opened_at', 'resolved_at', 'state', 'active', 'close_notes', 'u_sintoma',
            'u_system_name', 'u_system_module', 'problem_id', 'caused_by', 'rfc']]
    ];

    function validar(tabela, registros, campos) {
        var r = new GlideRecord(tabela);
        campos.forEach(function(campo) {
            if (!r.isValidField(campo)) throw new Error(tabela + ': campo ausente ' + campo);
        });
        registros.forEach(function(item) {
            var existente = new GlideRecord(tabela);
            existente.addQuery('sys_id', item.sys_id).addOrCondition('number', item.number);
            existente.setLimit(1);
            existente.query();
            if (existente.next()) throw new Error('Colisão em ' + tabela + ': ' + item.number);
        });
    }

    etapas.forEach(function(etapa) { validar(etapa[0], etapa[1], etapa[2]); });
    validar('problem', [], ['rfc']);
    if (typeof global.RetroGrafosTagger !== 'function') throw new Error('Instale RetroGrafosTagger antes da carga.');
    gs.info('[RetroGrafos] Conferência concluída: ' + dados.incidentes.length + ' incidentes, ' +
        dados.problemas.length + ' problemas e ' + dados.mudancas.length + ' mudanças.');
    if (!aplicar) return;

    function gravar(tabela, registros, campos) {
        registros.forEach(function(item) {
            var r = new GlideRecord(tabela);
            r.initialize();
            r.setNewGuidValue(item.sys_id);
            r.setWorkflow(false);
            campos.forEach(function(campo) {
                var valor = item[campo];
                if (valor === null || valor === undefined) return;
                if (campo === 'opened_at' || campo === 'resolved_at' || campo === 'start_date')
                    valor = valor.slice(0, 19).replace('T', ' ');
                r.setValue(campo, valor);
            });
            if (!r.insert()) throw new Error('Falha ao inserir ' + item.number);
        });
    }

    etapas.forEach(function(etapa) { gravar(etapa[0], etapa[1], etapa[2]); });
    dados.problemas.forEach(function(item) {
        var r = new GlideRecord('problem');
        if (!r.get(item.sys_id)) throw new Error('Problema ausente: ' + item.number);
        r.setWorkflow(false);
        r.setValue('rfc', item.rfc);
        if (!r.update()) throw new Error('Falha no vínculo de ' + item.number);
    });
    var tagger = new global.RetroGrafosTagger();
    dados.incidentes.forEach(function(item) {
        tagger.syncIncidentTags(item.sys_id, item.tags, []);
    });
    gs.info('[RetroGrafos] Carga e tags nativas aplicadas.');
}
