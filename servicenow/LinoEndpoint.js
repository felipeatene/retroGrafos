(function process(request, response) {
    function responder(status, corpo) {
        response.setStatus(status);
        response.setHeader('Cache-Control', 'no-store');
        response.setBody(corpo);
    }

    function parametro(nome) {
        var valor = request.queryParams[nome];
        return valor ? String(valor) : '';
    }

    function validarIds(ids, servico) {
        return Array.isArray(ids) && ids.length > 0 && ids.length <= 25 && ids.every(function (id, i) {
            return servico.idValido(id) && ids.indexOf(id) === i;
        });
    }

    try {
        var servico = new LinoService();
        var acesso = servico.acesso(request);
        if (acesso !== 200) return responder(acesso, {erro: acesso === 401 ? 'sessao' : 'acesso'});

        var rota = LINO_ROTA;
        if (rota === 'acesso') {
            var incidenteId = parametro('incidente');
            if (incidenteId) {
                if (!servico.idValido(incidenteId)) return responder(400, {erro: 'parametros'});
                var incidente = servico.registro('incident', incidenteId);
                if (!incidente || !incidente.canWrite()) return responder(403, {erro: 'acesso'});
            }
            return responder(200, {usuario: servico.usuario});
        }
        if (rota === 'grafo' || rota === 'impacto') {
            var cursor = parametro('cursor');
            var tagId = rota === 'impacto' ? parametro('tag') : '';
            if (cursor && !servico.idValido(cursor) || rota === 'impacto' && !servico.idValido(tagId)) {
                return responder(400, {erro: 'parametros'});
            }
            return responder(200, servico.pagina(cursor, tagId));
        }
        // The caller binds every mutation to the identity from the access response.
        if (request.getHeader('X-Lino-User') !== servico.usuario) return responder(401, {erro: 'sessao'});
        var dados = request.body.data || {};
        if (!validarIds(dados.ids, servico)) return responder(400, {erro: 'parametros'});
        if (rota === 'remover') {
            if (!servico.idValido(dados.tag)) return responder(400, {erro: 'parametros'});
            return responder(200, {itens: servico.remover(dados.tag, dados.ids)});
        }
        if (rota === 'classificar') {
            var ignorados = dados.ignorados;
            if (!servico.motor.validarRegras(dados.regras) || !Array.isArray(ignorados) || ignorados.length > 1000 ||
                !ignorados.every(function (chave) { return typeof chave === 'string' && /^[a-z]+:[a-z0-9 ]{1,160}$/.test(chave); })) {
                return responder(400, {erro: 'parametros'});
            }
            return responder(200, {itens: servico.classificar(dados.ids, dados.regras, ignorados)});
        }
        return responder(404, {erro: 'rota'});
    } catch (erro) {
        gs.error('[Lino] Falha ao executar o recurso ' + LINO_ROTA);
        return responder(500, {erro: 'servicenow'});
    }
})(request, response);
