from __future__ import annotations
import json
import tempfile
import unittest
from pathlib import Path

from retrografos.analyzer import build_sync_plan, detect_recurrences
from retrografos.cli import run_pipeline
from retrografos.models import ClassificationBatch, ValidationError
from retrografos.servicenow_client import ServiceNowClient
from retrografos.teams_notifier import send_teams_notifications


class RetroGrafosTestSuite(unittest.TestCase):
    def setUp(self) -> None:
        root = Path(__file__).resolve().parents[1]
        self.incidents = json.loads((root / "demo/synthetic_incidents.json").read_text(encoding="utf-8"))["incidents"]
        self.classifications = json.loads((root / "demo/motor_classifications.json").read_text(encoding="utf-8"))
        self.config = json.loads((root / "config/generic_tags.json").read_text(encoding="utf-8"))

    def test_pagination_fetches_all_pages(self) -> None:
        calls: list[str] = []

        def fake_sender(req):
            calls.append(req.full_url)
            if "sysparm_offset=0" in req.full_url:
                return {"result": [{"sys_id": "1" * 32}, {"sys_id": "2" * 32}]}
            return {"result": [{"sys_id": "3" * 32}]}

        client = ServiceNowClient("https://dev217534.service-now.com", "user", "pass", http_sender=fake_sender)
        records = client.fetch_weekly_incidents(page_size=2)
        self.assertEqual(len(records), 3)
        self.assertEqual(len(calls), 2)

    def test_invalid_json_contracts_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            ClassificationBatch.from_dict({"schema_version": 2, "items": []})
        with self.assertRaises(ValidationError):
            ClassificationBatch.from_dict({"schema_version": 1, "items": [{"incident_sys_id": "curto", "tags": ["ok"]}]})
        with self.assertRaises(ValidationError):
            ClassificationBatch.from_dict(
                {
                    "schema_version": 1,
                    "items": [
                        {"incident_sys_id": "a" * 32, "tags": ["tag1"]},
                        {"incident_sys_id": "a" * 32, "tags": ["tag2"]},
                    ],
                }
            )

    def test_removal_restricted_to_configured_generic_tags_and_idempotent(self) -> None:
        batch = ClassificationBatch.from_dict(self.classifications)
        generics = set(self.config["generic_tags"])
        plan = build_sync_plan(self.incidents, batch, generics)
        first = plan[0]
        # 'sistema' e 'lentidao' sao genericas e devem sair; 'portal_fornecedor' nao e generica e deve permanecer
        self.assertIn("sistema", first.remove_tags)
        self.assertIn("lentidao", first.remove_tags)
        self.assertNotIn("portal_fornecedor", first.remove_tags)

        # Reexecutar sobre o estado ja sincronizado nao deve adicionar nem remover nada (idempotencia)
        updated_incidents = []
        for inc, p in zip(self.incidents, plan):
            clone = dict(inc)
            clone["existing_tags"] = list(p.final_tags)
            updated_incidents.append(clone)
        second_plan = build_sync_plan(updated_incidents, batch, generics)
        for p2 in second_plan:
            self.assertEqual(p2.add_tags, [])
            self.assertEqual(p2.remove_tags, [])

    def test_recurrence_threshold_four_vs_three_and_obsidian_links(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            report = run_pipeline(
                incidents_data=self.incidents,
                classifications_data=self.classifications,
                config_data=self.config,
                output_dir=Path(tmp),
            )
            self.assertEqual(len(report["recurrences"]), 1)
            self.assertEqual(report["recurrences"][0]["system_name"], "Portal Fornecedor")
            self.assertEqual(report["recurrences"][0]["count"], 4)

            self.assertEqual(len(report["below_threshold"]), 1)
            self.assertEqual(report["below_threshold"][0]["system_name"], "CheckFácil")
            self.assertEqual(report["below_threshold"][0]["count"], 3)

            vault_info = report["artifacts"]["obsidian_vault"]
            self.assertEqual(vault_info["broken_links"], [])

    def test_partial_failure_and_teams_deduplication(self) -> None:
        batch = ClassificationBatch.from_dict(self.classifications)
        plan = build_sync_plan(self.incidents, batch, set(self.config["generic_tags"]))
        recs, _ = detect_recurrences(self.incidents, plan, threshold=4)

        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "sent_notifications.json"
            calls = []

            def fake_post(req):
                calls.append(req.full_url)
                return 202

            res1 = send_teams_notifications(recs, ledger, webhook_url="https://teams.webhook/test", enable_send=True, http_sender=fake_post)
            res2 = send_teams_notifications(recs, ledger, webhook_url="https://teams.webhook/test", enable_send=True, http_sender=fake_post)
            self.assertEqual(res1[0]["status"], "sent")
            self.assertEqual(res2[0]["status"], "skipped_already_sent")
            self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
