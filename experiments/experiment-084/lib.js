'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_IGNORE = [
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/,
  /\.min\.(js|css)$/,
  /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|eot|zip|gz|mp4|mov|svg)$/i,
  /(^|\/)(vendor|node_modules|dist)\//,
];

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 29, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString().trim();
    throw new Error(msg.includes('not a git repository') ? `${cwd} is not a git repository` : `git ${args[0]} failed: ${msg}`);
  }
}

/** Parse `git log --numstat` output produced with our --format into per-file stats. */
function parseLog(text, opts = {}) {
  const files = new Map();
  let cur = null;
  let commits = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('@@')) {
      const [, ts, author] = line.match(/^@@(\d+)\|(.*)$/) || [];
      if (ts === undefined) continue;
      cur = { ts: +ts, author: author || 'unknown' };
      commits++;
      continue;
    }
    if (!cur || !line) continue;
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) continue;
    const file = m[3];
    let f = files.get(file);
    if (!f) files.set(file, (f = { path: file, commits: 0, added: 0, deleted: 0, authors: new Map(), last: 0, first: Infinity }));
    f.commits++;
    if (m[1] !== '-') f.added += +m[1];
    if (m[2] !== '-') f.deleted += +m[2];
    f.authors.set(cur.author, (f.authors.get(cur.author) || 0) + 1);
    if (cur.ts > f.last) f.last = cur.ts;
    if (cur.ts < f.first) f.first = cur.ts;
  }
  return { files, commits };
}

function countLines(abs) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > 2_000_000) return null;
    const buf = fs.readFileSync(abs);
    if (buf.subarray(0, 8000).includes(0)) return null; // binary
    let n = 0;
    for (const b of buf) if (b === 10) n++;
    return buf.length && buf[buf.length - 1] !== 10 ? n + 1 : n;
  } catch { return null; }
}

/** Build the data set: only files that still exist at HEAD. */
function collect(repo, opts = {}) {
  const root = path.resolve(repo);
  const top = git(root, ['rev-parse', '--show-toplevel']).trim();
  const args = ['log', '--no-renames', '--no-merges', '--numstat', '--format=@@%at|%an'];
  if (opts.since) args.push(`--since=${opts.since}`);
  if (opts.max) args.push(`-n`, String(opts.max));
  let logText = '';
  let hasCommits = true;
  try { git(top, ['rev-parse', 'HEAD']); } catch { hasCommits = false; }
  if (!hasCommits) throw new Error('repository has no commits yet');
  logText = git(top, args);
  const { files, commits } = parseLog(logText);
  const tracked = git(top, ['ls-files', '-z']).split('\0').filter(Boolean);
  const ignore = opts.noIgnore ? [] : DEFAULT_IGNORE;
  const out = [];
  for (const p of tracked) {
    if (ignore.some((re) => re.test(p))) continue;
    const loc = countLines(path.join(top, p));
    if (loc === null) continue;
    const f = files.get(p);
    out.push({
      p,
      loc: Math.max(loc, 1),
      c: f ? f.commits : 0,
      a: f ? f.added : 0,
      d: f ? f.deleted : 0,
      au: f ? f.authors.size : 0,
      top: f ? topShare(f) : 0,
      l: f ? f.last : 0,
      f: f ? f.first : 0,
    });
  }
  const name = path.basename(top);
  const head = git(top, ['rev-parse', '--short', 'HEAD']).trim();
  return { name, head, commits, since: opts.since || null, generated: Math.floor(Date.now() / 1000), files: out };
}

function topShare(f) {
  let best = 0, total = 0;
  for (const n of f.authors.values()) { total += n; if (n > best) best = n; }
  return total ? best / total : 0;
}

function render(data, templatePath = path.join(__dirname, 'template.html')) {
  const tpl = fs.readFileSync(templatePath, 'utf8');
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return tpl.replace('/*__DATA__*/null', json).replace(/__TITLE__/g, escapeHtml(data.name));
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/** Ranked hotspots: churn x size, the classic "code as a crime scene" heuristic. */
function hotspots(data, n = 10) {
  return data.files.filter((f) => f.c > 0)
    .map((f) => ({ ...f, score: f.c * Math.log2(f.loc + 1) }))
    .sort((x, y) => y.score - x.score).slice(0, n);
}

/** Single-owner files with real churn: where the bus factor is 1. */
function busFactorRisks(data, minCommits = 5) {
  return data.files.filter((f) => f.c >= minCommits && f.au === 1).sort((a, b) => b.c - a.c);
}

module.exports = { parseLog, collect, render, hotspots, busFactorRisks, countLines, DEFAULT_IGNORE, escapeHtml };
