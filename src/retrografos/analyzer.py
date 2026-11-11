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
