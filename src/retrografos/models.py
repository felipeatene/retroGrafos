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
