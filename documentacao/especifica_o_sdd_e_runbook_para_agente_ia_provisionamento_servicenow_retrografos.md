# SDD & Runbook de Execução para Agente de IA: Provisionamento ServiceNow (`retroGrafos`)

> **Instrução Direta para o Agente Executor (System Prompt):**
> Você está atuando como um Arquiteto e Engenheiro de Plataforma ServiceNow Sênior. Sua missão é provisionar integralmente o ambiente de desenvolvimento (`https://dev217534.service-now.com`) para o sistema **RetroGrafos** (motor de classificação semântica em grafos e reprocessamento semanal de tags em incidentes).
> **Regra de Ouro:** Não altere nenhuma decisão arquitetural abaixo. Execute as fases na exata ordem sequencial definida neste documento, garantindo idempotência, isolamento em Update Set e validação de saída em cada etapa.

---

## 1. FASE 1 — CONSTITUIÇÃO ARQUITETURAL (Decisões Inegociáveis)

Todas as configurações executadas na instância ServiceNow DEVEM obedecer estritamente às 5 regras abaixo:

1. **Escopo e Empacotamento (`Global` + `Update Set`):**
   * Toda a criação de metadados deve ocorrer no escopo **`global`** para preservar o prefixo `u_` original das colunas do cliente.
   * Nenhuma alteração de dicionário ou script pode ser feita fora do Update Set dedicado **`RetroGrafos_Base_Schema_v1`**.
2. **Tipagem Desacoplada (Zero `Reference` Customizada):**
   * Todas as 33 colunas customizadas (`u_...`) mapeadas do payload produtivo devem ser criadas como tipos primitivos (`string`, `boolean`, `integer`, `glide_duration`, `glide_date_time`).
   * **Proibido** criar campos `u_` como `Reference` para evitar falhas de chave estrangeira (`Foreign Key`) por ausência de registros equivalentes nas tabelas `sys_user`, `sys_user_group` ou `cmdb_ci` da PDI.
3. **Ingestão Histórica Fiel (`Seed Data` com `Date Shift`):**
   * A carga da massa de incidentes deve usar `gr.setWorkflow(false)` e `gr.autoSysFields(false)` junto com `gr.setNewGuidValue(sys_id)` para preservar os `sys_id`s de 32 caracteres e os números (`INC...`) originais do JSON do Postman.
   * As datas (`sys_created_on`, `opened_at`, `resolved_at`) devem sofrer deslocamento dinâmico (*Date Shift*) para a **semana atual**, garantindo que as queries com `resolved_atONThis week` retornem a massa de testes imediatamente.
4. **Motor Idempotente de Tags (`label` + `label_entry`):**
   * **Nunca** gravar tags diretamente no campo `sys_tags` da tabela `incident`.
   * Toda inclusão de tag deve primeiro garantir a existência do registro pai na tabela `label` com `viewable_by = 'everyone'` e `type = 'standard'`, e depois vincular o registro na tabela `label_entry` (`table = 'incident'`, `table_key = <sys_id>`) sem duplicar entradas existentes.
5. **Exposição via Scripted REST API & Table API Otimizada:**
   * A leitura pelo motor de grafos externo deve usar `sysparm_display_value=true`, `sysparm_exclude_reference_link=true` e lista restrita em `sysparm_fields`.
   * A sincronização em lote (adição de tags específicas e remoção de tags genéricas descartadas no fim de semana) deve ser exposta via Script Include global (`global.RetroGrafosTagger`) e via Scripted REST API.

---

## 2. FASE 2 — ESPECIFICAÇÃO DE TABELAS E METADADOS

### 2.1 Tabelas Nativas Utilizadas
| Tabela ServiceNow | Papel no RetroGrafos | Operações Permitidas |
| :--- | :--- | :--- |
| `incident` | Tabela principal de chamados analisados pelo grafo. | `GET` (leitura filtrada) e `POST/PATCH` (apenas para Seed Data). |
| `problem` | Tabela de Problemas (`PRB`) para correlação de causa raiz (`problem_id`). | `GET` (consulta de problemas recorrentes). |
| `change_request` | Tabela de Mudanças (`CHG`) para correlação de incidentes causados por mudança. | `GET` (consulta de mudanças recentes). |
| `label` | Catálogo mestre de Tags do ServiceNow. | `GET` / `POST` (garantindo `viewable_by = 'everyone'`). |
| `label_entry` | Tabela relacional que aplica uma Tag (`label`) a um Incidente (`table_key`). | `GET` / `POST` (inclusão) / `DELETE` (limpeza semanal). |
| `kb_knowledge` | Base de conhecimento para deflexão de chamados (ex: limpeza de cache). | `GET` (consulta por palavra-chave/sintoma). |

### 2.2 Dicionário de Colunas Customizadas (`incident`)
O script de provisionamento deve criar exatamente estas **33 colunas customizadas (`u_`)** na tabela `incident`:

| Nome da Coluna (`element`) | Rótulo (`column_label`) | Tipo Interno (`internal_type`) | Tamanho (`max_length`) | Categoria no Grafo |
| :--- | :--- | :--- | :--- | :--- |
| `u_sintoma` | Sintoma | `string` | 255 | Âncora de Triagem |
| `u_system_name` | System Name | `string` | 150 | Âncora de Sistema |
| `u_system_module` | System Module | `string` | 150 | Âncora de Módulo |
| `u_catalog_item_system_module_screen` | Catalog Item / System Module Screen | `string` | 255 | Âncora de Tela |
| `u_abertura_do_incidente` | Abertura do Incidente | `string` | 100 | Origem (`decorrente`, etc.) |
| `u_trat_causa_raiz` | Tratativa Causa Raiz | `string` | 500 | Fechamento / Causa |
| `u_rea_de_neg_cio_impactada` | Area de Negocio Impactada | `string` | 150 | Impacto de Negócio |
| `u_segmento_impactado` | Segmento Impactado | `string` | 150 | Impacto de Negócio |
| `u_impacted_groups` | Impacted Groups | `string` | 500 | Grupos Afetados |
| `u_loc_company_area` | Company Area (Loc) | `string` | 150 | Localidade / Área |
| `u_loc_ativos` | Ativos (Loc) | `string` | 255 | Ativo / CI |
| `u_loc_cost_center` | Cost Center (Loc) | `string` | 100 | Centro de Custo |
| `u_loc_isglobal` | Is Global (Loc) | `boolean` | 40 | Abrangência |
| `u_loc_telefone` | Telefone (Loc) | `string` | 50 | Contato |
| `u_loc_validated_by` | Validated By (Loc) | `string` | 150 | Validador |
| `u_mtta` | MTTA | `integer` | 40 | Métrica de Tempo |
| `u_mttd` | MTTD | `integer` | 40 | Métrica de Tempo |
| `u_mttr` | MTTR | `integer` | 40 | Métrica de Tempo |
| `u_mttr2` | MTTR 2 | `integer` | 40 | Métrica de Tempo |
| `u_incident_duration` | Incident Duration | `glide_duration` | 40 | Duração |
| `u_incident_exposure_time` | Incident Exposure Time | `glide_duration` | 40 | Tempo de Exposição |
| `u_start_impact` | Start Impact | `glide_date_time` | 40 | Início do Impacto |
| `u_qs_times_reassigned` | Times Reassigned (QS) | `integer` | 40 | Qualidade / Repasse |
| `u_quantidade_reopen` | Quantidade Reopen | `integer` | 40 | Qualidade / Reabertura |
| `u_elegivel_repasse` | Elegivel Repasse | `boolean` | 40 | Qualidade / Repasse |
| `u_incidente_causado_por_mudanca` | Incidente Causado por Mudanca | `boolean` | 40 | Correlação com Mudança |
| `u_tratado_work_room` | Tratado Work Room | `string` | 100 | War Room / Crise |
| `u_provider_ticket` | Provider Ticket | `string` | 100 | Ticket Fornecedor Externo |
| `u_azure_devops_team_project` | Azure DevOps Team Project | `string` | 150 | Integração Engenharia |
| `u_update_set_name` | Update Set Name | `string` | 150 | Rastreabilidade Deploy |
| `u_other_reason_for_cancellation` | Other Reason for Cancellation | `string` | 255 | Cancelamento |
| `u_size` | Size | `string` | 50 | Dimensionamento |
| `u_victorops_key` | VictorOps Key | `string` | 150 | Alerta / Monitoramento |

---

## 3. FASE 3 — PASSO A PASSO DE EXECUÇÃO (RUNBOOK PARA A IA)

### Tarefa 1: Provisionar Update Set, Schema da Tabela `incident` e Script Include (`RetroGrafosTagger`)

**Onde executar:**
1. Navegue para `https://dev217534.service-now.com`.
2. No menu lateral (**All**), acesse **System Definition > Scripts - Background** (`/sys.scripts.do`).
3. Confirme que o seletor **Scope** está em **`global`**.
4. Cole e execute o script abaixo integralmente:

```javascript
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
            dictGr.insert();
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
        "        lbl.query();",
        "        if (lbl.next()) {",
        "            if (lbl.viewable_by != 'everyone') {",
        "                lbl.viewable_by = 'everyone';",
        "                lbl.update();",
        "            }",
        "            return lbl.getUniqueValue();",
        "        }",
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
        "                delEntry.deleteRecord();",
        "                result.removed.push(tagToRemove);",
        "            }",
        "        }",
        "",
        "        for (var a = 0; a < addTagsArray.length; a++) {",
        "            var tagToAdd = (addTagsArray[a] + '').trim();",
        "            if (!tagToAdd) continue;",
        "            var labelSysId = this.ensureLabel(tagToAdd);",
        "            if (!labelSysId) continue;",
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
        "                entry.insert();",
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
        "    }",
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
```

---

### Tarefa 2: Criar a Scripted REST API para Sincronização Atômica de Tags (`POST`)

Para evitar que o motor em Python ou o Postman precise disparar centenas de requisições individuais na `label_entry` durante a reanálise de fim de semana, execute o script abaixo em **System Definition > Scripts - Background** (ainda no escopo `global`) para criar automaticamente o endpoint REST customizado:

```javascript
(function createRetroGrafosRestApi() {
    gs.info('=== [RetroGrafos] PASSO 2: Criando Scripted REST API ===');

    var serviceName = 'RetroGrafos Tag Manager';
    var serviceId = 'retrografos';
    var apiSysId = '';

    var wsGr = new GlideRecord('sys_ws_definition');
    wsGr.addQuery('service_id', serviceId);
    wsGr.query();
    if (wsGr.next()) {
        apiSysId = wsGr.getUniqueValue();
        gs.info('[REST API] Servico existente localizado: ' + apiSysId);
    } else {
        wsGr.initialize();
        wsGr.name = serviceName;
        wsGr.service_id = serviceId;
        wsGr.namespace = 'global';
        wsGr.active = true;
        wsGr.short_description = 'API de sincronizacao em lote e idempotente de tags (label/label_entry) do RetroGrafos.';
        apiSysId = wsGr.insert();
        gs.info('[REST API] Novo servico criado: ' + apiSysId);
    }

    var opName = 'Sync Incident Tags';
    var opPath = '/sync_tags';
    var opScript = [
        "(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {",
        "    var body = request.body.data;",
        "    var tagger = new global.RetroGrafosTagger();",
        "",
        "    // Suporta envio de um unico chamado ou lote em 'items'",
        "    if (body.items && Array.isArray(body.items)) {",
        "        var batchRes = tagger.syncBatch(body.items);",
        "        response.setStatus(200);",
        "        response.setBody({ status: 'success', mode: 'batch', processed: batchRes.length, results: batchRes });",
        "        return;",
        "    }",
        "",
        "    if (!body.incident_sys_id) {",
        "        response.setStatus(400);",
        "        response.setBody({ status: 'error', message: 'Campo obrigatorio ausente: incident_sys_id ou array items.' });",
        "        return;",
        "    }",
        "",
        "    var singleRes = tagger.syncIncidentTags(body.incident_sys_id, body.add_tags || [], body.remove_tags || []);",
        "    response.setStatus(200);",
        "    response.setBody({ status: 'success', mode: 'single', result: singleRes });",
        "})(request, response);"
    ].join('\n');

    var opGr = new GlideRecord('sys_ws_operation');
    opGr.addQuery('web_service_definition', apiSysId);
    opGr.addQuery('relative_path', opPath);
    opGr.query();
    if (opGr.next()) {
        opGr.operation_script = opScript;
        opGr.active = true;
        opGr.update();
        gs.info('[REST Endpoint] Atualizado: POST /api/global/retrografos/sync_tags');
    } else {
        opGr.initialize();
        opGr.web_service_definition = apiSysId;
        opGr.name = opName;
        opGr.http_method = 'POST';
        opGr.relative_path = opPath;
        opGr.active = true;
        opGr.requires_authentication = true;
        opGr.operation_script = opScript;
        opGr.insert();
        gs.info('[REST Endpoint] Criado: POST /api/global/retrografos/sync_tags');
    }
})();
```

---

### Tarefa 3: Injetar a Massa Inicial de Incidentes, Problemas e KBs (`Seed Data` com `Date Shift`)

Execute o script abaixo em **System Definition > Scripts - Background** para popular a instância `dev217534` com registros representativos da operação (preservando os `sys_id` e `number` originais e deslocando as datas para a semana corrente):

```javascript
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
            "sys_id": "a83820b58f723300e7e16c7827bdeed2",
            "number": "INC3109927",
            "state": "6",
            "incident_state": "6",
            "priority": "3",
            "made_sla": "true",
            "short_description": "Erro no envio de NF pelo Portal Fornecedor - Centralizada",
            "description": "Fornecedor relata lentidão e falha de timeout ao submeter nota fiscal pela tela centralizada. Limpeza de cache resolveu paliativamente.",
            "close_notes": "Realizada orientação de limpeza de cache do navegador conforme KB0010991 e reprocessamento na fila.",
            "u_sintoma": "Erro de Envio / Timeout",
            "u_system_name": "Portal Fornecedor",
            "u_system_module": "Faturamento Centralizado",
            "u_catalog_item_system_module_screen": "Tela de Upload de NF Centralizada",
            "u_abertura_do_incidente": "decorrente",
            "u_trat_causa_raiz": "Cache corrompido na sessão do cliente",
            "u_rea_de_neg_cio_impactada": "Suprimentos",
            "u_segmento_impactado": "Corporativo",
            "u_loc_company_area": "Suprimentos / Financeiro",
            "u_loc_isglobal": "false",
            "u_elegivel_repasse": "true",
            "u_incidente_causado_por_mudanca": "false",
            "u_quantidade_reopen": "0",
            "u_qs_times_reassigned": "1",
            "days_ago_opened": 3,
            "days_ago_resolved": 1,
            "initial_tags": ["sistema", "lentidao", "portal_fornecedor"]
        },
        {
            "sys_id": "b94931c68f723300e7e16c7827bdeef9",
            "number": "INC3110452",
            "state": "6",
            "incident_state": "6",
            "priority": "2",
            "made_sla": "false",
            "problem_id": prbSysId,
            "short_description": "CheckFácil não gera PDF no termo de devolução",
            "description": "Durante o encerramento do contrato na agência, o aplicativo CheckFácil trava na geração do PDF de vistoria de devolução.",
            "close_notes": "Reiniciado serviço de geração de documentos e vinculado ao problema PRB0040550.",
            "u_sintoma": "Falha na Geração de PDF",
            "u_system_name": "CheckFácil",
            "u_system_module": "Vistoria / Devolução",
            "u_catalog_item_system_module_screen": "Termo de Devolução Mobile",
            "u_abertura_do_incidente": "operacional",
            "u_trat_causa_raiz": "Fila de renderização de PDF travada pós-deploy",
            "u_rea_de_neg_cio_impactada": "Operações de Agências",
            "u_segmento_impactado": "RAC (Rent a Car)",
            "u_loc_company_area": "Operações de Agências",
            "u_loc_isglobal": "true",
            "u_elegivel_repasse": "false",
            "u_incidente_causado_por_mudanca": "true",
            "u_quantidade_reopen": "1",
            "u_qs_times_reassigned": "2",
            "days_ago_opened": 2,
            "days_ago_resolved": 1,
            "initial_tags": ["problema", "checkfacil", "pdf"]
        },
        {
            "sys_id": "e77142d88f723300e7e16c7827bdee15",
            "number": "INC3110890",
            "state": "7",
            "incident_state": "7",
            "priority": "4",
            "made_sla": "true",
            "short_description": "Desbloquear Linha Móvel Corporativa",
            "description": "Chamado aberto pelo autoatendimento para desbloqueio de linha móvel.",
            "close_notes": "Chamado teste, somente para homologação do catalogo.",
            "contact_type": "self-service",
            "u_sintoma": "Bloqueio de Linha",
            "u_system_name": "Portal Telecom",
            "u_system_module": "Gestão de Linhas Móveis",
            "u_abertura_do_incidente": "decorrente",
            "u_loc_validated_by": "137074556f9a4300fbbc30767b3ee43a",
            "u_quantidade_reopen": "0",
            "u_qs_times_reassigned": "0",
            "days_ago_opened": 4,
            "days_ago_resolved": 2,
            "initial_tags": ["sistema", "telecom", "desbloqueio_linha"]
        }
    ];

    var tagger = new global.RetroGrafosTagger();

    for (var i = 0; i < rawPayloads.length; i++) {
        var item = rawPayloads[i];
        var targetSysId = extractVal(item.sys_id);

        var openedDate = new GlideDateTime();
        openedDate.addDaysUTC(-(item.days_ago_opened || 2));
        var resolvedDate = new GlideDateTime();
        resolvedDate.addDaysUTC(-(item.days_ago_resolved || 1));

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
```

---

### Tarefa 4: Fechar e Exportar o Update Set (Backup XML para o GitHub)

Após executar as Tarefas 1, 2 e 3:
1. Navegue em **All > System Update Sets > Local Update Sets** (`/sys_update_set_list.do`).
2. Localize e abra o Update Set **`RetroGrafos_Base_Schema_v1`**.
3. Verifique na aba inferior **Customer Updates** se constam as 33 colunas (`sys_dictionary`), o Script Include (`RetroGrafosTagger`) e a Scripted REST API (`RetroGrafos Tag Manager`).
4. Altere o campo **State** para **`Complete`** e clique em **Update**.
5. Reabra o registro, clique no Related Link **Export to XML** e salve o arquivo no repositório Git em `/servicenow/update_sets/RetroGrafos_Base_Schema_v1.xml`.

---

## 4. FASE 4 — CONTRATOS DE INTEGRAÇÃO (TESTES DE VALIDAÇÃO PARA A IA)

O Agente de IA (ou script em Python/Postman) deve executar estes 3 testes HTTP contra a instância `https://dev217534.service-now.com` (usando Basic Auth `admin` ou OAuth) para atestar que o ambiente está 100% operacional.

### Teste 1: Extração Enxuta da Semana para o Motor de Grafos (`GET`)
Busca todos os incidentes ativos ou resolvidos nesta semana trazendo apenas as colunas necessárias para o grafo e sem links de referência desnecessários:

```http
GET https://dev217534.service-now.com/api/now/table/incident?sysparm_query=active=true^ORresolved_atONThis week@javascript:gs.beginningOfThisWeek()@javascript:gs.endOfThisWeek()&sysparm_display_value=true&sysparm_exclude_reference_link=true&sysparm_limit=50&sysparm_fields=sys_id,number,state,priority,short_description,description,close_notes,u_sintoma,u_system_name,u_system_module,u_catalog_item_system_module_screen,u_abertura_do_incidente,u_trat_causa_raiz,u_rea_de_neg_cio_impactada,u_incidente_causado_por_mudanca,u_quantidade_reopen,u_qs_times_reassigned,problem_id,made_sla,opened_at,resolved_at
Accept: application/json
```
* **Critério de Aceite:** HTTP `200 OK` contendo os chamados `INC3109927`, `INC3110452` e `INC3110890` com os `sys_id`s exatos preservados.

### Teste 2: Auditoria das Tags Iniciais na `label_entry` (`GET`)
Verifica se as tags iniciais foram gravadas corretamente na tabela relacional:

```http
GET https://dev217534.service-now.com/api/now/table/label_entry?sysparm_query=table=incident^table_key=a83820b58f723300e7e16c7827bdeed2&sysparm_display_value=true&sysparm_exclude_reference_link=true&sysparm_fields=sys_id,title,label,table_key,read
Accept: application/json
```
* **Critério de Aceite:** HTTP `200 OK` listando as tags `"sistema"`, `"lentidao"` e `"portal_fornecedor"`.

### Teste 3: Reprocessamento Semanal em Lote via Scripted REST API (`POST`)
Simula a limpeza de fim de semana onde o motor de grafos remove palavras-chave genéricas (`"sistema"`, `"lentidao"`, `"problema"`) e injeta as tags reclassificadas de alta precisão em múltiplos chamados com uma única requisição:

```http
POST https://dev217534.service-now.com/api/global/retrografos/sync_tags
Content-Type: application/json
Accept: application/json

{
  "items": [
    {
      "incident_sys_id": "a83820b58f723300e7e16c7827bdeed2",
      "add_tags": ["erro_envio_nf", "faturamento_centralizado", "kb_limpeza_cache"],
      "remove_tags": ["sistema", "lentidao"]
    },
    {
      "incident_sys_id": "b94931c68f723300e7e16c7827bdeef9",
      "add_tags": ["falha_geracao_pdf", "termo_devolucao", "prb0040550", "causado_por_mudanca"],
      "remove_tags": ["problema"]
    }
  ]
}
```
* **Critério de Aceite:** HTTP `200 OK` retornando `"status": "success"`, `"mode": "batch"`, confirmando as tags removidas em `removed` e as novas tags inseridas em `added` (e se executado uma segunda vez seguida, retornando as tags em `skipped_existing` provando idempotência).

---

## 5. CHECKLIST FINAL DE VERIFICAÇÃO DO AGENTE

- [ ] **Check 1:** O Update Set `RetroGrafos_Base_Schema_v1` existe em `sys_update_set`?
- [ ] **Check 2:** As 33 colunas `u_` existem em `sys_dictionary` vinculadas à tabela `incident` como tipos primitivos?
- [ ] **Check 3:** O Script Include `global.RetroGrafosTagger` está ativo?
- [ ] **Check 4:** O endpoint `POST /api/global/retrografos/sync_tags` está ativo e responde `200 OK`?
- [ ] **Check 5:** Os chamados `INC3109927`, `INC3110452` e `INC3110890` aparecem na listagem de incidentes com suas respectivas tags visíveis na coluna `Tags` da interface do ServiceNow?