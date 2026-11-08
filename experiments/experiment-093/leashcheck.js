#!/usr/bin/env node
'use strict';
// Leashcheck — offline auditor for AI coding-agent configuration committed in a repo.
// Zero dependencies. Defensive use only: reads files, never executes anything.
const fs = require('fs');
const path = require('path');

const VERSION = '1.0.0';
const SEV = { low: 1, medium: 2, high: 3 };

const RULES = {
  LC001: ['high', 'Hidden or invisible Unicode in an agent instruction file'],
  LC002: ['high', 'Secret written inline in an MCP / agent config'],
  LC003: ['medium', 'MCP server launched from an unpinned package'],
  LC004: ['high', 'MCP server reached over plaintext http:// to a non-local host'],
  LC005: ['high', 'Download-and-execute (curl|sh style) in agent config or instructions'],
  LC006: ['high', 'Over-broad pre-approved permission'],
  LC007: ['high', 'Project MCP servers auto-approved'],
  LC008: ['medium', 'Hook runs network or exfiltration-capable command'],
  LC009: ['high', 'Permission prompts disabled'],
  LC010: ['medium', 'Prompt-injection style wording in an instruction file'],
  LC011: ['high', 'API base URL redirected to a non-default host'],
  LC012: ['low', 'No deny rules protect secret files (.env, keys)'],
};

const MCP_FILES = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json', '.windsurf/mcp.json'];
const SETTINGS_FILES = ['.claude/settings.json', '.claude/settings.local.json'];
const INSTR_FILES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.cursorrules', '.windsurfrules', '.github/copilot-instructions.md'];
const INSTR_DIRS = ['.cursor/rules', '.claude/commands', '.claude/agents', '.github/instructions'];

// ---- helpers -------------------------------------------------------------
function stripJsonc(s) {
  let out = '', i = 0, str = false;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (str) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === '"') str = false; i++; continue; }
    if (c === '"') { str = true; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}
function parseJson(text) { return JSON.parse(stripJsonc(text.replace(/^﻿/, ''))); }
function lineOf(text, idx) { let l = 1; for (let i = 0; i < idx && i < text.length; i++) if (text.charCodeAt(i) === 10) l++; return l; }
function findKeyLine(text, key) { const m = text.indexOf('"' + key + '"'); return m < 0 ? 1 : lineOf(text, m); }

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, /\bgithub_pat_[A-Za-z0-9_]{40,}\b/, /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
  /\bsk-[A-Za-z0-9]{32,}\b/, /\bAKIA[0-9A-Z]{16}\b/, /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/, /\bglpat-[A-Za-z0-9_-]{20,}\b/, /\bnpm_[A-Za-z0-9]{36}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bBearer\s+[A-Za-z0-9._~+\/-]{24,}/,
];
const SECRET_KEY = /(token|secret|password|passwd|api[-_]?key|apikey|authorization|credential|private[-_]?key)/i;
const isRef = (v) => /^\$\{?[A-Za-z_][A-Za-z0-9_:.-]*\}?$/.test(v) || /^\$\{(env:|input:)/.test(v) || /^Bearer\s+\$\{/.test(v) || v === '';
const looksPlaceholder = (v) => /^(<.*>|your[-_ ].*|xxx+|changeme|example|\*+|todo)$/i.test(v);

// ---- file collection -----------------------------------------------------
function walkDir(dir, base, out) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p, base, out); else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
}
function collect(root) {
  const files = { mcp: [], settings: [], instr: [] };
  const has = (rel) => { try { return fs.statSync(path.join(root, rel)).isFile(); } catch { return false; } };
  for (const f of MCP_FILES) if (has(f)) files.mcp.push(f);
  for (const f of SETTINGS_FILES) if (has(f)) files.settings.push(f);
  for (const f of INSTR_FILES) if (has(f)) files.instr.push(f);
  for (const d of INSTR_DIRS) { const out = []; walkDir(path.join(root, d), root, out); for (const f of out) files.instr.push(f); }
  // nested AGENTS.md / CLAUDE.md (monorepos), shallow walk skipping heavy dirs
  const stack = [['', 0]];
  while (stack.length) {
    const [rel, depth] = stack.pop();
    if (depth > 3) continue;
    let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.isDirectory()) { if (!['node_modules', '.git', 'vendor', 'dist', 'build', '.next'].includes(e.name) && !e.name.startsWith('.')) stack.push([rel ? rel + '/' + e.name : e.name, depth + 1]); }
      else if (rel && ['AGENTS.md', 'CLAUDE.md'].includes(e.name)) files.instr.push(rel + '/' + e.name);
    }
  }
  files.instr = [...new Set(files.instr)];
  return files;
}

// ---- checks --------------------------------------------------------------
function checkInstruction(rel, text, add) {
  const re = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­᠎]|[\u{E0000}-\u{E007F}]/gu;
  const hits = []; let m;
  while ((m = re.exec(text))) { if (m.index === 0 && m[0] === '﻿') continue; hits.push(m); }
  if (hits.length) {
    const tags = hits.filter((h) => h[0].codePointAt(0) >= 0xe0000).length;
    let decoded = '';
    if (tags) decoded = [...text].filter((c) => c.codePointAt(0) >= 0xe0020 && c.codePointAt(0) <= 0xe007e).map((c) => String.fromCharCode(c.codePointAt(0) - 0xe0000)).join('');
    add('LC001', rel, lineOf(text, hits[0].index), `${hits.length} invisible character(s)` + (tags ? `, ${tags} Unicode "tag" chars which can smuggle text a human cannot see` : '') + (decoded ? `; decoded hidden text: "${decoded.slice(0, 120)}"` : ''), 'Delete the invisible characters (retype the file in a plain editor) and review the whole file as untrusted input.');
  }
  const lines = text.split('\n');
  const inj = [
    /ignore (all |any )?(previous|prior|above) (instructions|rules)/i, /do not (tell|inform|mention|reveal)[^.\n]{0,40}(user|developer|human)/i,
    /without (telling|informing|asking|notifying) the (user|developer)/i, /(send|post|upload|exfiltrate|forward)[^.\n]{0,60}(\.env|credentials|secrets?|api[ _-]?keys?|ssh)/i,
    /disregard (the )?(system|safety|security) (prompt|instructions|rules)/i,
  ];
  lines.forEach((ln, i) => {
    for (const r of inj) if (r.test(ln)) { add('LC010', rel, i + 1, `Suspicious instruction wording: "${ln.trim().slice(0, 100)}"`, 'Rules files are executed by the agent as trusted input. Remove manipulative or secret-handling wording; require review on changes to this file.'); break; }
    if (/(curl|wget|iwr|Invoke-WebRequest)[^|\n]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b|\b(ba)?sh\s+-c\s+["'`]?\$\((curl|wget)/i.test(ln)) add('LC005', rel, i + 1, `Download-and-execute in instructions: "${ln.trim().slice(0, 100)}"`, 'Pin and checksum what you install; do not tell an agent to pipe the network into a shell.');
  });
}

function scanSecretsIn(rel, obj, text, add, where) {
  const walk = (v, keyPath) => {
    if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) walk(x, keyPath.concat(k)); return; }
    if (typeof v !== 'string') return;
    const key = keyPath[keyPath.length - 1] || '';
    const hitPattern = SECRET_PATTERNS.find((p) => p.test(v));
    const keyed = keyPath.some((k) => SECRET_KEY.test(k)) && !isRef(v) && !looksPlaceholder(v) && v.length >= 8 && !/^https?:\/\/[^@]*$/.test(v);
    if (hitPattern || keyed) add('LC002', rel, findKeyLine(text, key), `Inline secret-like value at ${where}.${keyPath.join('.')}`, 'Reference an environment variable instead (e.g. "${MY_TOKEN}") and rotate the exposed value — it is in git history.');
  };
  walk(obj, []);
}

function checkMcp(rel, text, add) {
  let j; try { j = parseJson(text); } catch (e) { add('LC000', rel, 1, 'Could not parse JSON: ' + e.message, 'Fix the syntax so it can be audited.', 'low'); return; }
  const servers = j.mcpServers || j.servers || {};
  for (const [name, s] of Object.entries(servers)) {
    if (!s || typeof s !== 'object') continue;
    scanSecretsIn(rel, s, text, add, `server "${name}"`);
    const line = findKeyLine(text, name);
    const args = Array.isArray(s.args) ? s.args.map(String) : [];
    const cmd = String(s.command || '');
    const base = path.basename(cmd).replace(/\.cmd$/, '');
    if (['npx', 'bunx', 'pnpx'].includes(base) || (['pnpm', 'yarn', 'bun'].includes(base) && ['dlx', 'x'].includes(args[0]))) {
      const pkg = args.find((a) => !a.startsWith('-') && !['dlx', 'x'].includes(a));
      if (pkg && !/^(\.|\/|file:|https?:|git)/.test(pkg) && !/@\d[^/]*$/.test(pkg)) add('LC003', rel, line, `Server "${name}" runs "${pkg}" with no version pin (resolved fresh on each launch)`, `Pin it: ${pkg}@<exact version>, so a hijacked or typosquatted release cannot reach your agent.`);
    } else if (['uvx', 'pipx'].includes(base) || (base === 'uv' && args[0] === 'tool')) {
      const pkg = args.find((a) => !a.startsWith('-') && !['run', 'tool'].includes(a));
      if (pkg && !/(==|@)\d/.test(pkg) && !/^(\.|\/|git\+|https?:)/.test(pkg)) add('LC003', rel, line, `Server "${name}" runs "${pkg}" with no version pin`, `Pin it: ${pkg.split(/[<>=@]/)[0]}==<exact version>.`);
    } else if (base === 'docker' && args[0] === 'run') {
      const img = args.filter((a) => !a.startsWith('-'))[1];
      if (img && !/@sha256:/.test(img) && !/:[^/:]*\d/.test(img.split('/').pop())) add('LC003', rel, line, `Server "${name}" runs container image "${img}" without a version tag or digest`, 'Pin to a digest (image@sha256:…).');
    }
    const joined = [cmd].concat(args).join(' ');
    if (/(curl|wget)[^|]*\|\s*(ba|z)?sh\b|\b(ba|z)?sh\s+-c\b[^]*\b(curl|wget)\b/.test(joined)) add('LC005', rel, line, `Server "${name}" downloads and executes code at launch`, 'Install a pinned, verified binary once instead.');
    const url = s.url || s.serverUrl || '';
    if (typeof url === 'string' && /^http:\/\//i.test(url)) {
      let host = ''; try { host = new URL(url).hostname; } catch { /* ignore */ }
      if (!/^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/.test(host)) add('LC004', rel, line, `Server "${name}" uses plaintext ${url}`, 'Use https://; tokens and tool results cross this link in clear text.');
    }
  }
}

const BROAD_BASH = /^Bash\((?:(?:\*|:\*|\*:\*)|(?:curl|wget|sudo|rm|chmod|chown|dd|sh|bash|zsh|eval|ssh|scp|nc|ncat|python3?|node|perl|ruby|npx|pip3?|npm|docker|git push)(?::?\s?\*)?)\)$/;
function checkSettings(rel, text, add) {
  let j; try { j = parseJson(text); } catch (e) { add('LC000', rel, 1, 'Could not parse JSON: ' + e.message, 'Fix the syntax so it can be audited.', 'low'); return; }
  const perms = j.permissions || {};
  for (const a of perms.allow || []) {
    const s = String(a);
    if (s === 'Bash' || s === '*' || s === 'Write' || s === 'Edit' || s === 'WebFetch' || BROAD_BASH.test(s))
      add('LC006', rel, findKeyLine(text, s) , `Pre-approved permission "${s}" lets the agent act without a prompt on an open-ended surface`, 'Allow specific commands (e.g. "Bash(npm run test:*)"), keep network/exec/deletion tools on "ask".');
  }
  if (j.enableAllProjectMcpServers === true) add('LC007', rel, findKeyLine(text, 'enableAllProjectMcpServers'), 'enableAllProjectMcpServers: true auto-trusts every MCP server a cloned repo defines', 'Remove it and list vetted servers in enabledMcpjsonServers, or approve per server.');
  if (perms.defaultMode === 'bypassPermissions' || j.skipDangerousModePermissionPrompt === true) add('LC009', rel, findKeyLine(text, perms.defaultMode === 'bypassPermissions' ? 'defaultMode' : 'skipDangerousModePermissionPrompt'), 'Permission prompts are disabled for this project', 'Use "default" or "acceptEdits" in committed settings; reserve bypass for disposable sandboxes.');
  const env = j.env || {};
  for (const k of Object.keys(env)) {
    if (/_BASE_URL$|_API_URL$|^HTTPS?_PROXY$/i.test(k)) {
      const v = String(env[k]);
      if (!/^https:\/\/([a-z0-9-]+\.)*(anthropic\.com|openai\.com)(\/|$)/i.test(v)) add('LC011', rel, findKeyLine(text, k), `${k} points at ${v.slice(0, 80)} — API traffic (and the API key) goes there`, 'Do not let a repository redirect your agent traffic; set this only in your own user settings.');
    }
  }
  scanSecretsIn(rel, env, text, add, 'env');
  const hooks = j.hooks || {};
  const visit = (v) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === 'object') { if (typeof v.command === 'string') hookCheck(v.command); Object.values(v).forEach(visit); }
  };
  const hookCheck = (cmd) => {
    if (/(curl|wget|nc|ncat|scp|ssh|Invoke-WebRequest|iwr)\b/.test(cmd)) add(/\|\s*(ba|z)?sh\b/.test(cmd) ? 'LC005' : 'LC008', rel, findKeyLine(text, 'hooks'), `Hook command uses the network: "${cmd.slice(0, 110)}"`, 'Hooks run with your shell privileges on every matching event. Prefer local scripts reviewed in the repo; never pipe the network into a shell.');
    else if (/\b(printenv|env\b|cat\s+[^|;]*\.env|\$\{?[A-Z_]*(KEY|TOKEN|SECRET)[A-Z_]*\}?)/i.test(cmd) && /(>|\|)/.test(cmd)) add('LC008', rel, findKeyLine(text, 'hooks'), `Hook command reads environment/secret data and redirects it: "${cmd.slice(0, 110)}"`, 'Review what this hook does with credentials.');
  };
  visit(hooks);
  const deny = (perms.deny || []).map(String).join(' ');
  if (rel === '.claude/settings.json' && !/\.env|secrets|\.pem|id_rsa|\.ssh/.test(deny)) add('LC012', rel, 1, 'permissions.deny does not cover .env files, keys or ~/.ssh', 'Add e.g. "Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)" to permissions.deny.');
}

// ---- main scan -----------------------------------------------------------
function scan(root) {
  const findings = [];
  const add = (rule, file, line, message, fix, sevOverride) => findings.push({ rule, severity: sevOverride || (RULES[rule] || ['low'])[0], file, line, message, fix });
  const files = collect(root);
  const read = (rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { add('LC000', rel, 1, 'Unreadable: ' + e.message, 'Check permissions.', 'low'); return null; } };
  for (const f of files.mcp) { const t = read(f); if (t !== null) checkMcp(f, t, add); }
  for (const f of files.settings) { const t = read(f); if (t !== null) checkSettings(f, t, add); }
  for (const f of files.instr) { const t = read(f); if (t !== null) checkInstruction(f, t, add); }
  findings.sort((a, b) => SEV[b.severity] - SEV[a.severity] || a.file.localeCompare(b.file) || a.line - b.line);
  return { root, scanned: [].concat(files.mcp, files.settings, files.instr), findings };
}

// ---- output --------------------------------------------------------------
function formatText(r) {
  const out = [`leashcheck ${VERSION} — scanned ${r.scanned.length} agent config file(s) in ${r.root}`];
  if (!r.scanned.length) out.push('No agent configuration files found (nothing to audit).');
  for (const f of r.findings) out.push(`\n${f.severity.toUpperCase().padEnd(6)} ${f.rule}  ${f.file}:${f.line}\n  ${f.message}\n  fix: ${f.fix}`);
  const c = { high: 0, medium: 0, low: 0 }; r.findings.forEach((f) => c[f.severity]++);
  out.push(`\n${r.findings.length} finding(s): ${c.high} high, ${c.medium} medium, ${c.low} low`);
  return out.join('\n');
}
function formatSarif(r) {
  return { version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json', runs: [{ tool: { driver: { name: 'leashcheck', version: VERSION, rules: Object.entries(RULES).map(([id, [sev, d]]) => ({ id, shortDescription: { text: d }, defaultConfiguration: { level: sev === 'high' ? 'error' : sev === 'medium' ? 'warning' : 'note' } })) } }, results: r.findings.map((f) => ({ ruleId: f.rule, level: f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'note', message: { text: f.message + ' Fix: ' + f.fix }, locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: f.line } } }] })) }] };
}

function main(argv) {
  const args = argv.slice(2); let fmt = 'text', failOn = 'high', target = '.';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') fmt = 'json'; else if (a === '--sarif') fmt = 'sarif';
    else if (a === '--fail-on') { failOn = args[++i]; if (!(failOn in SEV) && failOn !== 'none') { console.error('--fail-on must be high|medium|low|none'); return 2; } }
    else if (a === '-h' || a === '--help') { console.log('usage: leashcheck [dir] [--json|--sarif] [--fail-on high|medium|low|none]\nexit: 0 clean, 1 findings at/above --fail-on (default high), 2 usage error'); return 0; }
    else if (a === '--version') { console.log(VERSION); return 0; }
    else if (a.startsWith('-')) { console.error('unknown option ' + a); return 2; } else target = a;
  }
  let st; try { st = fs.statSync(target); } catch { console.error('cannot read ' + target); return 2; }
  if (!st.isDirectory()) { console.error(target + ' is not a directory'); return 2; }
  const r = scan(target);
  console.log(fmt === 'json' ? JSON.stringify(r, null, 2) : fmt === 'sarif' ? JSON.stringify(formatSarif(r), null, 2) : formatText(r));
  if (failOn === 'none') return 0;
  return r.findings.some((f) => SEV[f.severity] >= SEV[failOn]) ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv);
module.exports = { scan, main, RULES };
