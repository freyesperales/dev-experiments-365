'use strict';
const { planScript } = require('./analyze');

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function layout(report) {
  const pos = {}; let row = 0;
  const walk = (name, depth) => {
    const n = report.nodes[name];
    if (n.children.length === 0) { pos[name] = { x: depth, y: row++ }; return; }
    n.children.forEach((c) => walk(c, depth + 1));
    const ys = n.children.map((c) => pos[c].y);
    pos[name] = { x: depth, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  };
  walk(report.root, 0);
  return pos;
}

function renderHtml(report) {
  const pos = layout(report);
  const W = 300, H = 74, PX = 24, PY = 24, BW = 250, BH = 52;
  const names = Object.keys(pos);
  const maxX = Math.max(...names.map((n) => pos[n].x)), maxY = Math.max(...names.map((n) => pos[n].y));
  const width = PX * 2 + maxX * W + BW, height = PY * 2 + maxY * H + BH;
  const px = (n) => PX + pos[n].x * W, py = (n) => PY + pos[n].y * H;
  let edges = '', boxes = '';
  for (const n of Object.values(report.nodes)) {
    if (n.parent) {
      const x1 = px(n.parent) + BW, y1 = py(n.parent) + BH / 2, x2 = px(n.name), y2 = py(n.name) + BH / 2, mx = (x1 + x2) / 2;
      edges += `<path class="edge${n.needsRebase ? ' warn' : ''}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`;
    }
  }
  for (const n of Object.values(report.nodes)) {
    const cls = n.trunk ? 'trunk' : n.needsRebase ? 'warn' : 'ok';
    const sub = n.trunk ? 'trunk' : `+${n.ahead}${n.behind ? ' −' + n.behind : ''}${n.unpushed ? ' · ↑' + n.unpushed : ''}${n.needsRebase ? ' · needs rebase' : ''}`;
    boxes += `<g class="node ${cls}" transform="translate(${px(n.name)} ${py(n.name)})"><title>${esc(n.name)}${n.subject ? ' — ' + esc(n.subject) : ''}${n.reason ? '\n' + esc(n.reason) : ''}</title>` +
      `<rect width="${BW}" height="${BH}" rx="8"/><text x="12" y="22" class="nm">${n.current ? '● ' : ''}${esc(n.name.length > 30 ? n.name.slice(0, 29) + '…' : n.name)}</text>` +
      `<text x="12" y="41" class="sb">${esc(sub)}</text></g>`;
  }
  const script = planScript(report);
  const mergedList = report.merged.length ? `<p class="muted">Merged, hidden: ${report.merged.map((m) => esc(m.name)).join(', ')}</p>` : '';
  const steps = report.plan.map((s) => `<li><code>${esc(s.branch)}</code> onto <code>${esc(s.onto)}</code><span class="muted"> — ${esc(s.reason)}</span></li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>stacklens — ${esc(report.trunk)}</title>
<style>
:root{--bg:#fff;--fg:#1c2128;--mut:#667085;--card:#f6f8fa;--bd:#d0d7de;--ok:#1a7f37;--warn:#bc4c00;--acc:#0969da}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--mut:#8b949e;--card:#161b22;--bd:#30363d;--ok:#3fb950;--warn:#f0883e;--acc:#58a6ff}}
body{margin:0;padding:24px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
h1{margin:0 0 4px;font-size:22px}.muted{color:var(--mut)}code,pre{font-family:ui-monospace,Menlo,monospace;font-size:13px}
.wrap{overflow:auto;border:1px solid var(--bd);border-radius:10px;background:var(--card);padding:8px;margin:16px 0}
.edge{fill:none;stroke:var(--bd);stroke-width:2}.edge.warn{stroke:var(--warn);stroke-dasharray:5 4}
.node rect{fill:var(--bg);stroke:var(--ok);stroke-width:2}.node.warn rect{stroke:var(--warn)}.node.trunk rect{stroke:var(--acc)}
.nm{fill:var(--fg);font:600 14px ui-monospace,Menlo,monospace}.sb{fill:var(--mut);font:12px system-ui,sans-serif}
pre{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:12px;overflow:auto}
button{background:var(--acc);color:#fff;border:0;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer}
.ok{color:var(--ok)}.warn{color:var(--warn)}
</style></head><body>
<h1>stacklens</h1>
<p class="muted">Stack on <code>${esc(report.trunk)}</code> — ${Object.keys(report.nodes).length - 1} active branch(es). Generated from git ancestry and reflogs; nothing was modified.</p>
<p>${report.plan.length ? `<span class="warn">⚠ ${report.plan.length} branch(es) need rebasing</span>` : '<span class="ok">✓ stack is in order</span>'}</p>
<div class="wrap"><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${edges}${boxes}</svg></div>
${mergedList}
${report.plan.length ? `<h2>Rebase plan</h2><ol>${steps}</ol><p><button id="cp">Copy script</button></p><pre id="sc">${esc(script)}</pre>
<script>document.getElementById('cp').onclick=function(){navigator.clipboard.writeText(document.getElementById('sc').textContent);this.textContent='Copied'}</script>` : ''}
</body></html>
`;
}

module.exports = { renderHtml };
