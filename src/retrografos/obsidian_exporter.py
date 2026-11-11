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
