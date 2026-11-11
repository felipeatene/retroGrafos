(function provisionRetroGrafosCore() {
    gs.info('=== [RetroGrafos] PASSO 1: Iniciando Provisionamento Estrutural ===');

    // 1.1 Criar e Ativar o Update Set Global
    var usName = 'RetroGrafos_Base_Schema_v1';
    var usId = '';
    var usGr = new GlideRecord('sys_update_set');
    usGr.addQuery('name', usName);
    usGr.addQuery('state', 'in progress');
    usGr.query();
    if (usGr.next()) {
        usId = usGr.getUniqueValue();
        gs.info('[Update Set] Usando existente: ' + usName + ' (' + usId + ')');
    } else {
        usGr.initialize();
        usGr.name = usName;
        usGr.description = 'RetroGrafos: 33 colunas u_ na tabela incident, Script Include RetroGrafosTagger e endpoints de sincronizacao de tags.';
        usGr.state = 'in progress';
        usId = usGr.insert();
        gs.info('[Update Set] Criado novo: ' + usName + ' (' + usId + ')');
    }

    if (!usId) throw new Error('Falha ao criar Update Set');
    if (usId) {
        var prefGr = new GlideRecord('sys_user_preference');
        prefGr.addQuery('user', gs.getUserID());
        prefGr.addQuery('name', 'sys_update_set');
        prefGr.query();
        if (prefGr.next()) {
            prefGr.value = usId;
            prefGr.update();
        } else {
            prefGr.initialize();
            prefGr.user = gs.getUserID();
            prefGr.name = 'sys_update_set';
            prefGr.type = 'string';
            prefGr.value = usId;
            prefGr.insert();
        }
        gs.getUser().savePreference('sys_update_set', usId);
    }

    // 1.2 Criar as 33 colunas customizadas (u_) na tabela incident
    var customFields = [
        { element: 'u_sintoma', label: 'Sintoma', type: 'string', max_length: 255 },
        { element: 'u_system_name', label: 'System Name', type: 'string', max_length: 150 },
        { element: 'u_system_module', label: 'System Module', type: 'string', max_length: 150 },
        { element: 'u_catalog_item_system_module_screen', label: 'Catalog Item / System Module Screen', type: 'string', max_length: 255 },
        { element: 'u_abertura_do_incidente', label: 'Abertura do Incidente', type: 'string', max_length: 100 },
        { element: 'u_trat_causa_raiz', label: 'Tratativa Causa Raiz', type: 'string', max_length: 500 },
        { element: 'u_rea_de_neg_cio_impactada', label: 'Area de Negocio Impactada', type: 'string', max_length: 150 },
        { element: 'u_segmento_impactado', label: 'Segmento Impactado', type: 'string', max_length: 150 },
        { element: 'u_impacted_groups', label: 'Impacted Groups', type: 'string', max_length: 500 },
        { element: 'u_loc_company_area', label: 'Company Area (Loc)', type: 'string', max_length: 150 },
        { element: 'u_loc_ativos', label: 'Ativos (Loc)', type: 'string', max_length: 255 },
        { element: 'u_loc_cost_center', label: 'Cost Center (Loc)', type: 'string', max_length: 100 },
        { element: 'u_loc_isglobal', label: 'Is Global (Loc)', type: 'boolean', max_length: 40 },
        { element: 'u_loc_telefone', label: 'Telefone (Loc)', type: 'string', max_length: 50 },
        { element: 'u_loc_validated_by', label: 'Validated By (Loc)', type: 'string', max_length: 150 },
        { element: 'u_mtta', label: 'MTTA', type: 'integer', max_length: 40 },
        { element: 'u_mttd', label: 'MTTD', type: 'integer', max_length: 40 },
        { element: 'u_mttr', label: 'MTTR', type: 'integer', max_length: 40 },
        { element: 'u_mttr2', label: 'MTTR 2', type: 'integer', max_length: 40 },
        { element: 'u_incident_duration', label: 'Incident Duration', type: 'glide_duration', max_length: 40 },
        { element: 'u_incident_exposure_time', label: 'Incident Exposure Time', type: 'glide_duration', max_length: 40 },
        { element: 'u_start_impact', label: 'Start Impact', type: 'glide_date_time', max_length: 40 },
        { element: 'u_qs_times_reassigned', label: 'Times Reassigned (QS)', type: 'integer', max_length: 40 },
        { element: 'u_quantidade_reopen', label: 'Quantidade Reopen', type: 'integer', max_length: 40 },
        { element: 'u_elegivel_repasse', label: 'Elegivel Repasse', type: 'boolean', max_length: 40 },
        { element: 'u_incidente_causado_por_mudanca', label: 'Incidente Causado por Mudanca', type: 'boolean', max_length: 40 },
        { element: 'u_tratado_work_room', label: 'Tratado Work Room', type: 'string', max_length: 100 },
        { element: 'u_provider_ticket', label: 'Provider Ticket', type: 'string', max_length: 100 },
        { element: 'u_azure_devops_team_project', label: 'Azure DevOps Team Project', type: 'string', max_length: 150 },
        { element: 'u_update_set_name', label: 'Update Set Name', type: 'string', max_length: 150 },
        { element: 'u_other_reason_for_cancellation', label: 'Other Reason for Cancellation', type: 'string', max_length: 255 },
        { element: 'u_size', label: 'Size', type: 'string', max_length: 50 },
        { element: 'u_victorops_key', label: 'VictorOps Key', type: 'string', max_length: 150 }
    ];

    var createdCount = 0;
    var existingCount = 0;

    for (var i = 0; i < customFields.length; i++) {
        var f = customFields[i];
        var dictGr = new GlideRecord('sys_dictionary');
        dictGr.addQuery('name', 'incident');
        dictGr.addQuery('element', f.element);
        dictGr.query();

        if (!dictGr.next()) {
            dictGr.initialize();
            dictGr.name = 'incident';
            dictGr.element = f.element;
            dictGr.column_label = f.label;
            dictGr.internal_type = f.type;
            dictGr.max_length = f.max_length;
            dictGr.active = true;
            if (!dictGr.insert()) throw new Error('Falha ao criar campo ' + field.element);
            createdCount++;
        } else {
            existingCount++;
        }
    }
    gs.info('[Dicionario] Colunas criadas: ' + createdCount + ' | Ja existiam: ' + existingCount);

    // 1.3 Criar Script Include Global: RetroGrafosTagger
    var siName = 'RetroGrafosTagger';
    var siCode = [
        "var RetroGrafosTagger = Class.create();",
        "RetroGrafosTagger.prototype = {",
        "    initialize: function() {},",
        "",
        "    ensureLabel: function(tagName) {",
        "        var cleanTag = (tagName + '').trim();",
        "        if (!cleanTag) return null;",
        "        var lbl = new GlideRecord('label');",
        "        lbl.addQuery('name', cleanTag);",
        "        lbl.addQuery('viewable_by', 'everyone');",
        "        lbl.addQuery('type', 'standard');",
        "        lbl.query();",
        "        if (lbl.next()) return lbl.getUniqueValue();",
        "        lbl.initialize();",
        "        lbl.name = cleanTag;",
        "        lbl.viewable_by = 'everyone';",
        "        lbl.type = 'standard';",
        "        lbl.active = true;",
        "        return lbl.insert();",
        "    },",
        "",
        "    syncIncidentTags: function(incidentSysId, addTagsArray, removeTagsArray) {",
        "        var result = { incident_sys_id: incidentSysId, added: [], skipped_existing: [], removed: [] };",
        "        addTagsArray = addTagsArray || [];",
        "        removeTagsArray = removeTagsArray || [];",
        "",
        "        for (var r = 0; r < removeTagsArray.length; r++) {",
        "            var tagToRemove = (removeTagsArray[r] + '').trim();",
        "            if (!tagToRemove) continue;",
        "            var delEntry = new GlideRecord('label_entry');",
        "            delEntry.addQuery('table', 'incident');",
        "            delEntry.addQuery('table_key', incidentSysId);",
        "            var qc = delEntry.addQuery('title', tagToRemove);",
        "            qc.addOrCondition('label.name', tagToRemove);",
        "            delEntry.query();",
        "            while (delEntry.next()) {",
        "                if (!delEntry.deleteRecord()) throw new Error('Falha ao remover etiqueta');",
        "                result.removed.push(tagToRemove);",
        "            }",
        "        }",
        "",
        "        for (var a = 0; a < addTagsArray.length; a++) {",
        "            var tagToAdd = (addTagsArray[a] + '').trim();",
        "            if (!tagToAdd) continue;",
        "            var labelSysId = this.ensureLabel(tagToAdd);",
        "            if (!labelSysId) throw new Error('Falha ao obter etiqueta');",
        "",
        "            var entry = new GlideRecord('label_entry');",
        "            entry.addQuery('table', 'incident');",
        "            entry.addQuery('table_key', incidentSysId);",
        "            entry.addQuery('label', labelSysId);",
        "            entry.query();",
        "            if (entry.next()) {",
        "                result.skipped_existing.push(tagToAdd);",
        "            } else {",
        "                entry.initialize();",
        "                entry.label = labelSysId;",
        "                entry.title = tagToAdd;",
        "                entry.table = 'incident';",
        "                entry.table_key = incidentSysId;",
        "                entry.read = 'yes';",
        "                entry.url = 'incident.do?sys_id=' + incidentSysId + '&sysparm_view=';",
        "                if (!entry.insert()) throw new Error('Falha ao inserir vínculo');",
        "                result.added.push(tagToAdd);",
        "            }",
        "        }",
        "        return result;",
        "    },",
        "",
        "    syncBatch: function(itemsArray) {",
        "        var batchResults = [];",
        "        itemsArray = itemsArray || [];",
        "        for (var i = 0; i < itemsArray.length; i++) {",
        "            var item = itemsArray[i];",
        "            if (!item.incident_sys_id) continue;",
        "            batchResults.push(this.syncIncidentTags(item.incident_sys_id, item.add_tags, item.remove_tags));",
        "        }",
        "        return batchResults;",
        "    },",
        "    type: 'RetroGrafosTagger'",
        "};"
    ].join('\n');

    var siGr = new GlideRecord('sys_script_include');
    siGr.addQuery('name', siName);
    siGr.query();
    if (siGr.next()) {
        siGr.script = siCode;
        siGr.active = true;
        siGr.update();
        gs.info('[Script Include] Atualizado: ' + siName);
    } else {
        siGr.initialize();
        siGr.name = siName;
        siGr.api_name = 'global.' + siName;
        siGr.client_callable = false;
        siGr.active = true;
        siGr.access = 'public';
        siGr.description = 'Motor idempotente de manipulacao de tags (label/label_entry) em lote para o RetroGrafos.';
        siGr.script = siCode;
        siGr.insert();
        gs.info('[Script Include] Criado: ' + siName);
    }
})();
