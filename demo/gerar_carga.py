"""Gera incidentes sintéticos e classificações compatíveis com o RetroGrafos."""

import argparse
from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
import json
from pathlib import Path
import random
from uuid import NAMESPACE_URL, uuid5

from contextos import related_records


SCENARIOS = (
    ("Financeiro", "Conciliação", "Atraso no processamento de notas", "atraso_notas"),
    ("Logística", "Rastreamento", "Falha na atualização de entregas", "falha_rastreamento"),
    ("Atendimento", "Portal", "Tempo limite ao consultar protocolos", "timeout_protocolos"),
    ("Identidade", "Acesso", "Erro ao renovar sessão", "erro_sessao"),
    ("Estoque", "Inventário", "Divergência na sincronização de saldo", "divergencia_saldo"),
    ("Relatórios", "Exportação", "Exportação interrompida", "falha_exportacao"),
)


def month_at(reference, offset):
    year, month = divmod(reference.year * 12 + reference.month - 1 + offset, 12)
    return date(year, month + 1, 1)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def generate_month(month, projected, phase, reference):
    key = month.strftime("%Y-%m")
    kind = "projecao" if projected else "historico"
    randomizer = random.Random(key)
    end_day = monthrange(month.year, month.month)[1]
    first_day = reference.day if month == reference.replace(day=1) else 1
    incidents, items = [], []
    for index, (system, module, symptom, tag) in enumerate(SCENARIOS):
        if index == 4:
            count = (1, 1, 2, 2, 2, 3)[phase] if not projected else (4, 6, 9)[phase]
        elif index == 5:
            count = 2
        else:
            count = randomizer.randint(4, 10)
        for sequence in range(count):
            day = first_day + sequence * (end_day - first_day) // count
            opened = datetime.combine(month.replace(day=day), time(9), timezone.utc)
            opened += timedelta(hours=randomizer.randrange(8))
            active = sequence == count - 1 and index in (1, 4)
            sys_id = uuid5(NAMESPACE_URL, f"retrografos-demo/v1/{key}/{tag}/{sequence}").hex
            number = f"DEMO{month:%Y%m}{index + 1:02d}{sequence + 1:03d}"
            incidents.append({
                "sys_id": sys_id,
                "number": number,
                "state": "2" if active else "6",
                "active": active,
                "opened_at": opened.isoformat(),
                "resolved_at": None if active else (opened + timedelta(hours=randomizer.randint(1, 18))).isoformat(),
                "short_description": symptom,
                "description": f"Cenário fictício de {module.lower()} no sistema {system}.",
                "close_notes": "" if active else "Validação concluída no cenário de demonstração.",
                "u_sintoma": symptom,
                "u_system_name": system,
                "u_system_module": module,
                "existing_tags": ["sistema"],
                "synthetic": True,
                "scenario": kind,
            })
            items.append({"incident_sys_id": sys_id, "tags": [tag]})
    incidents.sort(key=lambda incident: (incident["opened_at"], incident["number"]))
    return incidents, items


def generate(reference, destination):
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {"data_referencia": reference.isoformat(), "sintetico": True, "periodos": []}
    for kind, offsets in (("historico", range(-6, 0)), ("projecao", range(3))):
        all_incidents, all_items, all_problems, all_changes = [], [], [], []
        for phase, offset in enumerate(offsets):
            month = month_at(reference, offset)
            incidents, items = generate_month(month, kind == "projecao", phase, reference)
            problems, changes = related_records(incidents)
            folder = destination / kind / month.strftime("%Y-%m")
            folder.mkdir(parents=True, exist_ok=True)
            write_json(folder / "incidentes.json", {"incidents": incidents})
            write_json(folder / "classificacoes.json", {"schema_version": 1, "items": items})
            write_json(folder / "problemas.json", {"problems": problems})
            write_json(folder / "mudancas.json", {"changes": changes})
            manifest["periodos"].append({
                "mes": month.strftime("%Y-%m"), "cenario": kind,
                "incidentes": len(incidents), "pasta": folder.relative_to(destination).as_posix(),
            })
            all_incidents.extend(incidents)
            all_items.extend(items)
            all_problems.extend(problems)
            all_changes.extend(changes)
        write_json(destination / kind / "incidentes.json", {"incidents": all_incidents})
        write_json(destination / kind / "classificacoes.json", {"schema_version": 1, "items": all_items})
        write_json(destination / kind / "problemas.json", {"problems": all_problems})
        write_json(destination / kind / "mudancas.json", {"changes": all_changes})
        if kind == "historico":
            tags = {item["incident_sys_id"]: item["tags"] for item in all_items}
            payload = {
                "problemas": all_problems,
                "mudancas": all_changes,
                "incidentes": [dict(item, tags=tags[item["sys_id"]]) for item in all_incidents],
            }
            loader = Path(__file__).resolve().parents[1] / "servicenow/carga_demonstracao.js"
            script = loader.read_text(encoding="utf-8-sig")
            script += "\ncarregarRetroGrafos(" + json.dumps(payload, ensure_ascii=True) + ", false);\n"
            (destination / kind / "carga_pdi.js").write_text(script, encoding="utf-8")
    write_json(destination / "manifesto.json", manifest)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--referencia", required=True, type=date.fromisoformat)
    parser.add_argument("--saida", required=True, type=Path)
    args = parser.parse_args()
    result = generate(args.referencia, args.saida)
    print(f"{len(result['periodos'])} períodos gerados em {args.saida}")
