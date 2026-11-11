// Execute em System Definition > Scripts - Background (Escopo: global)
(function createRetroGrafosRestEndpoint() {
    gs.info('=== [RetroGrafos 2/3] Provisionando Role e Endpoint POST /api/global/retrografos/sync_tags ===');

    var roleName = 'retrografos_integrator';
    var roleGr = new GlideRecord('sys_user_role');
    roleGr.addQuery('name', roleName);
    roleGr.query();
    if (!roleGr.next()) {
        roleGr.initialize();
        roleGr.name = roleName;
        roleGr.description = 'Role dedicada para sincronizacao de tags do RetroGrafos via API REST.';
        roleGr.insert();
    }

    var serviceGr = new GlideRecord('sys_ws_definition');
    serviceGr.addQuery('service_id', 'retrografos');
    serviceGr.query();
    var serviceSysId = serviceGr.next() ? serviceGr.getUniqueValue() : (function() {
        serviceGr.initialize();
        serviceGr.name = 'RetroGrafos Tag Sync API';
        serviceGr.service_id = 'retrografos';
        serviceGr.namespace = 'global';
        serviceGr.active = true;
        return serviceGr.insert();
    })();

    var opScript = [
        "(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {",
        "    if (!gs.hasRole('retrografos_integrator') && !gs.hasRole('admin')) {",
        "        response.setStatus(403);",
        "        response.setBody({ error: 'Role retrografos_integrator obrigatoria.' });",
        "        return;",
        "    }",
        "    var body = request.body.data || {};",
        "    var items = body.items === undefined ? [body] : body;",
        "    if (!Array.isArray(items) || !items.length) {",
        "        response.setStatus(400);",
        "        response.setBody({ error: 'Payload vazio ou formato invalido.' });",
        "        return;",
        "    }",
        "    // Validacao estrutural de todo o lote antes da primeira gravacao",
        "    var seen = {};",
        "    function tagsValid(tags) {",
        "        if (tags === undefined) return true;",
        "        if (!Array.isArray(tags)) return false;",
        "        for (var t = 0; t < tags.length; t++) {",
        "            if (typeof tags[t] !== 'string' || !/^[a-z0-9_]{1,80}$/.test(tags[t])) return false;",
        "        }",
        "        return true;",
        "    }",
        "    for (var v = 0; v < items.length; v++) {",
        "        var it = items[v];",
        "        if (!it || typeof it.incident_sys_id !== 'string' || !/^[a-f0-9]{32}$/.test(it.incident_sys_id) || seen[it.incident_sys_id] || !tagsValid(it.add_tags) || !tagsValid(it.remove_tags)) {",
        "            response.setStatus(400);",
        "            response.setBody({ error: 'incident_sys_id invalido no indice ' + v });",
        "            return;",
        "        }",
        "        seen[it.incident_sys_id] = true;",
        "    }",
        "    var tagger = new global.RetroGrafosTagger();",
        "    var results = [];",
        "    var hasFailures = false;",
        "    for (var i = 0; i < items.length; i++) {",
        "        var item = items[i];",
        "        var incCheck = new GlideRecordSecure('incident');",
        "        if (!incCheck.get(item.incident_sys_id)) {",
        "            hasFailures = true;",
        "            results.push({ incident_sys_id: item.incident_sys_id, status: 'failed', error: 'Incident not found' });",
        "            continue;",
        "        }",
        "        try {",
        "        var syncRes = tagger.syncIncidentTags(item.incident_sys_id, item.add_tags || [], item.remove_tags || []);",
        "        syncRes.status = 'applied';",
        "        results.push(syncRes);",
        "        } catch (error) {",
        "            hasFailures = true;",
        "            results.push({ incident_sys_id: item.incident_sys_id, status: 'failed', error: 'Sincronização incompleta' });",
        "        }",
        "    }",
        "    response.setStatus(hasFailures ? 207 : 200);",
        "    response.setBody({ partial_failure: hasFailures, results: results });",
        "})(request, response);"
    ].join('\n');

    var opGr = new GlideRecord('sys_ws_operation');
    opGr.addQuery('web_service_definition', serviceSysId);
    opGr.addQuery('http_method', 'POST');
    opGr.addQuery('relative_path', '/sync_tags');
    opGr.query();
    if (opGr.next()) {
        opGr.operation_script = opScript;
        opGr.requires_authentication = true;
        opGr.update();
    } else {
        opGr.initialize();
        opGr.web_service_definition = serviceSysId;
        opGr.name = 'Sync Tags';
        opGr.http_method = 'POST';
        opGr.relative_path = '/sync_tags';
        opGr.requires_authentication = true;
        opGr.operation_script = opScript;
        opGr.insert();
    }
    gs.info('[RetroGrafos] Endpoint POST /api/global/retrografos/sync_tags ativo.');
})();
