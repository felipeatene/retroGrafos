# Mapa de Arquitetura ServiceNow + Teams + Obsidian

- Retornar ao [[../README|Índice Principal do Grafo]]
- Especificação: [[Especificacao_SDD|Especificação SDD]]
- Operação: [[Runbook_Operacional|Runbook Operacional]]

## Fluxo de Dados
1. Extração paginada da `incident` no ServiceNow (33 campos `u_`).
2. Classificação pelo motor e sincronização no endpoint `/api/global/retrografos/sync_tags`.
3. Disparo de Adaptive Cards para o Microsoft Teams Workflows.
4. Geração do Painel Web Local e deste Cofre Obsidian.
