from datetime import datetime, timedelta
from uuid import NAMESPACE_URL, uuid5

# Causa raiz e correção por contexto. Os textos são integralmente fictícios.
CONTEXTS = {
    "Financeiro": ("Uma nova regra de conciliação serializou a fila de notas.",
                   "Reimplantar o processamento em lotes e validar notas em ambiente de teste.", True),
    "Logística": ("O consumidor de eventos descartava atualizações que chegavam fora de ordem.",
                  "Ordenar eventos por versão e reprocessar o lote de teste.", False),
    "Atendimento": ("Uma consulta sem índice esgotou a capacidade do portal após a publicação.",
                    "Criar índice e validar o tempo de consulta com tráfego sintético.", True),
    "Identidade": ("O serviço de sessão armazenava chaves antigas após a rotação.",
                   "Invalidar o cache na rotação e validar renovação de sessão.", False),
    "Estoque": ("Uma alteração no inventário introduziu uma condição de corrida entre integrações.",
                "Aplicar controle de versão ao saldo e reconciliar divergências.", True),
    "Relatórios": ("Exportações grandes excediam a memória disponível no processo.",
                   "Processar exportações em partes e medir o consumo de memória.", False),
}


def related_records(incidents):
    groups = {}
    for incident in incidents:
        groups.setdefault(incident["u_system_name"], []).append(incident)

    problems, changes = [], []
    for index, (system, group) in enumerate(sorted(groups.items()), 1):
        first = group[0]
        opened = datetime.fromisoformat(first["opened_at"])
        key = first["number"][4:10] + f"{index:02d}"
        cause, fix, deployment_related = CONTEXTS[system]

        def record_id(kind):
            return uuid5(NAMESPACE_URL, f"retrografos-demo/v1/{kind}/{key}").hex

        problem = {
            "sys_id": record_id("problem"), "number": f"DEMO-PRB-{key}",
            "short_description": f"[DEMO] Causa raiz em {system}",
            "description": cause,
            "opened_at": opened.isoformat(),
        }
        corrective = {
            "sys_id": record_id("corrective"), "number": f"DEMO-CHG-{key}-C",
            "short_description": f"[DEMO] Correção em {system}",
            "description": fix,
            "start_date": (opened + timedelta(days=2)).isoformat(),
            "kind": "corretiva",
            "problem_id": problem["sys_id"],
        }
        changes.append(corrective)
        problem["rfc"] = corrective["sys_id"]
        problems.append(problem)
        triggering = None
        if deployment_related:
            triggering = {
                "sys_id": record_id("trigger"), "number": f"DEMO-CHG-{key}-O",
                "short_description": f"[DEMO] Publicação anterior em {system}",
                "description": "Publicação fictícia relacionada ao início das ocorrências.",
                "start_date": (opened - timedelta(days=1)).isoformat(),
                "kind": "origem",
                "problem_id": problem["sys_id"],
            }
            changes.append(triggering)
        for incident in group:
            incident["short_description"] = "[DEMO] " + incident["short_description"]
            incident["description"] += " Hipótese investigada: " + cause
            incident["problem_id"] = problem["sys_id"]
            incident["problem_number"] = problem["number"]
            incident["rfc"] = corrective["sys_id"]
            if triggering:
                incident["caused_by"] = triggering["sys_id"]

    return problems, changes
