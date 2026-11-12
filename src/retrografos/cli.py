from __future__ import annotations
import argparse
import datetime as dt
import json
import os
from uuid import uuid4
from pathlib import Path
from typing import Any

from .analyzer import build_sync_plan, detect_recurrences
from .dashboard import serve_dashboard, write_dashboard_files
from .models import ClassificationBatch
from .obsidian_exporter import export_obsidian_vault
from .servicenow_client import ServiceNowClient
from .teams_notifier import send_teams_notifications


def run_pipeline(
    incidents_data: list[dict[str, Any]],
    classifications_data: dict[str, Any],
    config_data: dict[str, Any],
    output_dir: Path,
    apply_changes: bool = False,
    sn_client: ServiceNowClient | None = None,
    send_teams: bool = False,
    teams_webhook: str | None = None,
    export_id: str | None = None,
) -> dict[str, Any]:
    batch = ClassificationBatch.from_dict(classifications_data)
    generic_tags = set(config_data.get("generic_tags", []))
    threshold = int(config_data.get("recurrence_threshold", 4))

    sync_plan = build_sync_plan(incidents_data, batch, generic_tags)
    recurrences, below_threshold = detect_recurrences(incidents_data, sync_plan, threshold=threshold)

    sync_execution: dict[str, Any] = {"mode": "apply" if apply_changes else "preview", "results": []}
    if apply_changes and sn_client is None:
        raise ValueError("Configure o cliente ServiceNow para aplicar alterações.")
    if send_teams and not teams_webhook:
        raise ValueError("Configure TEAMS_WORKFLOW_WEBHOOK_URL para enviar notificações.")
    if apply_changes and sn_client is not None:
        payload_items = [
            {
                "incident_sys_id": p.incident_sys_id,
                "add_tags": p.add_tags,
                "remove_tags": p.remove_tags,
            }
            for p in sync_plan
        ]
        if payload_items:
            try:
                sync_execution["response"] = sn_client.sync_tags_batch(payload_items)
            except OSError:
                sync_execution["response"] = {"partial_failure": True, "error": "Aplicação não confirmada"}

    output_dir.mkdir(parents=True, exist_ok=True)
    ledger_path = output_dir / "sent_notifications.json"
    teams_results = send_teams_notifications(
        recurrences=recurrences,
        ledger_path=ledger_path,
        webhook_url=teams_webhook,
        enable_send=send_teams and not sync_execution.get("response", {}).get("partial_failure"),
    )

    report = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "mode": "apply" if apply_changes else "preview",
        "recurrence_threshold": threshold,
        "incidents": incidents_data,
        "sync_plan": [vars(p) for p in sync_plan],
        "sync_execution": sync_execution,
        "recurrences": [vars(r) for r in recurrences],
        "below_threshold": [vars(r) for r in below_threshold],
        "teams_notifications": teams_results,
    }

    report_path = output_dir / "retrografos_report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    dashboard_path = write_dashboard_files(report, output_dir / "dashboard")
    vault_folder_name = f"{export_id or 'obsidian_vault'}_{uuid4().hex[:12]}"
    obsidian_summary = export_obsidian_vault(report, output_dir / vault_folder_name)

    report["artifacts"] = {
        "report_json": str(report_path),
        "dashboard_html": str(dashboard_path),
        "obsidian_vault": obsidian_summary,
    }
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="retrografos", description="CLI RetroGrafos ServiceNow + Teams + Obsidian")
    sub = parser.add_subparsers(dest="command", required=True)

    p_demo = sub.add_parser("demo", help="Executa a demonstracao completa offline com dados sinteticos")
    p_demo.add_argument("--output-dir", default="output", help="Diretorio de saida dos artefatos")

    p_extrair = sub.add_parser("extrair", help="Exporta incidentes da semana do ServiceNow")
    p_extrair.add_argument("--saida", required=True, type=Path)

    p_sync = sub.add_parser("sync", help="Executa sincronizacao a partir de um JSON do motor")
    p_sync.add_argument("--incidents-file", default="demo/synthetic_incidents.json")
    p_sync.add_argument("--classifications-file", default="demo/motor_classifications.json")
    p_sync.add_argument("--config-file", default="config/generic_tags.json")
    p_sync.add_argument("--output-dir", default="output")
    p_sync.add_argument("--aplicar", action="store_true", help="Aplica adicao/remocao no ServiceNow")
    p_sync.add_argument("--enviar-teams", action="store_true", help="Envia Adaptive Cards ao webhook do Teams")

    p_painel = sub.add_parser("painel", help="Serve o painel web local em http://127.0.0.1:8765")
    p_painel.add_argument("--port", type=int, default=8765)
    p_painel.add_argument("--output-dir", default="output/dashboard")

    args = parser.parse_args(argv)
    root = Path.cwd()

    if args.command == "extrair":
        client = ServiceNowClient(
            os.environ["SERVICENOW_INSTANCE_URL"],
            os.environ["SERVICENOW_USERNAME"],
            os.environ["SERVICENOW_PASSWORD"],
        )
        incidents = client.fetch_weekly_incidents()
        for incident in incidents:
            incident["existing_tags"] = client.fetch_incident_tags(incident["sys_id"])
        args.saida.parent.mkdir(parents=True, exist_ok=True)
        args.saida.write_text(json.dumps({"incidents": incidents}, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0

    if args.command == "demo":
        inc_data = json.loads((root / "demo/synthetic_incidents.json").read_text(encoding="utf-8"))["incidents"]
        cls_data = json.loads((root / "demo/motor_classifications.json").read_text(encoding="utf-8"))
        cfg_data = json.loads((root / "config/generic_tags.json").read_text(encoding="utf-8"))
        report = run_pipeline(
            incidents_data=inc_data,
            classifications_data=cls_data,
            config_data=cfg_data,
            output_dir=root / args.output_dir,
            apply_changes=False,
            send_teams=False,
            export_id="obsidian_vault_demo",
        )
        print(f"[OK] Relatorio gerado: {report['artifacts']['report_json']}")
        print(f"[OK] Painel HTML gerado: {report['artifacts']['dashboard_html']}")
        print(f"[OK] Vault Obsidian exportado: {report['artifacts']['obsidian_vault']['vault_path']} "
              f"({report['artifacts']['obsidian_vault']['notes_count']} notas, "
              f"{len(report['artifacts']['obsidian_vault']['broken_links'])} links quebrados)")
        return 0

    if args.command == "sync":
        inc_data = json.loads(Path(args.incidents_file).read_text(encoding="utf-8"))["incidents"]
        cls_data = json.loads(Path(args.classifications_file).read_text(encoding="utf-8"))
        cfg_data = json.loads(Path(args.config_file).read_text(encoding="utf-8"))
        sn_client = None
        if args.aplicar:
            if any(incident.get("synthetic") is True for incident in inc_data):
                parser.error("Dados sintéticos só podem ser usados em prévia.")
            if Path(args.incidents_file).resolve() == (root / "demo/synthetic_incidents.json").resolve():
                parser.error("--aplicar exige um arquivo de incidentes da instância, obtido com extrair.")
            sn_client = ServiceNowClient(
                instance_url=os.environ["SERVICENOW_INSTANCE_URL"],
                username=os.environ["SERVICENOW_USERNAME"],
                password=os.environ["SERVICENOW_PASSWORD"],
            )
        webhook = os.environ.get("TEAMS_WORKFLOW_WEBHOOK_URL")
        stamp = dt.datetime.now().strftime("obsidian_vault_%Y%m%d_%H%M%S")
        report = run_pipeline(
            incidents_data=inc_data,
            classifications_data=cls_data,
            config_data=cfg_data,
            output_dir=Path(args.output_dir),
            apply_changes=args.aplicar,
            sn_client=sn_client,
            send_teams=args.enviar_teams,
            teams_webhook=webhook,
            export_id=stamp,
        )
        print(report["artifacts"]["report_json"])
        return int(bool(report["sync_execution"].get("response", {}).get("partial_failure"))
                   or any(item["status"] == "failed" for item in report["teams_notifications"]))

    if args.command == "painel":
        serve_dashboard(Path(args.output_dir), port=args.port)
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
