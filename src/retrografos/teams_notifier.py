from __future__ import annotations
import hashlib
import json
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any, Callable
from .analyzer import RecurrenceGroup


def build_adaptive_card(rec: RecurrenceGroup, instance_url: str = "https://dev217534.service-now.com") -> dict[str, Any]:
    tags_formatted = " ".join(f"#{t}" for t in rec.tag_signature)
    incidents_str = ", ".join(rec.incident_numbers)
    first_sys_id = rec.incident_sys_ids[0] if rec.incident_sys_ids else ""
    return {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "contentUrl": None,
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "body": [
                        {
                            "type": "TextBlock",
                            "text": f"🚨 Radar RetroGrafos: Recorrência Detectada ({rec.recurrence_id})",
                            "weight": "Bolder",
                            "size": "Large",
                            "color": "Attention",
                        },
                        {
                            "type": "FactSet",
                            "facts": [
                                {"title": "Sistema:", "value": rec.system_name},
                                {"title": "Incidentes na Semana:", "value": f"{rec.count} ({incidents_str})"},
                                {"title": "Assinatura de Tags:", "value": tags_formatted},
                                {"title": "Problema Sugerido:", "value": rec.suggested_problem},
                                {"title": "Artigo KB Sugerido:", "value": rec.suggested_kb},
                            ],
                        },
                        {
                            "type": "TextBlock",
                            "text": "💡 **Ação Recomendada:** Vincular chamados ao Problema raiz e acionar deflexão via Base de Conhecimento.",
                            "wrap": True,
                            "spacing": "Medium",
                        },
                    ],
                    "actions": [
                        {
                            "type": "Action.OpenUrl",
                            "title": "Abrir Incidente Âncora no ServiceNow",
                            "url": f"{instance_url.rstrip('/')}/nav_to.do?uri=incident.do?sys_id={first_sys_id}",
                        }
                    ],
                },
            }
        ],
    }


def compute_delivery_key(rec: RecurrenceGroup) -> str:
    raw = f"{rec.system_name}|{'|'.join(sorted(rec.tag_signature))}|{'|'.join(sorted(rec.incident_sys_ids))}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def send_teams_notifications(
    recurrences: list[RecurrenceGroup],
    ledger_path: Path,
    webhook_url: str | None = None,
    enable_send: bool = False,
    http_sender: Callable[[urllib.request.Request], int] | None = None,
) -> list[dict[str, Any]]:
    ledger: dict[str, Any] = {}
    if ledger_path.exists():
        ledger = json.loads(ledger_path.read_text(encoding="utf-8"))

    def _default_post(req: urllib.request.Request) -> int:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return int(resp.status)

    sender = http_sender or _default_post
    results: list[dict[str, Any]] = []

    for rec in recurrences:
        key = compute_delivery_key(rec)
        card = build_adaptive_card(rec)
        if key in ledger:
            results.append({"recurrence_id": rec.recurrence_id, "delivery_key": key, "status": "skipped_already_sent", "card": card})
            continue

        if not enable_send or not webhook_url:
            results.append({"recurrence_id": rec.recurrence_id, "delivery_key": key, "status": "preview_only", "card": card})
            continue

        data = json.dumps(card).encode("utf-8")
        req = urllib.request.Request(webhook_url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        try:
            status_code = sender(req)
        except urllib.error.HTTPError as error:
            status_code = error.code
        except OSError:
            results.append({"recurrence_id": rec.recurrence_id, "status": "failed", "card": card})
            continue
        if 200 <= status_code < 300:
            ledger[key] = {"recurrence_id": rec.recurrence_id, "system_name": rec.system_name, "count": rec.count}
            ledger_path.parent.mkdir(parents=True, exist_ok=True)
            temp = ledger_path.with_suffix(".tmp")
            temp.write_text(json.dumps(ledger, indent=2, ensure_ascii=False), encoding="utf-8")
            temp.replace(ledger_path)
            results.append({"recurrence_id": rec.recurrence_id, "delivery_key": key, "status": "sent", "http_status": status_code, "card": card})
        else:
            results.append({"recurrence_id": rec.recurrence_id, "delivery_key": key, "status": "failed", "http_status": status_code, "card": card})

    return results
