from __future__ import annotations
import http.server
import json
import socketserver
from pathlib import Path
from typing import Any


def render_dashboard_html(report: dict[str, Any]) -> str:
    report_json = json.dumps(report, ensure_ascii=False).replace("<", "\\u003c")
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

    const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({{
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }})[char]);
    const systems = [...new Set(REPORT.sync_plan.map(i => i.system_name))];
    const tags = [...new Set(REPORT.sync_plan.flatMap(i => i.final_tags))].sort();
    systems.forEach(s => sysSelect.innerHTML += `<option value="${{escapeHtml(s)}}">${{escapeHtml(s)}}</option>`);
    tags.forEach(t => tagSelect.innerHTML += `<option value="${{escapeHtml(t)}}">#${{escapeHtml(t)}}</option>`);

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
          <td><strong>${{escapeHtml(i.number)}}</strong></td>
          <td>${{escapeHtml(i.system_name)}}</td>
          <td>${{i.final_tags.map(t => `<span class="tag">#${{escapeHtml(t)}}</span>`).join('')}}</td>
          <td>${{i.remove_tags.map(t => `<span class="tag tag-rem">${{escapeHtml(t)}}</span>`).join('') || '—'}}</td>
        </tr>
      `).join('');

      document.getElementById('rec-list').innerHTML = REPORT.recurrences.map(r => `
        <div class="rec-box">
          <strong>${{escapeHtml(r.recurrence_id)}} — ${{escapeHtml(r.system_name)}} (${{r.count}} incidentes)</strong><br>
          <small>Chamados: ${{escapeHtml(r.incident_numbers.join(', '))}}</small><br>
          <small>Problema Sugerido: <b>${{escapeHtml(r.suggested_problem)}}</b> | KB: <b>${{escapeHtml(r.suggested_kb)}}</b></small>
        </div>
      `).join('');

      document.getElementById('sub-list').innerHTML = REPORT.below_threshold.map(r => `
        <div class="sub-box">
          <strong>${{escapeHtml(r.system_name)}} (${{r.count}}/${{REPORT.recurrence_threshold}} incidentes — abaixo do limiar)</strong><br>
          <small>Chamados: ${{escapeHtml(r.incident_numbers.join(', '))}}</small>
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
        svg.innerHTML += `<text x="${{n.x + 14}}" y="${{n.y + 4}}" fill="#f8fafc" font-size="11">${{escapeHtml(n.label)}}</text>`;
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
