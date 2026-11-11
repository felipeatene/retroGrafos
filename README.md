# RetroGrafos

Documentação do projeto RetroGrafos, organizada em Markdown para consulta no GitHub e no Obsidian.

## Documentos

- [Arquitetura e mapeamento ServiceNow e Teams](documentacao/arquitetura_e_mapeamento_servicenow_teams.md)
- [Especificação SDD e runbook de provisionamento ServiceNow](documentacao/especifica_o_sdd_e_runbook_para_agente_ia_provisionamento_servicenow_retrografos.md)

- [Arquitetura, código e guia de implantação](documentacao/arquitetura_c_digo_completo_e_guia_de_implanta_o_retrografos.md)

## Abrir no Obsidian

Abra a pasta do repositório como um cofre no Obsidian. A visualização de grafo mostra este índice ligado aos documentos acima.


## Executar a demonstração

Na raiz do repositório, com Python 3.11 ou superior:

```powershell
python -m pip install -e .
retrografos demo
retrografos painel
```

Acesse http://127.0.0.1:8765. A demonstração cria o relatório em
`output/retrografos_report.json` e imprime o caminho de um cofre novo.
No Obsidian, use **Abrir pasta como cofre** e selecione a pasta gerada.
Abra a nota de índice e a visão de grafo.

## Fluxo semanal

Defina `SERVICENOW_INSTANCE_URL`, `SERVICENOW_USERNAME` e
`SERVICENOW_PASSWORD` no ambiente da conta de integração. Na raiz:

```powershell
retrografos extrair --saida output/incidentes.json
retrografos sync --incidents-file output/incidentes.json --classifications-file output/classificacoes.json
```

Entre os dois comandos, execute o seu motor sobre `output/incidentes.json`
para gerar `output/classificacoes.json`, usando o formato de
[exemplo](demo/motor_classifications.json). Revise o relatório.
Para gravar as tags, repita o comando de sincronização com `--aplicar`.
Para publicar Adaptive Cards, configure `TEAMS_WORKFLOW_WEBHOOK_URL`
e passe `--enviar-teams` na execução escolhida.

No Agendador de Tarefas do Windows, configure o disparo semanal para depois
da geração do JSON pelo motor. Use a raiz do repositório no campo **Iniciar
em** e o caminho completo do executável `retrografos` como programa.
Configure a tarefa para não iniciar outra instância se já estiver em execução.
O código de saída 1 indica falha de aplicação ou de notificação.

## Homologação na PDI

1. Selecione o escopo Global. Execute os scripts `01` e `02` em
   [servicenow](servicenow/) na ordem e confirme que o Update Set
   `RetroGrafos_Base_Schema_v1` está selecionado.
2. Confira os 33 campos, o Script Include, a função de integração e o
   serviço e recurso REST em **Customer Updates**. Atribua a função
   `retrografos_integrator` à conta de integração com acesso de leitura aos dados.
3. Execute o script `03` na PDI. Importe a
   [coleção Postman](demo/postman_collection.json), ajuste a URL e a autenticação
   e valide o GET e duas chamadas consecutivas de sincronização.
4. Após conferir a captura dos metadados, complete o Update Set e exporte
   o XML pela interface do ServiceNow.
