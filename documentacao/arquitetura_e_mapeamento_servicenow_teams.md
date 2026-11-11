# Mapeamento Estrutural ServiceNow, Motor de Tagueamento (Grafo) e Integração Teams

Este documento consolida a análise das suas fontes e estrutura todo o conhecimento necessário para construir o seu produto de classificação semântica de chamados, injeção de tags, disparo de **Adaptive Cards via Postman/API para o Microsoft Teams** e replicação das tabelas customizadas em um ambiente de Desenvolvimento (PDI/Dev).

---

## 1. Mapeamento das Tabelas do Ecossistema ServiceNow

Com base nos payloads e documentos fornecidos nas fontes, o seu sistema deve orbitar em torno de **7 tabelas principais**, divididas entre processos operacionais, gestão de conhecimento e a estrutura oculta de tags:

| Tabela (Nome Técnico) | Papel no Produto / Sistema |
| :--- | :--- |
| **`incident`** | Tabela central de incidentes. Fonte primária para leitura de descrições, sintomas e aplicação das classificações. |
| **`problem`** | Gestão de Problemas (ex: `PRB0053112`). Usada para agrupar incidentes recorrentes (> 3 incidentes com a mesma tag/sintoma). |
| **`change_request`** | Mudanças. Usada para correlacionar se um pico de tags de erro foi causado por um deploy ou mudança recente. |
| **`sc_req_item` / `sc_request`** | Requisições de serviço e itens de catálogo. |
| **`task_sla`** | Controle de SLA (`has_breached`, `percentage`, `stage`). Crucial para priorizar notificações no Teams. |
| **`kb_knowledge`** | Base de Conhecimento (Artigos KB). Usada para *Ticket Deflection* (vincular uma tag de erro recorrente, como "Limpeza de Cache", diretamente a um procedimento). |
| **`label` & `label_entry`** | **Tabelas Críticas de Tagueamento.** Onde as tags realmente residem e se relacionam com os chamados (explicado na Seção 3). |

---

## 2. Estruturação e Classificação dos Campos (`incident`)

Analisando o JSON extraído da instância (com referências da operação / Localiza), os campos foram higienizados e divididos em **4 categorias arquiteturais** para facilitar a criação do seu banco de dados em Desenvolvimento e configurar o filtro (`sysparm_fields`) nas requisições do Postman:

### 2.1. Campos Nativos (Core ITSM - Padrão de Fábrica)
Não precisam ser criados no ambiente de Dev, pois já existem nativamente em qualquer instância ServiceNow.
*   **Identificação e Roteamento:** `sys_id` (Chave única 32 hex), `number`, `sys_class_name`, `parent`, `parent_incident`, `universal_request`.
*   **Textos Livres (Insumo para o Grafo de Palavras-Chave):** `short_description` (Título do chamado), `description` (Descrição detalhada), `close_notes` (Notas de fechamento), `work_notes` (Diário técnico), `actions_taken`, `business_impact`, `cause`.
*   **Classificação e Estado:** `incident_state` / `state`, `priority`, `impact`, `urgency`, `severity`, `contact_type`, `close_code`, `route_reason`.
*   **Atores e Grupos:** `caller_id` (Solicitante), `assigned_to` (Analista), `assignment_group` (Fila de atendimento), `opened_by`, `resolved_by`, `closed_by`, `reopened_by`, `additional_assignee_list`.
*   **Ciclo de Vida e Métricas Nativas:** `opened_at`, `sys_created_on`, `sys_updated_on`, `resolved_at`, `closed_at`, `reopened_time`, `work_start`, `activity_due`, `business_duration`, `reassignment_count`, `reopen_count`, `made_sla`.
*   **Associações:** `problem_id`, `caused_by` (Mudança causadora), `service_offering`, `skills`, `ai_resolution_plan`, `sys_tags` *(Atenção: campo virtual)*.

### 2.2. Campos Customizados de Negócio (Prefixo `u_`)
Estes campos foram criados especificamente para a regra de negócio da empresa. **Você precisará recriá-los no seu domínio de Desenvolvimento.**

| Categoria | Nome da Coluna (`column_name`) | Tipo Sugerido no ServiceNow | Finalidade no Produto |
| :--- | :--- | :--- | :--- |
| **Triagem e Sintoma (Grafo)** | `u_sintoma` | String / Choice | Excelente âncora para cruzar com as tags geradas pelo texto livre. |
| | `u_system_name` | String / Reference | Nome do sistema afetado (ex: *Portal Fornecedor*, *CheckFácil*). |
| | `u_system_module` | String | Módulo específico do sistema. |
| | `u_catalog_item_system_module_screen` | String | Tela ou item de catálogo específico do erro. |
| | `u_abertura_do_incidente` | String (ex: *"decorrente"*) | Indica a origem/natureza da abertura. |
| | `u_trat_causa_raiz` | String | Mapeamento de causa raiz para o reprocessamento semanal. |
| **Impacto e Localidade (`u_loc_`)** | `u_rea_de_neg_cio_impactada` | String | Área de negócio afetada. |
| | `u_segmento_impactado` | String | Segmento de negócio afetado. |
| | `u_impacted_groups` | List / String | Grupos impactados pelo incidente. |
| | `u_loc_company_area` | String | Área corporativa (Customização Localiza). |
| | `u_loc_ativos` | Reference / String | Ativo/Equipamento vinculado. |
| | `u_loc_cost_center` | String | Centro de custo. |
| | `u_loc_isglobal` | True/False (Boolean) | Flag de impacto global. |
| | `u_loc_telefone` | Phone / String | Telefone de contato direto. |
| | `u_loc_validated_by` | Reference (`sys_user`) | Usuário que validou o chamado. |
| **Tempos, SLA e Qualidade** | `u_mtta`, `u_mttd`, `u_mttr`, `u_mttr2` | Integer / Duration | Métricas avançadas de tempo (Acknowledge, Detect, Resolve). |
| | `u_incident_duration` | Duration | Duração calculada do incidente. |
| | `u_incident_exposure_time` | Duration | Tempo de exposição do problema. |
| | `u_start_impact` | Date/Time | Início real do impacto. |
| | `u_qs_times_reassigned` | Integer | Contador customizado de repasses. |
| | `u_quantidade_reopen` | Integer | Contador customizado de reaberturas. |
| | `u_elegivel_repasse` | True/False (Boolean) | Indica se o chamado podia ser repassado de fila. |
| **Governança e Outros** | `u_incidente_causado_por_mudanca` | True/False (Boolean) | Flag direta para o relatório de estabilidade. |
| | `u_tratado_work_room` | True/False / String | Indica se houve sala de guerra (War Room). |
| | `u_provider_ticket` | String | Número do chamado em fornecedor externo. |
| | `u_azure_devops_team_project` | String | Projeto vinculado no Azure DevOps. |
| | `u_update_set_name` | String | Nome do pacote de atualização (Update Set). |
| | `u_other_reason_for_cancellation` | String | Motivo de cancelamento fora do padrão. |
| | `u_size` | String | Porte/Tamanho do chamado ou esforço. |

### 2.3. Campos de Escopo de Aplicações de Terceiros (Prefixo `x_`)
Estes campos pertencem a plugins instalados (AWS Service Catalog e Splunk/VictorOps). No seu ambiente de Dev, você **não** deve criá-los manualmente com `x_`; se precisar simulá-los sem instalar os plugins oficiais, crie-os com `u_` ou ignore-os no payload:
*   **AWS (`x_126749_aws_sc_`):** `awsstatus`, `awssupportcaseid`, `awsincidentarn`, `awsresolvetime`, `aws_last_scheduled_job_sync_time`.
*   **VictorOps / Splunk (`x_splu2_victorops_`):** `victorops_entity_id`, `victorops_incident`, `servicenow_initiated` (além do campo híbrido `u_victorops_key`).

---

## 3. O Segredo Técnico: Como Injetar Tags no Campo "Tag" via API

Nas suas fontes, há uma descoberta arquitetural valiosíssima chamada **"O Paradoxo do Tagueamento (`sys_tags`)"**. 

> **ATENÇÃO:** Se você fizer um `PATCH` ou `PUT` pelo Postman enviando `{"sys_tags": "minha_tag"}` diretamente na tabela `incident`, o ServiceNow retornará **Status 200 OK**, mas **NÃO salvará a tag**. Isso ocorre porque `sys_tags` é um campo virtual de exibição (relacionamento Muitos-para-Muitos).

### Como fazer a inclusão e exclusão real das Tags (Pelo Postman ou Script):
Para que a sua classificação diária e a **reanálise/limpeza de final de semana** funcionem, você deve apontar o Postman para a tabela **`label_entry`**:

1.  **Para ADICIONAR uma Tag a um Chamado (`POST`):**
    *   **Endpoint:** `POST https://<sua-instancia>.service-now.com/api/now/table/label_entry`
    *   **Body (JSON):**
        ```json
        {
          "title": "erro_cache_portal",
          "table": "incident",
          "table_key": "a83820b58f723300e7e16c7827bdeed2",
          "read": "yes",
          "url": "incident.do?sys_id=a83820b58f723300e7e16c7827bdeed2&sysparm_view="
        }
        ```
        *(Onde `table_key` é o `sys_id` do incidente e `title` ou `label` é a tag/palavra-chave classificada pelo seu grafo).*

2.  **Para REANALISAR e EXCLUIR Tags Irrelevantes no Fim da Semana (`GET` + `DELETE`):**
    *   Quando o seu algoritmo identificar que tags genéricas (como `"sistema"`, `"problema"`, `"lentidao"`) não são cruciais e devem ser substituídas por tags de contexto (como `"ortopedia_osso"` no seu exemplo, ou `"limpeza_cache_kb"`):
    *   **Passo 1 (Buscar vínculos da semana):** `GET /api/now/table/label_entry?sysparm_query=table=incident^sys_created_onONThis week@javascript:gs.beginningOfThisWeek()@javascript:gs.endOfThisWeek()`
    *   **Passo 2 (Deletar a tag genérica):** `DELETE /api/now/table/label_entry/{sys_id_da_label_entry}`
    *   **Passo 3 (Inserir a tag refinada):** Executa o `POST` acima com a nova tag reclassificada.

---

## 4. Enviando Adaptive Cards via Postman para o Microsoft Teams e Painéis

Você perguntou se existe alguma API onde seja possível disparar um comando pelo Postman para enviar um **Adaptive Card** para o Microsoft Teams e também exibir em um painel. **Sim, existem duas formas diretas e imediatas de fazer isso via Postman!**

### 4.1. Envio Direto pelo Postman via Power Automate (Workflows Webhook) — *Mais Rápido*
Hoje, a Microsoft substituiu os conectores antigos pelos **Workflows do Teams (Power Automate)**. Você cria um fluxo no Teams com o gatilho *"Quando uma solicitação de webhook do Teams é recebida"* (que gera uma URL de API `POST` pública/autenticada).

No **Postman**, basta fazer um `POST` para essa URL enviando o JSON abaixo no Body:

```json
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "contentUrl": null,
      "content": {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [
          {
            "type": "TextBlock",
            "text": "🏷️ Classificação Automática & Radar ServiceNow",
            "weight": "Bolder",
            "size": "Large",
            "color": "Accent"
          },
          {
            "type": "FactSet",
            "facts": [
              { "title": "Chamado:", "value": "INC3109927" },
              { "title": "Sistema:", "value": "Portal Fornecedor" },
              { "title": "Tags Aplicadas:", "value": "#erro_envio #centralizada #cache" },
              { "title": "Problema Associado:", "value": "PRB0053112 (14 recorrências)" }
            ]
          },
          {
            "type": "TextBlock",
            "text": "💡 **Sugestão de KB:** Procedimento de limpeza de cache identificado para este sintoma.",
            "wrap": true,
            "spacing": "Medium"
          }
        ],
        "actions": [
          {
            "type": "Action.OpenUrl",
            "title": "Abrir Chamado no ServiceNow",
            "url": "https://sua_instancia.service-now.com/nav_to.do?uri=incident.do?sys_id=SYS_ID_AQUI"
          }
        ]
      }
    }
  ]
}
```

### 4.2. Envio Proativo 1:1 com Bot Framework REST API (Com Interação de Retorno)
Se você quiser o modelo avançado descrito nas suas fontes — onde o cartão vai direto para o usuário que abriu o chamado perguntando mais detalhes (usando `Action.Execute` para atualizar o chamado de volta no ServiceNow):
1.  **Autenticação no Postman:** Faça um `POST` para `https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token` com o `client_id` e `client_secret` do seu Bot registrado no Azure.
2.  **Disparo do Card no Postman:** Faça um `POST` para `https://smba.trafficmanager.net/amer/v3/conversations/{conversationId}/activities` passando o Bearer Token e o JSON do Adaptive Card no campo `attachments`.

### 4.3. Como colocar isso em um Painel (Dentro do ServiceNow ou SharePoint)?
Como visto nas suas fontes, **o SharePoint tradicional não renderiza Adaptive Cards soltos facilmente para dashboards**, e o iFrame no SharePoint sofre bloqueio de segurança (`X-Frame-Options`). Para ter um **Painel Visual**:
*   **Dentro do próprio ServiceNow (UI Page / Portal Widget):** Você pode criar um **Service Portal Widget** no seu domínio de Dev que usa a biblioteca oficial em JavaScript `adaptivecards` (da própria Microsoft via CDN) para renderizar exatamente o mesmo JSON do Adaptive Card dentro de uma página ou dashboard do ServiceNow!
*   **No Ecossistema Microsoft:** Use o dataset JSON gerado pelo seu classificador de tags para alimentar uma **Lista do SharePoint** ou **Power BI**, onde você terá gráficos nativos do grafo de tags da semana.

---

## 5. Guia Prático: Como Replicar as Tabelas no seu Domínio de Desenvolvimento

Como você já criou uma instância/domínio de desenvolvimento (PDI - *Personal Developer Instance*) e tem a Collection do Postman com o exemplo do JSON, existem **3 caminhos** para replicar a estrutura de colunas (`u_...`) sem ter acesso administrativo à instância de produção para exportar um Update Set:

### Opção A: Automação via Script Background (A mais rápida usando seu JSON)
Você não precisa criar os 25+ campos `u_` um por um na mão pela tela do ServiceNow! Você pode usar a tabela de dicionário do ServiceNow (`sys_dictionary`) ou um script rápido em **System Definition > Scripts - Background** na sua instância de Dev para ler as chaves do seu JSON do Postman e criar todas as colunas `u_` na tabela `incident` de uma só vez:

```javascript
// Rode este script em "Scripts - Background" na sua instância de DEV
var customFields = [
    { element: 'u_sintoma', label: 'Sintoma', type: 'string', max_length: 255 },
    { element: 'u_system_name', label: 'System Name', type: 'string', max_length: 100 },
    { element: 'u_system_module', label: 'System Module', type: 'string', max_length: 100 },
    { element: 'u_abertura_do_incidente', label: 'Abertura do Incidente', type: 'string', max_length: 100 },
    { element: 'u_trat_causa_raiz', label: 'Tratativa Causa Raiz', type: 'string', max_length: 255 },
    { element: 'u_rea_de_neg_cio_impactada', label: 'Área de Negócio Impactada', type: 'string', max_length: 100 },
    { element: 'u_segmento_impactado', label: 'Segmento Impactado', type: 'string', max_length: 100 },
    { element: 'u_loc_company_area', label: 'Company Area (Loc)', type: 'string', max_length: 100 },
    { element: 'u_loc_ativos', label: 'Ativos (Loc)', type: 'string', max_length: 100 },
    { element: 'u_loc_cost_center', label: 'Cost Center (Loc)', type: 'string', max_length: 50 },
    { element: 'u_loc_isglobal', label: 'Is Global (Loc)', type: 'boolean', max_length: 40 },
    { element: 'u_elegivel_repasse', label: 'Elegível Repasse', type: 'boolean', max_length: 40 },
    { element: 'u_incidente_causado_por_mudanca', label: 'Incidente Causado por Mudança', type: 'boolean', max_length: 40 },
    { element: 'u_quantidade_reopen', label: 'Quantidade Reopen', type: 'integer', max_length: 40 },
    { element: 'u_qs_times_reassigned', label: 'Times Reassigned (QS)', type: 'integer', max_length: 40 }
];

customFields.forEach(function(field) {
    var gr = new GlideRecord('sys_dictionary');
    gr.addQuery('name', 'incident');
    gr.addQuery('element', field.element);
    gr.query();
    if (!gr.next()) {
        gr.initialize();
        gr.name = 'incident';
        gr.element = field.element;
        gr.column_label = field.label;
        gr.internal_type = field.type;
        gr.max_length = field.max_length;
        gr.active = true;
        gr.insert();
        gs.info('Campo criado com sucesso: ' + field.element);
    } else {
        gs.info('Campo já existe: ' + field.element);
    }
});
```

### Opção B: Import Sets via Payload JSON
1. Salve um arquivo `.json` com os registros que você capturou no Postman.
2. No seu ServiceNow de Dev, vá em **System Import Sets > Load Data**.
3. Crie uma tabela de staging e, no **Transform Map** apontando para a tabela `incident`, o ServiceNow permite mapear ou criar os campos correspondentes automaticamente, já populando a sua base de desenvolvimento com dados reais de teste!

---

## 6. O que mais das suas fontes agrega valor direto a esse Produto?

Analisando todo o seu histórico anexado, existem **3 pontos de ouro** que você já pesquisou e que encaixam perfeitamente nesta arquitetura:

1.  **Filtro Cirúrgico no Postman (`sysparm_query` + `sysparm_fields`):**
    *   Como o JSON do incidente tem dezenas de campos vazios ou de integrações antigas (AWS, VictorOps), configure a sua requisição no Postman para trazer apenas os campos úteis ao classificador de tags:
    *   `GET /api/now/table/incident?sysparm_query=active=true^ORresolved_atONThis week@javascript:gs.beginningOfThisWeek()@javascript:gs.endOfThisWeek()&sysparm_fields=sys_id,number,short_description,description,close_notes,u_sintoma,u_system_name,u_trat_causa_raiz,problem_id`
2.  **Correlação Automática com Problemas (`PRB`) e Base de Conhecimento (`KB`):**
    *   Na sua reanálise de fim de semana, quando um grupo de tags combinadas (ex: `["portal_fornecedor", "erro_envio", "centralizada"]` ou `["checkfacil", "pdf", "devolucao"]`) aparecer em **mais de 3 incidentes**, o seu sistema não apenas limpa as tags ruins, mas já dispara o **Adaptive Card no Teams** sugerindo a vinculação ao Problema (`PRB0053112` / `PRB0053101`) ou a criação de um artigo na `kb_knowledge` (como o caso da limpeza de cache).
3.  **Extensão de Navegador vs. API Direta:**
    *   Você mencionou nas fontes a ideia de um plugin de navegador para injetar tags. Como o campo `sys_tags` exige gravação na tabela `label_entry`, fazer isso via **API REST (ou Servidor MCP em Python)** rodando em background (e disparando os resultados para o Teams via Adaptive Card) é muito mais seguro, escalável e imune a mudanças visuais na tela do ServiceNow do que injetar cliques via extensão de navegador.