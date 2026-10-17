'use strict';

function ago(ts, now) {
  const s = Math.max(0, now - ts);
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  return Math.round(s / 86400) + 'd';
}

function label(n, now) {
  if (n.trunk) return `${n.name} (trunk)`;
  const bits = [`+${n.ahead}`];
  if (n.behind) bits.push(`-${n.behind}`);
  let s = `${n.current ? '* ' : ''}${n.name}  ${bits.join(' ')}`;
  if (n.needsRebase) s += '  ⚠ needs rebase';
  else s += '  ✓';
  if (n.unpushed) s += `  ↑${n.unpushed} unpushed`;
  else if (n.unpushed === null) s += '  (no upstream)';
  if (n.ts) s += `  ${ago(n.ts, now)}`;
  if (n.sameTipAs && n.sameTipAs.length) s += `  = ${n.sameTipAs.join(', ')}`;
  return s;
}

function renderText(report, opts = {}) {
  const now = opts.now || Math.floor(Date.now() / 1000);
  const out = [];
  const walk = (name, prefix, isLast, isRoot) => {
    const n = report.nodes[name];
    out.push(isRoot ? label(n, now) : prefix + (isLast ? '└─ ' : '├─ ') + label(n, now));
    if (n.needsRebase && n.reason && !isRoot) out.push(prefix + (isLast ? '   ' : '│  ') + '   ↳ ' + n.reason);
    const next = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');
    n.children.forEach((c, i) => walk(c, next, i === n.children.length - 1, false));
  };
  walk(report.root, '', true, true);
  if (report.merged.length && !opts.hideMerged) {
    out.push('', `merged (hidden from tree): ${report.merged.map((m) => m.name).join(', ')}`);
  }
  out.push('', report.plan.length
    ? `${report.plan.length} branch${report.plan.length === 1 ? '' : 'es'} need rebasing. Run \`stacklens --plan\` for the commands.`
    : 'Stack is in order.');
  return out.join('\n') + '\n';
}

module.exports = { renderText };
