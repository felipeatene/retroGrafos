# Especificação Técnica (SDD) — RetroGrafos

- Retornar ao [[../README|Índice Principal do Grafo]]
- Ver também: [[Arquitetura_ServiceNow|Mapa de Arquitetura]] e [[Runbook_Operacional|Runbook Operacional]]

## Regras de Negócio
1. **Sincronização Idempotente de Tags:** Gravada via `label` (`viewable_by = everyone`) e `label_entry`.
2. **Higienização Semanal:** Remove exclusivamente tags genéricas configuradas quando substituídas por tags específicas do motor.
3. **Limiar de Recorrência:** Grupos com $\ge 4$ incidentes distintos no mesmo sistema e assinatura de tags geram alerta de recorrência.
