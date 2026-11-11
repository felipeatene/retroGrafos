from __future__ import annotations
import base64
import json
import re
import urllib.parse
import urllib.request
from typing import Any, Callable

DEFAULT_INCIDENT_FIELDS = (
    "sys_id,number,state,short_description,description,close_notes,"
    "u_sintoma,u_system_name,u_system_module,u_trat_causa_raiz,problem_id"
)

DEFAULT_WEEKLY_QUERY = (
    "active=true^ORresolved_atONThis week"
    "@javascript:gs.beginningOfThisWeek()@javascript:gs.endOfThisWeek()"
)


class ServiceNowClient:
    def __init__(
        self,
        instance_url: str,
        username: str,
        password: str,
        http_sender: Callable[[urllib.request.Request], dict[str, Any]] | None = None,
    ) -> None:
        self.instance_url = instance_url.rstrip("/")
        token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        self._auth_header = f"Basic {token}"
        self._http_sender = http_sender or self._default_sender

    @staticmethod
    def _default_sender(req: urllib.request.Request) -> dict[str, Any]:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}

    def _request(
        self,
        method: str,
        path: str,
        params: dict[str, str] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{self.instance_url}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        data = json.dumps(json_body).encode("utf-8") if json_body is not None else None
        req = urllib.request.Request(url=url, data=data, method=method)
        req.add_header("Accept", "application/json")
        req.add_header("Authorization", self._auth_header)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        return self._http_sender(req)

    def fetch_weekly_incidents(
        self,
        page_size: int = 100,
        query: str = DEFAULT_WEEKLY_QUERY,
        fields: str = DEFAULT_INCIDENT_FIELDS,
    ) -> list[dict[str, Any]]:
        offset = 0
        all_records: list[dict[str, Any]] = []
        while True:
            params = {
                "sysparm_query": query + "^ORDERBYsys_id",
                "sysparm_fields": fields,
                "sysparm_display_value": "true",
                "sysparm_exclude_reference_link": "true",
                "sysparm_limit": str(page_size),
                "sysparm_offset": str(offset),
            }
            payload = self._request("GET", "/api/now/table/incident", params=params)
            batch = payload.get("result", [])
            if not isinstance(batch, list) or not batch:
                break
            all_records.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
        return all_records

    def fetch_incident_tags(self, sys_id: str) -> list[str]:
        if not re.fullmatch(r"[a-fA-F0-9]{32}", sys_id):
            raise ValueError("ID de incidente inválido.")
        offset = 0
        tags = set()
        while True:
            payload = self._request("GET", "/api/now/table/label_entry", {
                "sysparm_query": f"table=incident^table_key={sys_id}^ORDERBYsys_id",
                "sysparm_fields": "label,title",
                "sysparm_display_value": "true",
                "sysparm_exclude_reference_link": "true",
                "sysparm_limit": "100",
                "sysparm_offset": str(offset),
            })
            records = payload["result"]
            for entry in records:
                tag = entry.get("label") or entry.get("title")
                if isinstance(tag, str) and tag:
                    tags.add(tag)
            if len(records) < 100:
                return sorted(tags)
            offset += 100

    def sync_tags_batch(self, items: list[dict[str, Any]]) -> dict[str, Any]:
        body = {"items": items}
        return self._request("POST", "/api/global/retrografos/sync_tags", json_body=body)
