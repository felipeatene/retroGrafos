(function seedRetroGrafosData() {
    gs.info('=== [RetroGrafos] PASSO 3: Iniciando Carga de Seed Data ===');

    function extractVal(val) {
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') {
            return (val.display_value || val.value || '') + '';
        }
        return val + '';
    }

    // 3.1 Criar Artigo de Base de Conhecimento (KB) para teste de deflexão / limpeza de cache
    var kbSysId = 'c11111118f723300e7e16c7827bdee01';
    var kbGr = new GlideRecord('kb_knowledge');
    if (!kbGr.get(kbSysId)) {
        kbGr.initialize();
        kbGr.setNewGuidValue(kbSysId);
        kbGr.number = 'KB0010991';
        kbGr.short_description = 'Procedimento de Limpeza de Cache e Sessão no Portal Fornecedor (Erro de Envio de NF)';
        kbGr.text = '<p><strong>Sintoma:</strong> Timeout ou travamento ao enviar Nota Fiscal pela tela Centralizada no Portal Fornecedor.</p><p><strong>Solução Definitiva:</strong> Limpar cookies/cache do navegador e reiniciar o token de sessão antes de reenviar o XML da NF.</p>';
        kbGr.workflow_state = 'published';
        kbGr.active = true;
        kbGr.setWorkflow(false);
        kbGr.insert();
        gs.info('[Seed KB] Criada KB0010991 (' + kbSysId + ')');
    }

    // 3.2 Criar Registro de Problema (PRB) para correlação de causa raiz
    var prbSysId = 'd22222228f723300e7e16c7827bdee02';
    var prbGr = new GlideRecord('problem');
    if (!prbGr.get(prbSysId)) {
        prbGr.initialize();
        prbGr.setNewGuidValue(prbSysId);
        prbGr.number = 'PRB0040550';
        prbGr.short_description = 'Vazamento de memória na fila de renderização de PDF do CheckFácil';
        prbGr.state = '2';
        prbGr.setWorkflow(false);
        prbGr.insert();
        gs.info('[Seed Problem] Criado PRB0040550 (' + prbSysId + ')');
    }

    // 3.3 Massa de Incidentes (Fiel ao payload JSON do Postman)
    var rawPayloads = [
    {
        "sys_id": "a83820b58f723300e7e16c7827bdeed1",
        "number": "INC3109927",
        "state": "6",
        "short_description": "Erro no envio de NF pelo Portal Fornecedor - Centralizada",
        "description": "Fornecedor relata lentidao e falha de timeout ao submeter nota fiscal pela tela centralizada. Limpeza de cache resolveu.",
        "close_notes": "Orientada limpeza de cache do navegador e reprocessamento.",
        "u_sintoma": "Erro de Envio / Timeout",
        "u_system_name": "Portal Fornecedor",
        "u_system_module": "Faturamento Centralizado",
        "u_trat_causa_raiz": "Cache corrompido na sessao do cliente",
        "problem_id": "d22222228f723300e7e16c7827bdee02",
        "initial_tags": [
            "sistema",
            "lentidao",
            "portal_fornecedor"
        ]
    },
    {
        "sys_id": "a83820b58f723300e7e16c7827bdeed2",
        "number": "INC3109928",
        "state": "6",
        "short_description": "Falha ao submeter Nota Fiscal na tela Centralizada do Portal Fornecedor",
        "description": "Usuario nao consegue enviar NF. Tela congela. Resolvido apos limpar cache.",
        "close_notes": "Aplicado procedimento KB0010991 de limpeza de cache.",
        "u_sintoma": "Erro de Envio / Timeout",
        "u_system_name": "Portal Fornecedor",
        "u_system_module": "Faturamento Centralizado",
        "u_trat_causa_raiz": "Cache de sessao",
        "problem_id": "d22222228f723300e7e16c7827bdee02",
        "initial_tags": [
            "problema",
            "erro",
            "portal_fornecedor"
        ]
    },
    {
        "sys_id": "a83820b58f723300e7e16c7827bdeed3",
        "number": "INC3109929",
        "state": "6",
        "short_description": "Timeout no Portal Fornecedor ao anexar XML na Centralizada",
        "description": "Lentidao extrema no envio de NF pelo portal. Limpeza de cache destravou o envio.",
        "close_notes": "Limpeza de cache executada com sucesso.",
        "u_sintoma": "Erro de Envio / Timeout",
        "u_system_name": "Portal Fornecedor",
        "u_system_module": "Faturamento Centralizado",
        "u_trat_causa_raiz": "Cache corrompido",
        "initial_tags": [
            "lentidao",
            "sistema"
        ]
    },
    {
        "sys_id": "a83820b58f723300e7e16c7827bdeed4",
        "number": "INC3109930",
        "state": "6",
        "short_description": "Portal Fornecedor travando no envio de NF Centralizada",
        "description": "Fornecedor sem conseguir faturar. Sessao presa em cache antigo.",
        "close_notes": "Limpeza de cookies e cache conforme KB0010991.",
        "u_sintoma": "Erro de Envio / Timeout",
        "u_system_name": "Portal Fornecedor",
        "u_system_module": "Faturamento Centralizado",
        "u_trat_causa_raiz": "Cache expirado",
        "problem_id": "d22222228f723300e7e16c7827bdee02",
        "initial_tags": [
            "falha",
            "suporte"
        ]
    },
    {
        "sys_id": "b94931c68f723300e7e16c7827bdeef1",
        "number": "INC3110452",
        "state": "6",
        "short_description": "CheckFacil nao gera PDF no termo de devolucao",
        "description": "App trava na geracao do PDF de vistoria de devolucao.",
        "close_notes": "Reiniciado servico de PDF.",
        "u_sintoma": "Falha na Geracao de PDF",
        "u_system_name": "CheckFÃ¡cil",
        "u_system_module": "Vistoria / Devolucao",
        "u_trat_causa_raiz": "Fila de PDF travada",
        "problem_id": "d22222228f723300e7e16c7827bdee02",
        "initial_tags": [
            "problema",
            "checkfacil"
        ]
    },
    {
        "sys_id": "b94931c68f723300e7e16c7827bdeef2",
        "number": "INC3110453",
        "state": "6",
        "short_description": "Erro ao exportar PDF de vistoria no CheckFacil",
        "description": "Cliente aguardando termo de devolucao na agencia.",
        "close_notes": "Reenviado PDF manualmente.",
        "u_sintoma": "Falha na Geracao de PDF",
        "u_system_name": "CheckFÃ¡cil",
        "u_system_module": "Vistoria / Devolucao",
        "u_trat_causa_raiz": "Worker de PDF indisponivel",
        "initial_tags": [
            "sistema",
            "erro"
        ]
    },
    {
        "sys_id": "b94931c68f723300e7e16c7827bdeef3",
        "number": "INC3110454",
        "state": "6",
        "short_description": "Termo de devolucao em branco no CheckFacil",
        "description": "PDF nao carrega assinatura na devolucao.",
        "close_notes": "Regerado documento.",
        "u_sintoma": "Falha na Geracao de PDF",
        "u_system_name": "CheckFÃ¡cil",
        "u_system_module": "Vistoria / Devolucao",
        "u_trat_causa_raiz": "Timeout renderizacao PDF",
        "initial_tags": [
            "lentidao"
        ]
    }
];

    var tagger = new global.RetroGrafosTagger();

    for (var i = 0; i < rawPayloads.length; i++) {
        var item = rawPayloads[i];
        var targetSysId = extractVal(item.sys_id);

        var openedDate = new GlideDateTime(gs.beginningOfThisWeek());
        var resolvedDate = new GlideDateTime();

        var gr = new GlideRecord('incident');
        var exists = gr.get(targetSysId);
        if (!exists) {
            gr.initialize();
            gr.setNewGuidValue(targetSysId);
        }

        for (var key in item) {
            if (key === 'sys_id' || key === 'initial_tags' || key === 'days_ago_opened' || key === 'days_ago_resolved') continue;
            if (gr.isValidField(key)) {
                gr.setValue(key, extractVal(item[key]));
            }
        }

        gr.sys_created_on = openedDate;
        gr.opened_at = openedDate;
        gr.resolved_at = resolvedDate;
        gr.closed_at = resolvedDate;
        gr.sys_updated_on = resolvedDate;

        gr.setWorkflow(false);
        gr.autoSysFields(false);

        if (exists) {
            gr.update();
            gs.info('[Seed Incident] Atualizado: ' + item.number + ' (' + targetSysId + ')');
        } else {
            gr.insert();
            gs.info('[Seed Incident] Inserido: ' + item.number + ' (' + targetSysId + ')');
        }

        if (item.initial_tags && item.initial_tags.length > 0) {
            var syncRes = tagger.syncIncidentTags(targetSysId, item.initial_tags, []);
            gs.info('[Seed Tags] ' + item.number + ' -> ' + JSON.stringify(syncRes));
        }
    }
})();
