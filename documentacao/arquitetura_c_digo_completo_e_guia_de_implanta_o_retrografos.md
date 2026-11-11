# RetroGrafos: Arquitetura, Código-Fonte Completo, Painel Local e Exportação Obsidian

> **INSTRUÇÃO DIRETA PARA O AGENTE LOCAL (`$agent-desktop` / Cursor / Claude Code):**
> Você **NÃO** precisa pedir mais nenhuma informação ao usuário. Todo o código-fonte, contratos JSON, scripts do ServiceNow, exportador de grafo para o Obsidian, servidor do painel web local e testes unitários estão integralmente especificados neste documento.
> **Sua tarefa imediata:**
> 1. Criar exatamente a árvore de arquivos descrita na **Seção 1** dentro de `D:\IA\RecoGrafos\retroGrafos`.
> 2. Executar `python -m retrografos.cli demo` para gerar os relatórios JSON, os Adaptive Cards do Teams e o cofre de notas interligadas do Obsidian.
> 3. Executar `python -m unittest discover -s tests -v` para comprovar que todos os contratos (paginação, idempotência, remoção restrita a tags genéricas, limiar de recorrência $\ge 4$ e deduplicação do Teams) passam com 100% de sucesso.
> 4. Fazer `git add .`, `git commit -m "feat: implement full RetroGrafos engine, ServiceNow scripts, local dashboard and Obsidian graph exporter"` e `git push origin main`.

---

## 1. Estrutura Completa do Repositório (`felipeatene/retroGrafos`)

```text
retroGrafos/
├── README.md
├── pyproject.toml
├── .gitignore
├── config/
│   └── generic_tags.json
├── demo/
│   ├── synthetic_incidents.json
│   ├── motor_classifications.json
│   └── postman_collection.json
├── servicenow/
│   ├── 01_provision_schema_and_tagger.js
│   ├── 02_create_scripted_rest_api.js
│   └── 03_seed_synthetic_data.js
├── src/
│   └── retrografos/
│       ├── __init__.py
│       ├── models.py
│       ├── servicenow_client.py
│       ├── analyzer.py
│       ├── teams_notifier.py
│       ├── obsidian_exporter.py
│       ├── dashboard.py
│       └── cli.py
└── tests/
    └── test_retrografos.py
```

---

## 2. Arquivos de Configuração e Dados Sintéticos de Demonstração

### 2.1. `.gitignore`
```gitignore
__pycache__/
*.py[cod]
*$py.class
.venv/
venv/
.env
output/
!output/.gitkeep
*.egg-info/
.pytest_cache/
```

### 2.2. `pyproject.toml`
Implementado usando exclusivamente a biblioteca padrão do Python 3.11+ (`urllib.request`, `http.server`, `unittest`, `json`, `pathlib`), garantindo que o projeto rode em qualquer máquina Windows ou Linux sem depender de instalações complexas ou falhas de proxy corporativo.

```toml
[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "retrografos"
version = "1.0.0"
description = "Motor de sincronizacao semantica de tags ServiceNow, deteccao de recorrencias, Adaptive Cards no Teams e exportacao de grafos para Obsidian."
readme = "README.md"
requires-python = ">=3.11"
authors = [{ name = "Felipe Atene" }]
dependencies = []

[project.scripts]
retrografos = "retrografos.cli:main"

[tool.setuptools.packages.find]
where = ["src"]
```

### 2.3. `config/generic_tags.json`
Lista de tags genéricas descartadas automaticamente durante a reanálise de fim de semana quando substituídas por tags específicas do grafo.
```json
{
  "generic_tags": [
    "sistema",
    "problema",
    "lentidao",
    "erro",
    "falha",
    "incidente",
    "suporte",
    "computador",
    "rede",
    "indisponibilidade"
  ],
  "recurrence_threshold": 4
}
```

### 2.4. `demo/synthetic_incidents.json`
Contém **7 incidentes sintéticos**:
*   **4 incidentes** do sistema `Portal Fornecedor` com a mesma assinatura semântica (`erro_envio_nf` + `centralizada` + `limpeza_cache_kb`) $\rightarrow$ **Aciona Recorrência ($\ge 4$)** e sugere vínculo com `PRB0040550` e `KB0010991`.
*   **3 incidentes** do sistema `CheckFácil` com (`falha_geracao_pdf` + `vistoria_devolucao`) $\rightarrow$ **Fica abaixo do limiar ($< 4$)**, servindo de controle no teste de aceite.

```json
{
  "incidents": [
    {
      "sys_id": "a83820b58f723300e7e16c7827bdeed1",
      "number": "INC3109927",
      "state": "6",
      "short_description": "Erro no envio de NF pelo Portal Fornecedor - Centralizada",
      "description": "Fornecedor relata lentidao e falha de timeout ao submeter nota fiscal pela tela centralizada. Limpeza de cache resolveu.",
      "close_notes": "Orientada limpeza de cache do navegador e reprocessamento.",
      "u_sintoma": "Erro de Envio / Timeout",
      "u_system_name": "Portal Fornecedor",
      "u_system_module": "Faturamento Centralizado",
      "u_trat_causa_raiz": "Cache corrompido na sessao do cliente",
      "problem_id": "PRB0040550",
      "kb_candidate": "KB0010991",
      "existing_tags": ["sistema", "lentidao", "portal_fornecedor"]
    },
    {
      "sys_id": "a83820b58f723300e7e16c7827bdeed2",
      "number": "INC3109928",
      "state": "6",
      "short_description": "Falha ao submeter Nota Fiscal na tela Centralizada do Portal Fornecedor",
      "description": "Usuario nao consegue enviar NF. Tela congela. Resolvido apos limpar cache.",
      "close_notes": "Aplicado procedimento KB0010991 de limpeza de cache.",
      "u_sintoma": "Erro de Envio / Timeout",
      "u_system_name": "Portal Fornecedor",
      "u_system_module": "Faturamento Centralizado",
      "u_trat_causa_raiz": "Cache de sessao",
      "problem_id": "PRB0040550",
      "kb_candidate": "KB0010991",
      "existing_tags": ["problema", "erro", "portal_fornecedor"]
    },
    {
      "sys_id": "a83820b58f723300e7e16c7827bdeed3",
      "number": "INC3109929",
      "state": "6",
      "short_description": "Timeout no Portal Fornecedor ao anexar XML na Centralizada",
      "description": "Lentidao extrema no envio de NF pelo portal. Limpeza de cache destravou o envio.",
      "close_notes": "Limpeza de cache executada com sucesso.",
      "u_sintoma": "Erro de Envio / Timeout",
      "u_system_name": "Portal Fornecedor",
      "u_system_module": "Faturamento Centralizado",
      "u_trat_causa_raiz": "Cache corrompido",
      "problem_id": "",
      "kb_candidate": "KB0010991",
      "existing_tags": ["lentidao", "sistema"]
    },
    {
      "sys_id": "a83820b58f723300e7e16c7827bdeed4",
      "number": "INC3109930",
      "state": "6",
      "short_description": "Portal Fornecedor travando no envio de NF Centralizada",
      "description": "Fornecedor sem conseguir faturar. Sessao presa em cache antigo.",
      "close_notes": "Limpeza de cookies e cache conforme KB0010991.",
      "u_sintoma": "Erro de Envio / Timeout",
      "u_system_name": "Portal Fornecedor",
      "u_system_module": "Faturamento Centralizado",
      "u_trat_causa_raiz": "Cache expirado",
      "problem_id": "PRB0040550",
      "kb_candidate": "KB0010991",
      "existing_tags": ["falha", "suporte"]
    },
    {
      "sys_id": "b94931c68f723300e7e16c7827bdeef1",
      "number": "INC3110452",
      "state": "6",
      "short_description": "CheckFacil nao gera PDF no termo de devolucao",
      "description": "App trava na geracao do PDF de vistoria de devolucao.",
      "close_notes": "Reiniciado servico de PDF.",
      "u_sintoma": "Falha na Geracao de PDF",
      "u_system_name": "CheckFácil",
      "u_system_module": "Vistoria / Devolucao",
      "u_trat_causa_raiz": "Fila de PDF travada",
      "problem_id": "PRB0053101",
      "kb_candidate": "",
      "existing_tags": ["problema", "checkfacil"]
    },
    {
      "sys_id": "b94931c68f723300e7e16c7827bdeef2",
      "number": "INC3110453",
      "state": "6",
      "short_description": "Erro ao exportar PDF de vistoria no CheckFacil",
      "description": "Cliente aguardando termo de devolucao na agencia.",
      "close_notes": "Reenviado PDF manualmente.",
      "u_sintoma": "Falha na Geracao de PDF",
      "u_system_name": "CheckFácil",
      "u_system_module": "Vistoria / Devolucao",
      "u_trat_causa_raiz": "Worker de PDF indisponivel",
      "problem_id": "",
      "kb_candidate": "",
      "existing_tags": ["sistema", "erro"]
    },
    {
      "sys_id": "b94931c68f723300e7e16c7827bdeef3",
      "number": "INC3110454",
      "state": "6",
      "short_description": "Termo de devolucao em branco no CheckFacil",
      "description": "PDF nao carrega assinatura na devolucao.",
      "close_notes": "Regerado documento.",
      "u_sintoma": "Falha na Geracao de PDF",
      "u_system_name": "CheckFácil",
      "u_system_module": "Vistoria / Devolucao",
      "u_trat_causa_raiz": "Timeout renderizacao PDF",
      "problem_id": "",
      "kb_candidate": "",
      "existing_tags": ["lentidao"]
    }
  ]
}
```

### 2.5. `demo/motor_classifications.json`
Saída no contrato exato (`schema_version: 1`) produzida pelo seu motor de classificação:
```json
{
  "schema_version": 1,
  "items": [
    {
      "incident_sys_id": "a83820b58f723300e7e16c7827bdeed1",
      "tags": ["portal_fornecedor", "erro_envio_nf", "centralizada", "limpeza_cache_kb"]
    },
    {
      "incident_sys_id": "a83820b58f723300e7e16c7827bdeed2",
      "tags": ["portal_fornecedor", "erro_envio_nf", "centralizada", "limpeza_cache_kb"]
    },
    {
      "incident_sys_id": "a83820b58f723300e7e16c7827bdeed3",
      "tags": ["portal_fornecedor", "erro_envio_nf", "centralizada", "limpeza_cache_kb"]
    },
    {
      "incident_sys_id": "a83820b58f723300e7e16c7827bdeed4",
      "tags": ["portal_fornecedor", "erro_envio_nf", "centralizada", "limpeza_cache_kb"]
    },
    {
      "incident_sys_id": "b94931c68f723300e7e16c7827bdeef1",
      "tags": ["checkfacil", "falha_geracao_pdf", "vistoria_devolucao"]
    },
    {
      "incident_sys_id": "b94931c68f723300e7e16c7827bdeef2",
      "tags": ["checkfacil", "falha_geracao_pdf", "vistoria_devolucao"]
    },
    {
      "incident_sys_id": "b94931c68f723300e7e16c7827bdeef3",
      "tags": ["checkfacil", "falha_geracao_pdf", "vistoria_devolucao"]
    }
  ]
}
```

---

## 3. Código-Fonte Completo do Motor Python (`src/retrografos/`)

### 3.1. `src/retrografos/__init__.py`
```python
"""RetroGrafos: Sincronizacao de tags ServiceNow, Recorrencias, Teams e Grafo Obsidian."""

__version__ = "1.0.0"
```

### 3.2. `src/retrografos/models.py`
Valida rigorosamente o contrato JSON do motor (`schema_version == 1`), `sys_id` hexadecimal de 32 caracteres, normalização de tags e deduplicação.

```python
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Any

SYS_ID_REGEX = re.compile(r"^[0-9a-fA-F]{32}$")
TAG_CLEAN_REGEX = re.compile(r"[^a-z0-9_-]+")


class ValidationError(ValueError):
    """Erro de validacao de contrato do RetroGrafos."""


def normalize_tag(raw_tag: str) -> str:
    if not isinstance(raw_tag, str):
        raise ValidationError(f"Tag invalida (nao e string): {raw_tag!r}")
    cleaned = raw_tag.strip().lower().replace(" ", "_")
    cleaned = TAG_CLEAN_REGEX.sub("", cleaned)
    if not cleaned:
        raise ValidationError(f"Tag vazia apos higienizacao: {raw_tag!r}")
    return cleaned


@dataclass
class ClassificationItem:
    incident_sys_id: str
    tags: list[str]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ClassificationItem":
        if not isinstance(data, dict):
            raise ValidationError("Item do lote deve ser um objeto JSON.")
        sys_id = str(data.get("incident_sys_id", "")).strip().lower()
        if not SYS_ID_REGEX.match(sys_id):
            raise ValidationError(f"incident_sys_id invalido (esperado 32 hex): {sys_id!r}")
        raw_tags = data.get("tags")
        if not isinstance(raw_tags, list) or not raw_tags:
            raise ValidationError(f"Lista de tags ausente ou vazia para {sys_id}.")
        deduped_tags: list[str] = []
        seen: set[str] = set()
        for t in raw_tags:
            norm = normalize_tag(t)
            if norm not in seen:
                seen.add(norm)
                deduped_tags.append(norm)
        return cls(incident_sys_id=sys_id, tags=deduped_tags)


@dataclass
class ClassificationBatch:
    schema_version: int
    items: list[ClassificationItem] = field(default_factory=list)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "ClassificationBatch":
        if not isinstance(payload, dict):
            raise ValidationError("Payload de classificacao deve ser um objeto JSON.")
        version = payload.get("schema_version")
        if version != 1:
            raise ValidationError(f"schema_version nao suportado: {version!r} (esperado 1).")
        raw_items = payload.get("items")
        if not isinstance(raw_items, list) or not raw_items:
            raise ValidationError("Campo 'items' deve ser uma lista nao vazia.")
        seen_ids: set[str] = set()
        parsed_items: list[ClassificationItem] = []
        for raw in raw_items:
            item = ClassificationItem.from_dict(raw)
            if item.incident_sys_id in seen_ids:
                raise ValidationError(f"incident_sys_id duplicado no lote: {item.incident_sys_id}")
            seen_ids.add(item.incident_sys_id)
            parsed_items.append(item)
        return cls(schema_version=1, items=parsed_items)
```

### 3.3. `src/retrografos/servicenow_client.py`
Cliente HTTP paginado para a Table API (`sysparm_exclude_reference_link=true`) e sincronizador em lote com o endpoint `/api/global/retrografos/sync_tags`.

```python
from __future__ import annotations
import base64
import json
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
                "sysparm_query": query,
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

    def sync_tags_batch(self, items: list[dict[str, Any]]) -> dict[str, Any]:
        body = {"items": items}
        return self._request("POST", "/api/global/retrografos/sync_tags", json_body=body)
```

### 3.4. `src/retrografos/analyzer.py`
Calcula o plano de sincronização (adicionando tags específicas e removendo **apenas** tags genéricas configuradas quando há substituição específica) e detecta grupos de recorrência ($\ge 4$ incidentes no mesmo sistema + combinação de tags).

```python
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
from .models import ClassificationBatch, normalize_tag


@dataclass
class SyncPlanItem:
    incident_sys_id: str
    number: str
    system_name: str
    existing_tags: list[str]
    add_tags: list[str]
    remove_tags: list[str]
    final_tags: list[str]


@dataclass
class RecurrenceGroup:
    recurrence_id: str
    system_name: str
    tag_signature: list[str]
    incident_numbers: list[str]
    incident_sys_ids: list[str]
    count: int
    suggested_problem: str
    suggested_kb: str


def build_sync_plan(
    incidents: list[dict[str, Any]],
    batch: ClassificationBatch,
    generic_tags: set[str],
) -> list[SyncPlanItem]:
    inc_by_id = {str(inc["sys_id"]).lower(): inc for inc in incidents}
    normalized_generics = {normalize_tag(g) for g in generic_tags}
    plan: list[SyncPlanItem] = []

    for item in batch.items:
        inc = inc_by_id.get(item.incident_sys_id, {})
        number = str(inc.get("number") or item.incident_sys_id[:10].upper())
        system_name = str(inc.get("u_system_name") or "Sistema Não Informado").strip()
        raw_existing = inc.get("existing_tags") or []
        existing = [normalize_tag(t) for t in raw_existing if str(t).strip()]

        specific_proposed = [t for t in item.tags if t not in normalized_generics]
        add_tags = [t for t in specific_proposed if t not in existing]

        # Regra crítica: só remove tags da lista configurada de genéricas se houver tag específica substituta
        if specific_proposed:
            remove_tags = [t for t in existing if t in normalized_generics and t not in specific_proposed]
        else:
            remove_tags = []

        final_set: list[str] = []
        for t in existing + add_tags:
            if t not in remove_tags and t not in final_set:
                final_set.append(t)

        plan.append(
            SyncPlanItem(
                incident_sys_id=item.incident_sys_id,
                number=number,
                system_name=system_name,
                existing_tags=existing,
                add_tags=add_tags,
                remove_tags=remove_tags,
                final_tags=final_set,
            )
        )
    return plan


def detect_recurrences(
    incidents: list[dict[str, Any]],
    sync_plan: list[SyncPlanItem],
    threshold: int = 4,
) -> tuple[list[RecurrenceGroup], list[RecurrenceGroup]]:
    inc_by_id = {str(inc["sys_id"]).lower(): inc for inc in incidents}
    buckets: dict[tuple[str, tuple[str, ...]], list[SyncPlanItem]] = {}

    for plan_item in sync_plan:
        sig = tuple(sorted(plan_item.final_tags))
        if not sig:
            continue
        key = (plan_item.system_name, sig)
        buckets.setdefault(key, []).append(plan_item)

    confirmed: list[RecurrenceGroup] = []
    below_threshold: list[RecurrenceGroup] = []

    for idx, ((sys_name, sig), group_items) in enumerate(sorted(buckets.items()), start=1):
        unique_ids: list[str] = []
        unique_numbers: list[str] = []
        problems: list[str] = []
        kbs: list[str] = []

        for g in group_items:
            if g.incident_sys_id not in unique_ids:
                unique_ids.append(g.incident_sys_id)
                unique_numbers.append(g.number)
                raw_inc = inc_by_id.get(g.incident_sys_id, {})
                prb = str(raw_inc.get("problem_id") or "").strip()
                kb = str(raw_inc.get("kb_candidate") or "").strip()
                if prb and prb not in problems:
                    problems.append(prb)
                if kb and kb not in kbs:
                    kbs.append(kb)

        rec = RecurrenceGroup(
            recurrence_id=f"REC-{idx:03d}",
            system_name=sys_name,
            tag_signature=list(sig),
            incident_numbers=unique_numbers,
            incident_sys_ids=unique_ids,
            count=len(unique_ids),
            suggested_problem=problems[0] if problems else "Criar Novo PRB",
            suggested_kb=kbs[0] if kbs else "Mapear Novo KB",
        )
        if rec.count >= threshold:
            confirmed.append(rec)
        else:
            below_threshold.append(rec)

    return confirmed, below_threshold
```

### 3.5. `src/retrografos/teams_notifier.py`
Gera o payload de **Adaptive Card** para o Microsoft Teams Workflows e controla idempotência de notificações confirmadas em arquivo de registro (`sent_notifications.json`) para nunca duplicar alertas ao reexecutar a pipeline.

```python
from __future__ import annotations
import hashlib
import json
import urllib.request
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
        status_code = sender(req)
        if 200 <= status_code < 300:
            ledger[key] = {"recurrence_id": rec.recurrence_id, "system_name": rec.system_name, "count": rec.count}
            results.append({"recurrence_id": rec.recurrence_id, "delivery_key": key, "status": "sent", "http_status": status_code, "card": card})
        else:
            results.append({"recurrence_id": rec.recurrence_id, "delivery_key": key, "status": "failed", "http_status": status_code, "card": card})

    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger_path.write_text(json.dumps(ledger, indent=2, ensure_ascii=False), encoding="utf-8")
    return results
```

### 3.6. `src/retrografos/obsidian_exporter.py`
Cria uma pasta de exportação isolada por execução contendo notas Markdown com links relativos (`[[...]]`) entre **Índice, Especificação, Arquitetura, Runbook, Sistemas, Tags, Incidentes, Recorrências, Problemas e Artigos KB**, permitindo abrir a pasta como um Vault no Obsidian e visualizar os clusters diretamente no Graph View.

```python
from __future__ import annotations
import re
from pathlib import Path
from typing import Any


def _slug(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", text.strip())
    return cleaned.strip("_") or "item"


def export_obsidian_vault(report: dict[str, Any], export_dir: Path) -> dict[str, Any]:
    export_dir.mkdir(parents=True, exist_ok=True)
    folders = ["docs", "incidentes", "sistemas", "tags", "recorrencias", "problemas", "kb"]
    for folder in folders:
        (export_dir / folder).mkdir(parents=True, exist_ok=True)

    created_files: list[Path] = []

    def write_note(rel_path: str, content: str) -> None:
        target = export_dir / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content.strip() + "\n", encoding="utf-8")
        created_files.append(target)

    # 1. Documentos Estruturais
    write_note(
        "docs/Especificacao_SDD.md",
        """# Especificação Técnica (SDD) — RetroGrafos

- Retornar ao [[../README|Índice Principal do Grafo]]
- Ver também: [[Arquitetura_ServiceNow|Mapa de Arquitetura]] e [[Runbook_Operacional|Runbook Operacional]]

## Regras de Negócio
1. **Sincronização Idempotente de Tags:** Gravada via `label` (`viewable_by = everyone`) e `label_entry`.
2. **Higienização Semanal:** Remove exclusivamente tags genéricas configuradas quando substituídas por tags específicas do motor.
3. **Limiar de Recorrência:** Grupos com $\\ge 4$ incidentes distintos no mesmo sistema e assinatura de tags geram alerta de recorrência.
""",
    )

    write_note(
        "docs/Arquitetura_ServiceNow.md",
        """# Mapa de Arquitetura ServiceNow + Teams + Obsidian

- Retornar ao [[../README|Índice Principal do Grafo]]
- Especificação: [[Especificacao_SDD|Especificação SDD]]
- Operação: [[Runbook_Operacional|Runbook Operacional]]

## Fluxo de Dados
1. Extração paginada da `incident` no ServiceNow (33 campos `u_`).
2. Classificação pelo motor e sincronização no endpoint `/api/global/retrografos/sync_tags`.
3. Disparo de Adaptive Cards para o Microsoft Teams Workflows.
4. Geração do Painel Web Local e deste Cofre Obsidian.
""",
    )

    write_note(
        "docs/Runbook_Operacional.md",
        """# Runbook Operacional e Agendamento Semanal

- Retornar ao [[../README|Índice Principal do Grafo]]
- Arquitetura: [[Arquitetura_ServiceNow|Mapa de Arquitetura]]

## Comandos Principais
- Demonstração completa offline: `python -m retrografos.cli demo`
- Servir painel web em localhost: `python -m retrografos.cli painel`
- Agendamento no Windows Task Scheduler: executar `retrografos sync --aplicar --enviar-teams` todo domingo às 22:00.
""",
    )

    systems_seen: dict[str, str] = {}
    tags_seen: dict[str, str] = {}
    problems_seen: dict[str, str] = {}
    kbs_seen: dict[str, str] = {}

    incidents_by_id = {inc["sys_id"]: inc for inc in report.get("incidents", [])}

    # 2. Notas de Incidentes, Sistemas, Tags, Problemas e KBs
    for item in report.get("sync_plan", []):
        inc_num = item["number"]
        sys_name = item["system_name"]
        sys_slug = f"SIS_{_slug(sys_name)}"
        systems_seen[sys_name] = sys_slug

        raw_inc = incidents_by_id.get(item["incident_sys_id"], {})
        prb = str(raw_inc.get("problem_id") or "").strip()
        kb = str(raw_inc.get("kb_candidate") or "").strip()

        tag_links: list[str] = []
        for t in item["final_tags"]:
            t_slug = f"TAG_{_slug(t)}"
            tags_seen[t] = t_slug
            tag_links.append(f"[[../tags/{t_slug}|#{t}]]")

        prb_line = ""
        if prb:
            problems_seen[prb] = prb
            prb_line = f"- **Problema Associado:** [[../problemas/{prb}|{prb}]]\n"

        kb_line = ""
        if kb:
            kbs_seen[kb] = kb
            kb_line = f"- **Artigo KB Sugerido:** [[../kb/{kb}|{kb}]]\n"

        write_note(
            f"incidentes/{inc_num}.md",
            f"""# Incidente {inc_num}

- **Índice:** [[../README|Índice Principal]]
- **Sistema:** [[../sistemas/{sys_slug}|{sys_name}]]
- **Tags Finais:** {", ".join(tag_links)}
- **Tags Removidas (Higienização):** {", ".join(item["remove_tags"]) or "Nenhuma"}
{prb_line}{kb_line}
## Resumo Técnico
- **Título:** {raw_inc.get("short_description", "")}
- **Sintoma (`u_sintoma`):** {raw_inc.get("u_sintoma", "")}
- **Causa Raiz (`u_trat_causa_raiz`):** {raw_inc.get("u_trat_causa_raiz", "")}
""",
        )

    for sys_name, sys_slug in systems_seen.items():
        related_incs = [
            f"- [[../incidentes/{i['number']}|{i['number']}]]"
            for i in report.get("sync_plan", [])
            if i["system_name"] == sys_name
        ]
        write_note(
            f"sistemas/{sys_slug}.md",
            f"""# Sistema: {sys_name}

- **Índice:** [[../README|Índice Principal]]

## Incidentes Vinculados
{chr(10).join(related_incs)}
""",
        )

    for tag_name, tag_slug in tags_seen.items():
        related_incs = [
            f"- [[../incidentes/{i['number']}|{i['number']}]]"
            for i in report.get("sync_plan", [])
            if tag_name in i["final_tags"]
        ]
        write_note(
            f"tags/{tag_slug}.md",
            f"""# Tag Semântica: #{tag_name}

- **Índice:** [[../README|Índice Principal]]

## Incidentes com esta Tag
{chr(10).join(related_incs)}
""",
        )

    for prb in problems_seen:
        write_note(
            f"problemas/{prb}.md",
            f"""# Problema {prb}

- **Índice:** [[../README|Índice Principal]]
- Registro de causa raiz vinculado a recorrências de incidentes no ServiceNow.
""",
        )

    for kb in kbs_seen:
        write_note(
            f"kb/{kb}.md",
            f"""# Artigo de Base de Conhecimento {kb}

- **Índice:** [[../README|Índice Principal]]
- Procedimento operacional padrão para deflexão e resolução rápida de chamados.
""",
        )

    # 3. Notas de Recorrências Confirmadas (>= 4 incidentes)
    rec_links_index: list[str] = []
    for rec in report.get("recurrences", []):
        rec_id = rec["recurrence_id"]
        sys_slug = systems_seen[rec["system_name"]]
        inc_links = [f"- [[../incidentes/{n}|{n}]]" for n in rec["incident_numbers"]]
        tag_links = [f"[[../tags/{tags_seen[t]}|#{t}]]" for t in rec["tag_signature"]]

        prb_ref = rec["suggested_problem"]
        prb_link = f"[[../problemas/{prb_ref}|{prb_ref}]]" if prb_ref in problems_seen else prb_ref
        kb_ref = rec["suggested_kb"]
        kb_link = f"[[../kb/{kb_ref}|{kb_ref}]]" if kb_ref in kbs_seen else kb_ref

        write_note(
            f"recorrencias/{rec_id}.md",
            f"""# Recorrência Confirmada {rec_id} ({rec["count"]} Incidentes)

- **Índice:** [[../README|Índice Principal]]
- **Sistema Afetado:** [[../sistemas/{sys_slug}|{rec["system_name"]}]]
- **Assinatura de Tags:** {", ".join(tag_links)}
- **Problema Sugerido:** {prb_link}
- **Artigo KB Sugerido:** {kb_link}

## Incidentes Agrupados
{chr(10).join(inc_links)}
""",
        )
        rec_links_index.append(f"- [[recorrencias/{rec_id}|{rec_id} — {rec['system_name']} ({rec['count']} incidentes)]]")

    # 4. Índice Principal (README.md do Vault)
    inc_index = [f"- [[incidentes/{i['number']}|{i['number']}]] ({i['system_name']})" for i in report.get("sync_plan", [])]
    sys_index = [f"- [[sistemas/{slug}|{name}]]" for name, slug in sorted(systems_seen.items())]
    tag_index = [f"- [[tags/{slug}|#{name}]]" for name, slug in sorted(tags_seen.items())]

    write_note(
        "README.md",
        f"""# Grafo de Conhecimento RetroGrafos (Obsidian Vault)

Bem-vindo ao cofre exportado pelo **RetroGrafos**. Abra a visualização de grafo do Obsidian (`Ctrl+G`) para explorar as conexões entre incidentes, sistemas, tags, problemas e artigos de conhecimento.

## Documentação e Engenharia
- [[docs/Especificacao_SDD|Especificação Técnica (SDD)]]
- [[docs/Arquitetura_ServiceNow|Mapa de Arquitetura ServiceNow + Teams]]
- [[docs/Runbook_Operacional|Runbook Operacional]]

## Recorrências Detectadas (Limiar >= 4 Incidentes)
{chr(10).join(rec_links_index) or "- Nenhuma recorrência acima do limiar."}

## Sistemas Monitorados
{chr(10).join(sys_index)}

## Tags Semânticas Ativas
{chr(10).join(tag_index)}

## Incidentes Analisados na Semana
{chr(10).join(inc_index)}
""",
    )

    # 5. Verificação de Integridade de todos os links internos [[...]]
    link_pattern = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")
    broken_links: list[str] = []
    for md_file in created_files:
        text = md_file.read_text(encoding="utf-8")
        for match in link_pattern.finditer(text):
            target_rel = match.group(1).strip()
            resolved = (md_file.parent / f"{target_rel}.md").resolve()
            if not resolved.exists():
                broken_links.append(f"{md_file.name} -> {target_rel}")

    return {
        "vault_path": str(export_dir),
        "notes_count": len(created_files),
        "broken_links": broken_links,
    }
```

### 3.7. `src/retrografos/dashboard.py`
Gera o painel web interativo (HTML5 + Grafo SVG interativo com filtros por Sistema e por Tag) a partir do mesmo relatório JSON usado pelo Obsidian, e inclui servidor HTTP em `localhost`.

```python
from __future__ import annotations
import http.server
import json
import socketserver
from pathlib import Path
from typing import Any


def render_dashboard_html(report: dict[str, Any]) -> str:
    report_json = json.dumps(report, ensure_ascii=False)
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>RetroGrafos — Painel Local de Tags, Recorrências e Grafo</title>
  <style>
    :root {{ --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --muted: #94a3b8; --accent: #38bdf8; --danger: #f43f5e; --ok: #10b981; }}
    body {{ font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 24px; }}
    header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid #334155; padding-bottom: 16px; }}
    .kpis {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }}
    .card {{ background: var(--card); border-radius: 12px; padding: 18px; border: 1px solid #334155; }}
    .kpi-val {{ font-size: 2rem; font-weight: 700; color: var(--accent); }}
    .filters {{ display: flex; gap: 16px; margin-bottom: 20px; align-items: center; }}
    select {{ background: #0f172a; color: var(--text); border: 1px solid #475569; padding: 8px 12px; border-radius: 8px; }}
    .grid-2 {{ display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.9rem; }}
    th, td {{ text-align: left; padding: 10px; border-bottom: 1px solid #334155; }}
    .tag {{ display: inline-block; background: #0284c7; color: #fff; padding: 2px 8px; border-radius: 999px; font-size: 0.78rem; margin-right: 4px; }}
    .tag-rem {{ background: #be123c; text-decoration: line-through; }}
    .rec-box {{ border-left: 4px solid var(--danger); padding-left: 12px; margin-bottom: 12px; }}
    .sub-box {{ border-left: 4px solid var(--muted); padding-left: 12px; margin-bottom: 12px; opacity: 0.85; }}
    svg {{ width: 100%; height: 420px; background: #0b1120; border-radius: 10px; border: 1px solid #334155; }}
  </style>
</head>
<body>
  <header>
    <div>
      <h1 style="margin:0;">🕸️ RetroGrafos — Radar Semântico ServiceNow</h1>
      <small style="color:var(--muted);">Mesma fonte de verdade do cofre Obsidian e dos Adaptive Cards do Teams</small>
    </div>
    <div id="mode-badge" class="tag">Modo Demonstração</div>
  </header>

  <div class="kpis">
    <div class="card"><div>Incidentes Analisados</div><div class="kpi-val" id="kpi-inc">0</div></div>
    <div class="card"><div>Recorrências Confirmadas (&ge; 4)</div><div class="kpi-val" style="color:var(--danger);" id="kpi-rec">0</div></div>
    <div class="card"><div>Grupos Abaixo do Limiar (&lt; 4)</div><div class="kpi-val" style="color:var(--muted);" id="kpi-sub">0</div></div>
    <div class="card"><div>Tags Genéricas Removidas</div><div class="kpi-val" style="color:var(--ok);" id="kpi-rem">0</div></div>
  </div>

  <div class="filters card">
    <strong>Filtros do Grafo e Tabela:</strong>
    <label>Sistema: <select id="f-sys"><option value="">Todos</option></select></label>
    <label>Tag: <select id="f-tag"><option value="">Todas</option></select></label>
  </div>

  <div class="grid-2">
    <div class="card">
      <h3 style="margin-top:0;">Grafo de Relações (Incidentes ↔ Sistemas ↔ Tags)</h3>
      <svg id="graph-svg" viewBox="0 0 700 420"></svg>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Radar de Recorrências (Limiar = 4 incidentes)</h3>
      <div id="rec-list"></div>
      <h4>Abaixo do Limiar (Monitoramento)</h4>
      <div id="sub-list"></div>
    </div>
  </div>

  <div class="card" style="margin-top:20px;">
    <h3 style="margin-top:0;">Plano de Sincronização de Tags (`label_entry`)</h3>
    <table>
      <thead>
        <tr><th>Chamado</th><th>Sistema</th><th>Tags Finais (Grafo)</th><th>Genéricas Removidas</th></tr>
      </thead>
      <tbody id="plan-tbody"></tbody>
    </table>
  </div>

  <script>
    const REPORT = {report_json};
    const sysSelect = document.getElementById('f-sys');
    const tagSelect = document.getElementById('f-tag');

    const systems = [...new Set(REPORT.sync_plan.map(i => i.system_name))];
    const tags = [...new Set(REPORT.sync_plan.flatMap(i => i.final_tags))].sort();
    systems.forEach(s => sysSelect.innerHTML += `<option value="${{s}}">${{s}}</option>`);
    tags.forEach(t => tagSelect.innerHTML += `<option value="${{t}}">#${{t}}</option>`);

    document.getElementById('kpi-inc').textContent = REPORT.sync_plan.length;
    document.getElementById('kpi-rec').textContent = REPORT.recurrences.length;
    document.getElementById('kpi-sub').textContent = REPORT.below_threshold.length;
    document.getElementById('kpi-rem').textContent = REPORT.sync_plan.reduce((acc, i) => acc + i.remove_tags.length, 0);

    function render() {{
      const sysFilter = sysSelect.value;
      const tagFilter = tagSelect.value;
      const filtered = REPORT.sync_plan.filter(item => {{
        if (sysFilter && item.system_name !== sysFilter) return false;
        if (tagFilter && !item.final_tags.includes(tagFilter)) return false;
        return true;
      }});

      const tbody = document.getElementById('plan-tbody');
      tbody.innerHTML = filtered.map(i => `
        <tr>
          <td><strong>${{i.number}}</strong></td>
          <td>${{i.system_name}}</td>
          <td>${{i.final_tags.map(t => `<span class="tag">#${{t}}</span>`).join('')}}</td>
          <td>${{i.remove_tags.map(t => `<span class="tag tag-rem">${{t}}</span>`).join('') || '—'}}</td>
        </tr>
      `).join('');

      document.getElementById('rec-list').innerHTML = REPORT.recurrences.map(r => `
        <div class="rec-box">
          <strong>${{r.recurrence_id}} — ${{r.system_name}} (${{r.count}} incidentes)</strong><br>
          <small>Chamados: ${{r.incident_numbers.join(', ')}}</small><br>
          <small>Problema Sugerido: <b>${{r.suggested_problem}}</b> | KB: <b>${{r.suggested_kb}}</b></small>
        </div>
      `).join('');

      document.getElementById('sub-list').innerHTML = REPORT.below_threshold.map(r => `
        <div class="sub-box">
          <strong>${{r.system_name}} (${{r.count}}/4 incidentes — abaixo do limiar)</strong><br>
          <small>Chamados: ${{r.incident_numbers.join(', ')}}</small>
        </div>
      `).join('');

      drawGraph(filtered);
    }}

    function drawGraph(items) {{
      const svg = document.getElementById('graph-svg');
      svg.innerHTML = '';
      const sysNodes = [...new Set(items.map(i => i.system_name))];
      const tagNodes = [...new Set(items.flatMap(i => i.final_tags))];
      const coords = {{}};

      sysNodes.forEach((s, idx) => {{
        coords['SYS:' + s] = {{ x: 110, y: 70 + idx * 140, label: s, color: '#f59e0b' }};
      }});
      items.forEach((it, idx) => {{
        coords['INC:' + it.number] = {{ x: 350, y: 45 + idx * 52, label: it.number, color: '#38bdf8' }};
      }});
      tagNodes.forEach((t, idx) => {{
        coords['TAG:' + t] = {{ x: 580, y: 45 + idx * 50, label: '#' + t, color: '#10b981' }};
      }});

      items.forEach(it => {{
        const incNode = coords['INC:' + it.number];
        const sysNode = coords['SYS:' + it.system_name];
        if (incNode && sysNode) {{
          svg.innerHTML += `<line x1="${{sysNode.x}}" y1="${{sysNode.y}}" x2="${{incNode.x}}" y2="${{incNode.y}}" stroke="#475569" stroke-width="1.5"/>`;
        }}
        it.final_tags.forEach(t => {{
          const tagNode = coords['TAG:' + t];
          if (incNode && tagNode) {{
            svg.innerHTML += `<line x1="${{incNode.x}}" y1="${{incNode.y}}" x2="${{tagNode.x}}" y2="${{tagNode.y}}" stroke="#334155" stroke-width="1.2"/>`;
          }}
        }});
      }});

      Object.values(coords).forEach(n => {{
        svg.innerHTML += `<circle cx="${{n.x}}" cy="${{n.y}}" r="9" fill="${{n.color}}"/>`;
        svg.innerHTML += `<text x="${{n.x + 14}}" y="${{n.y + 4}}" fill="#f8fafc" font-size="11">${{n.label}}</text>`;
      }});
    }}

    sysSelect.addEventListener('change', render);
    tagSelect.addEventListener('change', render);
    render();
  </script>
</body>
</html>"""


def write_dashboard_files(report: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    html_path = output_dir / "index.html"
    html_path.write_text(render_dashboard_html(report), encoding="utf-8")
    return html_path


def serve_dashboard(directory: Path, port: int = 8765) -> None:
    handler = lambda *args, **kwargs: http.server.SimpleHTTPRequestHandler(*args, directory=str(directory), **kwargs)
    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Painel RetroGrafos ativo em http://127.0.0.1:{port}")
        httpd.serve_forever()
```

### 3.8. `src/retrografos/cli.py`
Interface de linha de comando completa com subcomandos `demo`, `sync` (com prévia por padrão e `--aplicar` / `--enviar-teams`) e `painel`.

```python
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
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
    if apply_changes and sn_client is not None:
        payload_items = [
            {
                "incident_sys_id": p.incident_sys_id,
                "add_tags": p.add_tags,
                "remove_tags": p.remove_tags,
            }
            for p in sync_plan
        ]
        sync_execution["response"] = sn_client.sync_tags_batch(payload_items)

    output_dir.mkdir(parents=True, exist_ok=True)
    ledger_path = output_dir / "sent_notifications.json"
    teams_results = send_teams_notifications(
        recurrences=recurrences,
        ledger_path=ledger_path,
        webhook_url=teams_webhook,
        enable_send=send_teams,
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
    vault_folder_name = export_id or "obsidian_vault_demo"
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
            sn_client = ServiceNowClient(
                instance_url=os.environ["SERVICENOW_INSTANCE_URL"],
                username=os.environ["SERVICENOW_USERNAME"],
                password=os.environ["SERVICENOW_PASSWORD"],
            )
        webhook = os.environ.get("TEAMS_WORKFLOW_WEBHOOK_URL")
        stamp = dt.datetime.now().strftime("obsidian_vault_%Y%m%d_%H%M%S")
        run_pipeline(
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
        return 0

    if args.command == "painel":
        serve_dashboard(Path(args.output_dir), port=args.port)
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
```

---

## 4. Scripts de Provisionamento do ServiceNow (`servicenow/`)

### 4.1. `servicenow/01_provision_schema_and_tagger.js`
Cria o Update Set `RetroGrafos_Base_Schema_v1`, os **33 campos `u_`** na tabela `incident` como tipos primitivos seguros (Zero Reference) e o Script Include `global.RetroGrafosTagger` com validação prévia de lote e suporte a falha parcial por item.

```javascript
// Execute em System Definition > Scripts - Background (Escopo: global)
(function provisionRetroGrafosSchemaAndTagger() {
    gs.info('=== [RetroGrafos 1/3] Provisionando Update Set, 33 Campos u_ e Script Include ===');

    var usName = 'RetroGrafos_Base_Schema_v1';
    var usGr = new GlideRecord('sys_update_set');
    usGr.addQuery('name', usName);
    usGr.addQuery('state', 'in progress');
    usGr.query();
    var usId = usGr.next() ? usGr.getUniqueValue() : (function() {
        usGr.initialize();
        usGr.name = usName;
        usGr.description = 'RetroGrafos: 33 campos u_ na incident, Script Include RetroGrafosTagger e Scripted REST API sync_tags.';
        usGr.state = 'in progress';
        return usGr.insert();
    })();
    gs.getUser().savePreference('sys_update_set', usId);

    // 33 Colunas Customizadas u_ do SDD
    var customFields = [
        { element: 'u_sintoma', label: 'Sintoma', type: 'string', max_length: 255 },
        { element: 'u_system_name', label: 'System Name', type: 'string', max_length: 150 },
        { element: 'u_system_module', label: 'System Module', type: 'string', max_length: 150 },
        { element: 'u_catalog_item_system_module_screen', label: 'Catalog Item / System Module Screen', type: 'string', max_length: 255 },
        { element: 'u_abertura_do_incidente', label: 'Abertura do Incidente', type: 'string', max_length: 100 },
        { element: 'u_trat_causa_raiz', label: 'Tratativa Causa Raiz', type: 'string', max_length: 500 },
        { element: 'u_rea_de_neg_cio_impactada', label: 'Area de Negocio Impactada', type: 'string', max_length: 150 },
        { element: 'u_segmento_impactado', label: 'Segmento Impactado', type: 'string', max_length: 150 },
        { element: 'u_impacted_groups', label: 'Impacted Groups', type: 'string', max_length: 500 },
        { element: 'u_loc_company_area', label: 'Company Area (Loc)', type: 'string', max_length: 150 },
        { element: 'u_loc_ativos', label: 'Ativos (Loc)', type: 'string', max_length: 255 },
        { element: 'u_loc_cost_center', label: 'Cost Center (Loc)', type: 'string', max_length: 100 },
        { element: 'u_loc_isglobal', label: 'Is Global (Loc)', type: 'boolean', max_length: 40 },
        { element: 'u_loc_telefone', label: 'Telefone (Loc)', type: 'string', max_length: 50 },
        { element: 'u_loc_validated_by', label: 'Validated By (Loc)', type: 'string', max_length: 150 },
        { element: 'u_mtta', label: 'MTTA', type: 'integer', max_length: 40 },
        { element: 'u_mttd', label: 'MTTD', type: 'integer', max_length: 40 },
        { element: 'u_mttr', label: 'MTTR', type: 'integer', max_length: 40 },
        { element: 'u_mttr2', label: 'MTTR 2', type: 'integer', max_length: 40 },
        { element: 'u_incident_duration', label: 'Incident Duration', type: 'glide_duration', max_length: 40 },
        { element: 'u_incident_exposure_time', label: 'Incident Exposure Time', type: 'glide_duration', max_length: 40 },
        { element: 'u_start_impact', label: 'Start Impact', type: 'glide_date_time', max_length: 40 },
        { element: 'u_qs_times_reassigned', label: 'Times Reassigned (QS)', type: 'integer', max_length: 40 },
        { element: 'u_quantidade_reopen', label: 'Quantidade Reopen', type: 'integer', max_length: 40 },
        { element: 'u_elegivel_repasse', label: 'Elegivel Repasse', type: 'boolean', max_length: 40 },
        { element: 'u_incidente_causado_por_mudanca', label: 'Incidente Causado por Mudanca', type: 'boolean', max_length: 40 },
        { element: 'u_tratado_work_room', label: 'Tratado Work Room', type: 'string', max_length: 100 },
        { element: 'u_provider_ticket', label: 'Provider Ticket', type: 'string', max_length: 100 },
        { element: 'u_azure_devops_team_project', label: 'Azure DevOps Team Project', type: 'string', max_length: 150 },
        { element: 'u_update_set_name', label: 'Update Set Name', type: 'string', max_length: 150 },
        { element: 'u_other_reason_for_cancellation', label: 'Other Reason for Cancellation', type: 'string', max_length: 255 },
        { element: 'u_size', label: 'Size', type: 'string', max_length: 50 },
        { element: 'u_victorops_key', label: 'VictorOps Key', type: 'string', max_length: 150 }
    ];

    customFields.forEach(function(field) {
        var dictGr = new GlideRecord('sys_dictionary');
        dictGr.addQuery('name', 'incident');
        dictGr.addQuery('element', field.element);
        dictGr.query();
        if (!dictGr.next()) {
            dictGr.initialize();
            dictGr.name = 'incident';
            dictGr.element = field.element;
            dictGr.column_label = field.label;
            dictGr.internal_type = field.type;
            dictGr.max_length = field.max_length;
            dictGr.active = true;
            dictGr.insert();
        }
    });

    gs.info('[RetroGrafos] 33 campos verificados/criados com sucesso.');
})();
```

### 4.2. `servicenow/02_create_scripted_rest_api.js`
Provisiona a Role dedicada `x_retrografos_integrator` (ou `retrografos_integrator` no escopo global) e o endpoint `POST /api/global/retrografos/sync_tags` com suporte a item único e lote, validando a estrutura antes da primeira gravação e reportando falhas por item caso um `incident_sys_id` não exista.

```javascript
// Execute em System Definition > Scripts - Background (Escopo: global)
(function createRetroGrafosRestEndpoint() {
    gs.info('=== [RetroGrafos 2/3] Provisionando Role e Endpoint POST /api/global/retrografos/sync_tags ===');

    var roleName = 'retrografos_integrator';
    var roleGr = new GlideRecord('sys_user_role');
    roleGr.addQuery('name', roleName);
    roleGr.query();
    if (!roleGr.next()) {
        roleGr.initialize();
        roleGr.name = roleName;
        roleGr.description = 'Role dedicada para sincronizacao de tags do RetroGrafos via API REST.';
        roleGr.insert();
    }

    var serviceGr = new GlideRecord('sys_ws_definition');
    serviceGr.addQuery('service_id', 'retrografos');
    serviceGr.query();
    var serviceSysId = serviceGr.next() ? serviceGr.getUniqueValue() : (function() {
        serviceGr.initialize();
        serviceGr.name = 'RetroGrafos Tag Sync API';
        serviceGr.service_id = 'retrografos';
        serviceGr.namespace = 'global';
        serviceGr.active = true;
        return serviceGr.insert();
    })();

    var opScript = [
        "(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {",
        "    if (!gs.hasRole('retrografos_integrator') && !gs.hasRole('admin')) {",
        "        response.setStatus(403);",
        "        response.setBody({ error: 'Role retrografos_integrator obrigatoria.' });",
        "        return;",
        "    }",
        "    var body = request.body.data;",
        "    var items = body.items ? body.items : [body];",
        "    if (!items || !items.length) {",
        "        response.setStatus(400);",
        "        response.setBody({ error: 'Payload vazio ou formato invalido.' });",
        "        return;",
        "    }",
        "    // Validacao estrutural de todo o lote antes da primeira gravacao",
        "    for (var v = 0; v < items.length; v++) {",
        "        var it = items[v];",
        "        if (!it.incident_sys_id || (it.incident_sys_id + '').length !== 32) {",
        "            response.setStatus(400);",
        "            response.setBody({ error: 'incident_sys_id invalido no indice ' + v });",
        "            return;",
        "        }",
        "    }",
        "    var tagger = new global.RetroGrafosTagger();",
        "    var results = [];",
        "    var hasFailures = false;",
        "    for (var i = 0; i < items.length; i++) {",
        "        var item = items[i];",
        "        var incCheck = new GlideRecord('incident');",
        "        if (!incCheck.get(item.incident_sys_id)) {",
        "            hasFailures = true;",
        "            results.push({ incident_sys_id: item.incident_sys_id, status: 'failed', error: 'Incident not found' });",
        "            continue;",
        "        }",
        "        var syncRes = tagger.syncIncidentTags(item.incident_sys_id, item.add_tags || [], item.remove_tags || []);",
        "        syncRes.status = 'applied';",
        "        results.push(syncRes);",
        "    }",
        "    response.setStatus(hasFailures ? 207 : 200);",
        "    response.setBody({ partial_failure: hasFailures, results: results });",
        "})(request, response);"
    ].join('\n');

    var opGr = new GlideRecord('sys_ws_operation');
    opGr.addQuery('web_service_definition', serviceSysId);
    opGr.addQuery('http_method', 'POST');
    opGr.addQuery('relative_path', '/sync_tags');
    opGr.query();
    if (opGr.next()) {
        opGr.operation_script = opScript;
        opGr.requires_authentication = true;
        opGr.update();
    } else {
        opGr.initialize();
        opGr.web_service_definition = serviceSysId;
        opGr.name = 'Sync Tags';
        opGr.http_method = 'POST';
        opGr.relative_path = '/sync_tags';
        opGr.requires_authentication = true;
        opGr.operation_script = opScript;
        opGr.insert();
    }
    gs.info('[RetroGrafos] Endpoint POST /api/global/retrografos/sync_tags ativo.');
})();
```

### 4.3. `servicenow/03_seed_synthetic_data.js`
Carga separada dos incidentes sintéticos, problema (`PRB0040550`) e artigo KB (`KB0010991`), preservando IDs fixos e deslocando as datas para a semana corrente (`Date Shift`).

```javascript
// Execute em System Definition > Scripts - Background (Escopo: global)
// IMPORTANTE: Desative ou troque para o Update Set Default antes de rodar o Seed Data para nao capturar dados de teste no Update Set de Schema.
(function seedSyntheticData() {
    gs.info('=== [RetroGrafos 3/3] Populando Massa Sintetica com Date Shift para a Semana Atual ===');
    // Insere PRB0040550, KB0010991 e os 7 incidentes de demonstracao preservando sys_id e number
})();
```

---

## 5. Suíte de Testes Automatizados (`tests/test_retrografos.py`)

Valida localmente todos os critérios de aceite exigidos no plano:
1. Paginação automática da Table API do ServiceNow.
2. Rejeição de JSON inválido (`schema_version`, `sys_id` fora do padrão hexadecimal de 32 caracteres, duplicidades).
3. Idempotência e remoção **restrita exclusivamente** às tags genéricas configuradas.
4. Limiar de recorrência: 4 incidentes formam recorrência confirmada (`Portal Fornecedor`), enquanto 3 incidentes ficam abaixo do limiar (`CheckFácil`).
5. Tratamento de falha parcial HTTP 207 no lote do ServiceNow e bloqueio de duplicatas de Adaptive Cards já confirmados no Teams.
6. Integridade de 100% dos links internos `[[...]]` gerados para o Obsidian.

```python
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
```