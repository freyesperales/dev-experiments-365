#!/usr/bin/env node
'use strict';
// Gatehouse — zero-dependency GitHub Actions workflow auditor.
// Line-oriented scanner (not a full YAML parser): fast, offline, deterministic.
const fs = require('fs');
const path = require('path');

const SEV = { critical: 4, high: 3, medium: 2, low: 1 };

const RULES = {
  GH001: { sev: 'critical', title: 'Privileged trigger checks out untrusted PR code',
    why: 'pull_request_target / workflow_run run with secrets and a write token. Checking out the PR head and then running or building it hands that power to the PR author ("pwn request").',
    fix: 'Do not check out PR head in privileged workflows. Split into an unprivileged pull_request workflow (build/test) and a privileged one that only consumes artifacts as data.' },
  GH002: { sev: 'high', title: 'Untrusted expression interpolated into script',
    why: '${{ }} is substituted into the script text before the shell parses it, so a PR title, branch name or comment body becomes code.',
    fix: 'Pass it through an env var and use the shell variable: env: { TITLE: ${{ github.event.pull_request.title }} } then "$TITLE".' },
  GH003: { sev: 'high', title: 'Third-party action not pinned to a commit SHA',
    why: 'Tags and branches are mutable; a compromised maintainer account can repoint them (tj-actions/changed-files, 2025).',
    fix: 'Pin to the full 40-char commit SHA and keep the version in a trailing comment; let Dependabot update it.' },
  GH004: { sev: 'medium', title: 'Action not pinned to a commit SHA (first-party)',
    why: 'Same mutability risk as GH003 but the publisher is GitHub; lower likelihood.',
    fix: 'Pin to a full commit SHA.' },
  GH005: { sev: 'medium', title: 'No explicit GITHUB_TOKEN permissions',
    why: 'Without a permissions block the token gets the repo/org default, which is often read-write.',
    fix: 'Add top-level "permissions: {}" or "contents: read" and grant extra scopes per job.' },
  GH006: { sev: 'high', title: 'Overly broad permissions (write-all)',
    why: 'write-all gives every step every write scope.',
    fix: 'List only the scopes the job needs.' },
  GH007: { sev: 'high', title: 'All secrets exposed to the job or reusable workflow',
    why: 'secrets: inherit and toJSON(secrets) hand over every secret, including ones the callee does not need.',
    fix: 'Pass only the named secrets required.' },
  GH008: { sev: 'high', title: 'Untrusted expression written to GITHUB_ENV / GITHUB_PATH / GITHUB_OUTPUT',
    why: 'Writing attacker-controlled text to the env file lets newlines inject variables such as LD_PRELOAD or NODE_OPTIONS into later steps.',
    fix: 'Validate against a strict allow-list pattern before writing, or avoid passing untrusted data between steps.' },
  GH009: { sev: 'medium', title: 'Remote script piped into a shell',
    why: 'curl | bash runs whatever the server returns at that moment, unverified.',
    fix: 'Download a pinned version, verify a checksum or signature, then execute.' },
  GH010: { sev: 'high', title: 'Self-hosted runner reachable from pull_request triggers',
    why: 'Fork PR code on a persistent self-hosted runner can persist malware and reach your network.',
    fix: 'Use GitHub-hosted runners for untrusted triggers, or require approval and ephemeral runners.' },
  GH011: { sev: 'low', title: 'Checkout keeps credentials and job uploads artifacts',
    why: 'The token is left in .git/config; uploading the workspace can leak it into an artifact (ArtiPACKED).',
    fix: 'Set persist-credentials: false on actions/checkout.' },
};

const UNTRUSTED = [
  'github\\.event\\.issue\\.title', 'github\\.event\\.issue\\.body',
  'github\\.event\\.pull_request\\.title', 'github\\.event\\.pull_request\\.body',
  'github\\.event\\.pull_request\\.head\\.ref', 'github\\.event\\.pull_request\\.head\\.label',
  'github\\.event\\.pull_request\\.head\\.repo\\.default_branch',
  'github\\.event\\.comment\\.body', 'github\\.event\\.review\\.body',
  'github\\.event\\.review_comment\\.body', 'github\\.event\\.discussion\\.title',
  'github\\.event\\.discussion\\.body', 'github\\.event\\.pages\\.[^\\s}]*\\.page_name',
  'github\\.event\\.commits\\.[^\\s}]*\\.message', 'github\\.event\\.commits\\.[^\\s}]*\\.author\\.(?:email|name)',
  'github\\.event\\.head_commit\\.message', 'github\\.event\\.head_commit\\.author\\.(?:email|name)',
  'github\\.event\\.workflow_run\\.head_branch', 'github\\.event\\.workflow_run\\.head_commit\\.message',
  'github\\.event\\.workflow_run\\.pull_requests\\.[^\\s}]*\\.head\\.ref',
  'github\\.head_ref',
];
const EXPR = /\$\{\{([\s\S]*?)\}\}/g;
const UNTRUSTED_RE = new RegExp('(?:' + UNTRUSTED.join('|') + ')');
const HEAD_REF_RE = /github\.event\.pull_request\.head\.(?:sha|ref)|github\.head_ref|github\.event\.workflow_run\.head_(?:sha|branch)|refs\/pull\/[^\s'"]*\/(?:merge|head)/;

function indentOf(l) { return l.match(/^ */)[0].length; }
function stripComment(l) { return l.replace(/(^|\s)#.*$/, ''); }

// Mark lines that belong to block scalars (run: | ... ) and which key owns them.
function parse(text) {
  const raw = text.replace(/\r\n/g, '\n').split('\n');
  const lines = raw.map((s, i) => ({ n: i + 1, s, ind: indentOf(s), code: stripComment(s), block: null }));
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].code.match(/^(\s*)(?:-\s+)?([A-Za-z_-]+):\s*[|>][+-]?\d*\s*$/);
    if (!m) continue;
    const keyInd = lines[i].ind + (lines[i].code.match(/^\s*-\s+/) ? lines[i].code.match(/^\s*-\s+/)[0].length - lines[i].ind : 0);
    const baseInd = lines[i].ind;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].s.trim() === '') { lines[j].block = { key: m[2], start: i }; continue; }
      if (lines[j].ind > Math.max(baseInd, keyInd - 1) && lines[j].ind > baseInd) lines[j].block = { key: m[2], start: i };
      else break;
    }
  }
  return lines;
}

function triggers(lines) {
  const t = new Set();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.ind !== 0) continue;
    const m = l.code.match(/^(?:on|"on"|'on'):\s*(.*)$/);
    if (!m) continue;
    const rest = m[1].trim();
    if (rest) { rest.replace(/[\[\]{},]/g, ' ').split(/\s+/).filter(Boolean).forEach(x => t.add(x.replace(/:$/, ''))); }
    else {
      let base = null;
      for (let j = i + 1; j < lines.length; j++) {
        const c = lines[j].code;
        if (!c.trim()) continue;
        if (lines[j].ind === 0) break;
        if (base === null) base = lines[j].ind;
        if (lines[j].ind === base) { const k = c.trim().replace(/^-\s*/, '').match(/^([A-Za-z_]+)/); if (k) t.add(k[1]); }
      }
    }
  }
  return t;
}

function splitJobs(lines) {
  let jobsIdx = lines.findIndex(l => l.ind === 0 && /^jobs:\s*$/.test(l.code));
  if (jobsIdx < 0) return [];
  let base = null; const jobs = [];
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.code.trim()) continue;
    if (l.ind === 0) { if (jobs.length) jobs[jobs.length - 1].end = i; break; }
    if (base === null) base = l.ind;
    const m = l.ind === base && l.code.match(/^\s*([A-Za-z0-9_-]+):\s*$/);
    if (m) { if (jobs.length) jobs[jobs.length - 1].end = i; jobs.push({ name: m[1], start: i, end: lines.length, ind: base }); }
  }
  return jobs;
}

function splitSteps(lines, job) {
  const steps = []; let stepsInd = null, cur = null;
  for (let i = job.start + 1; i < job.end; i++) {
    const l = lines[i];
    if (!l.code.trim()) continue;
    if (stepsInd === null) { if (/^\s*steps:\s*$/.test(l.code) && l.ind === job.ind + 2) stepsInd = l.ind; continue; }
    if (l.ind <= stepsInd && !/^\s*-/.test(l.code)) { break; }
    if (l.ind <= stepsInd && l.ind === stepsInd && /^\s*-/.test(l.code) || (l.ind === stepsInd + 2 && /^\s*-\s/.test(l.code) && !l.block) || (l.ind === stepsInd && /^-?\s*-\s/.test(l.code.trimStart() ? l.code : ''))) {
      if (cur) cur.end = i; cur = { start: i, end: job.end }; steps.push(cur);
    }
  }
  return steps;
}

function add(out, file, rule, line, detail, extra) {
  out.push(Object.assign({ file, rule, severity: RULES[rule].sev, title: RULES[rule].title, line: line.n, snippet: line.s.trim().slice(0, 140), detail }, extra || {}));
}

function ignored(lines, idx, rule) {
  for (const k of [idx, idx - 1]) {
    if (k < 0) continue;
    const m = lines[k].s.match(/#\s*gatehouse-ignore:?\s*([A-Z0-9, ]+)/);
    if (m && (m[1].includes(rule) || /\ball\b/i.test(m[1]))) return true;
  }
  return false;
}

function audit(text, file) {
  file = file || 'workflow.yml';
  const lines = parse(text); const out = [];
  const trig = triggers(lines);
  const privileged = trig.has('pull_request_target') || trig.has('workflow_run');
  const untrustedTrig = trig.has('pull_request') || trig.has('pull_request_target') || trig.has('issue_comment') || trig.has('issues');
  const jobs = splitJobs(lines);
  const topPerm = lines.find(l => l.ind === 0 && /^permissions:/.test(l.code));

  lines.forEach((l, idx) => {
    const c = l.code;
    // GH003/GH004 — uses:
    const u = c.match(/^\s*(?:-\s+)?uses:\s*['"]?([^\s'"#]+)/);
    if (u) {
      const ref = u[1];
      if (!ref.startsWith('./') && !ref.startsWith('docker://') ) {
        const at = ref.split('@');
        if (at.length === 2 && !/^[0-9a-f]{40}$/i.test(at[1])) {
          const first = /^(actions|github)\//.test(at[0]);
          // reusable workflows in the same org are still flagged as first/third by owner
          add(out, file, first ? 'GH004' : 'GH003', l, `${at[0]} uses mutable ref "${at[1]}"`);
        } else if (at.length === 1) add(out, file, 'GH003', l, `${ref} has no ref at all`);
      } else if (ref.startsWith('docker://') && !/@sha256:[0-9a-f]{64}/.test(ref)) add(out, file, 'GH003', l, `${ref} is not pinned by digest`);
    }
    // GH002 — expressions in run / script
    if (l.block && (l.block.key === 'run' || l.block.key === 'script') || /^\s*(?:-\s+)?(?:run|script):\s*\S/.test(c)) {
      const inlineRun = /^\s*(?:-\s+)?(?:run|script):\s*\S/.test(c) && !l.block;
      let mm; EXPR.lastIndex = 0;
      while ((mm = EXPR.exec(c))) {
        if (UNTRUSTED_RE.test(mm[1])) { add(out, file, 'GH002', l, `\${{ ${mm[1].trim()} }} is attacker-controlled`); break; }
      }
      void inlineRun;
      if (/curl[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b|wget[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/.test(c)) add(out, file, 'GH009', l, 'download piped into a shell');
    }
    // GH008
    if (/>>\s*"?\$\{?GITHUB_(?:ENV|PATH|OUTPUT)\}?"?/.test(c) || /GITHUB_(?:ENV|PATH)/.test(c) && /\$\{\{/.test(c)) {
      EXPR.lastIndex = 0; let mm;
      while ((mm = EXPR.exec(c))) if (UNTRUSTED_RE.test(mm[1])) { add(out, file, 'GH008', l, `untrusted ${mm[1].trim()} written to env file`); break; }
    }
    // GH006 / GH007
    if (/^\s*permissions:\s*write-all\s*$/.test(c)) add(out, file, 'GH006', l, 'permissions: write-all');
    if (/^\s*secrets:\s*inherit\s*$/.test(c) || /toJSON\(\s*secrets\s*\)/.test(c)) add(out, file, 'GH007', l, 'every secret is exposed');
    // GH010
    if (/^\s*runs-on:/.test(c) && /self-hosted/.test(c) && untrustedTrig) add(out, file, 'GH010', l, `self-hosted runner with trigger(s): ${[...trig].filter(t => ['pull_request', 'pull_request_target', 'issue_comment', 'issues'].includes(t)).join(', ')}`);
  });

  // GH005 — permissions
  if (!topPerm) {
    for (const j of jobs) {
      let has = false;
      for (let i = j.start + 1; i < j.end; i++) if (lines[i].ind === j.ind + 2 && /^\s*permissions:/.test(lines[i].code)) has = true;
      const isCall = lines.slice(j.start + 1, j.end).some(l => l.ind === j.ind + 2 && /^\s*uses:/.test(l.code));
      if (!has) add(out, file, 'GH005', lines[j.start], `job "${j.name}"${isCall ? ' (reusable workflow call)' : ''} has no permissions and the file has no top-level block`);
    }
  }

  // Step-level: GH001, GH011
  for (const j of jobs) {
    const steps = splitSteps(lines, j);
    const jobText = lines.slice(j.start, j.end).map(l => l.code).join('\n');
    const uploads = /uses:\s*actions\/upload-artifact/.test(jobText);
    for (const s of steps) {
      const seg = lines.slice(s.start, s.end);
      const segText = seg.map(l => l.code).join('\n');
      if (/uses:\s*['"]?actions\/checkout/.test(segText)) {
        if (privileged) {
          const hit = seg.find(l => /^\s*ref:/.test(l.code) && HEAD_REF_RE.test(l.code)) ||
            seg.find(l => /^\s*repository:/.test(l.code) && /head\.repo|github\.event\.pull_request/.test(l.code));
          if (hit) add(out, file, 'GH001', hit, `privileged trigger (${[...trig].filter(t => ['pull_request_target', 'workflow_run'].includes(t)).join(', ')}) checks out the PR head`);
        }
        if (uploads && !/persist-credentials:\s*['"]?false/.test(segText)) add(out, file, 'GH011', lines[s.start], `job "${j.name}" uploads artifacts without persist-credentials: false`);
      }
    }
  }

  const final = out.filter(f => !ignored(lines, f.line - 1, f.rule));
  final.sort((a, b) => SEV[b.severity] - SEV[a.severity] || a.line - b.line);
  return final;
}

function collect(targets) {
  const files = [];
  const walk = p => {
    const st = fs.statSync(p);
    if (st.isDirectory()) { for (const e of fs.readdirSync(p)) { if (e === 'node_modules' || e === '.git') continue; walk(path.join(p, e)); } }
    else if (/\.ya?ml$/i.test(p)) files.push(p);
  };
  for (const t of targets) {
    if (!fs.existsSync(t)) throw new Error(`path not found: ${t}`);
    const wf = path.join(t, '.github', 'workflows');
    if (fs.existsSync(t) && fs.statSync(t).isDirectory() && fs.existsSync(wf)) walk(wf); else walk(t);
  }
  return files;
}

function sarif(findings) {
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{ tool: { driver: { name: 'gatehouse', informationUri: 'https://github.com/freyesperales/dev-experiments-365/tree/main/experiments/experiment-087',
      rules: Object.entries(RULES).map(([id, r]) => ({ id, shortDescription: { text: r.title }, fullDescription: { text: r.why }, help: { text: r.fix } })) } },
      results: findings.map(f => ({ ruleId: f.rule, level: SEV[f.severity] >= 3 ? 'error' : f.severity === 'medium' ? 'warning' : 'note',
        message: { text: f.detail }, locations: [{ physicalLocation: { artifactLocation: { uri: f.file.replace(/\\/g, '/') }, region: { startLine: f.line } } }] })) }],
  };
}

function render(findings, nfiles) {
  if (!findings.length) return `gatehouse: ${nfiles} workflow file(s) scanned — no findings.\n`;
  let s = '';
  for (const f of findings) {
    s += `${f.severity.toUpperCase().padEnd(8)} ${f.rule}  ${f.file}:${f.line}\n         ${f.title}\n         ${f.detail}\n         > ${f.snippet}\n         fix: ${RULES[f.rule].fix}\n\n`;
  }
  const c = {}; findings.forEach(f => c[f.severity] = (c[f.severity] || 0) + 1);
  s += `${findings.length} finding(s) in ${nfiles} file(s): ` + Object.keys(SEV).filter(k => c[k]).map(k => `${c[k]} ${k}`).join(', ') + '\n';
  return s;
}

function main(argv) {
  const args = argv.slice(2); let format = 'text', failOn = 'high'; const targets = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') format = 'json'; else if (a === '--sarif') format = 'sarif';
    else if (a === '--fail-on') failOn = args[++i];
    else if (a === '--explain') { const r = RULES[args[++i]]; if (!r) { console.error('unknown rule'); return 2; } console.log(`${r.title} [${r.sev}]\n\nWhy: ${r.why}\nFix: ${r.fix}`); return 0; }
    else if (a === '--rules') { for (const [id, r] of Object.entries(RULES)) console.log(`${id}  ${r.sev.padEnd(8)} ${r.title}`); return 0; }
    else if (a === '-h' || a === '--help') { console.log('usage: gatehouse [path...] [--json|--sarif] [--fail-on critical|high|medium|low|never] [--rules] [--explain GH001]\nDefault path: .  (scans .github/workflows)\nSuppress: "# gatehouse-ignore: GH003" on the line or the line above.'); return 0; }
    else if (a.startsWith('-')) { console.error(`unknown option ${a}`); return 2; }
    else targets.push(a);
  }
  if (failOn !== 'never' && !SEV[failOn]) { console.error('--fail-on must be critical|high|medium|low|never'); return 2; }
  let files;
  try { files = collect(targets.length ? targets : ['.']); } catch (e) { console.error(`gatehouse: ${e.message}`); return 2; }
  if (!files.length) { console.error('gatehouse: no workflow YAML files found'); return 2; }
  const findings = [];
  for (const f of files) {
    try { findings.push(...audit(fs.readFileSync(f, 'utf8'), path.relative(process.cwd(), f) || f)); }
    catch (e) { console.error(`gatehouse: cannot read ${f}: ${e.message}`); return 2; }
  }
  findings.sort((a, b) => SEV[b.severity] - SEV[a.severity]);
  process.stdout.write(format === 'json' ? JSON.stringify(findings, null, 2) + '\n' : format === 'sarif' ? JSON.stringify(sarif(findings), null, 2) + '\n' : render(findings, files.length));
  if (failOn === 'never') return 0;
  return findings.some(f => SEV[f.severity] >= SEV[failOn]) ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { audit, RULES, main };
