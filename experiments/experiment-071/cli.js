#!/usr/bin/env node
'use strict';
// gguf-xray CLI: node cli.js model.gguf --vram 12 [--ram 32] [--ctx 8192] [--kv f16|q8_0|q4_0] [--json]
const fs = require('fs');
const path = require('path');
const X = require('./src/core.js');

function parseArgs(argv) {
  const o = { vram: 8, ram: null, ctx: 8192, kv: 'f16', json: false, file: null, overhead: 512 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], val = () => { if (i + 1 >= argv.length) throw new Error(a + ' needs a value'); return argv[++i]; };
    if (a === '--vram') o.vram = Number(val());
    else if (a === '--ram') o.ram = Number(val());
    else if (a === '--ctx') o.ctx = Number(val());
    else if (a === '--kv') o.kv = val();
    else if (a === '--overhead') o.overhead = Number(val());
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('-')) throw new Error('unknown option ' + a);
    else o.file = a;
  }
  for (const k of ['vram', 'ctx', 'overhead']) if (!(o[k] > 0)) throw new Error('--' + k + ' must be a positive number');
  if (o.ram !== null && !(o.ram >= 0)) throw new Error('--ram must be >= 0');
  if (!X.KV_TYPES[o.kv]) throw new Error('--kv must be one of ' + Object.keys(X.KV_TYPES).join(', '));
  return o;
}

const HELP = `gguf-xray — read a .gguf header and tell me if it fits.
usage: node cli.js model.gguf [--vram GB] [--ram GB] [--ctx N] [--kv f16|q8_0|q4_0] [--overhead MB] [--json]`;

async function run(argv, out) {
  const o = parseArgs(argv);
  if (o.help || !o.file) { out(HELP); return o.help ? 0 : 2; }
  const st = fs.statSync(o.file);
  const fd = fs.openSync(o.file, 'r');
  let h;
  try {
    h = await X.readHeader(async (s, e) => { const b = Buffer.alloc(e - s); fs.readSync(fd, b, 0, e - s, s); return b; }, st.size);
  } finally { fs.closeSync(fd); }
  const d = X.describe(h, st.size);
  const opts = { vramGB: o.vram, ramGB: o.ram, ctx: o.ctx, kvType: o.kv, overheadMB: o.overhead, template: h.kv['tokenizer.chat_template'] };
  const p = X.plan(d, opts);
  const name = path.basename(o.file);
  const c = X.checks(h, d, p, opts, name);
  if (o.json) { out(JSON.stringify({ file: name, model: d, plan: p, checks: c, command: X.launchCommand(name, d, p, opts) }, null, 2)); return c.some((x) => x.sev === 'error') ? 1 : 0; }
  const f = X.fmtBytes;
  out(`${name}`);
  out(`  ${d.name || '(unnamed)'} · ${d.arch} · ${d.layers} layers · ${(d.params / 1e9).toFixed(2)}B params · ${d.fileType || '?'} · ${d.bitsPerWeight.toFixed(2)} bits/weight`);
  out(`  weights ${f(d.weightBytes)} · trained context ${d.trainedCtx || '?'} · KV heads ${d.kvHeads}/${d.heads}`);
  out('  quant mix: ' + Object.entries(d.byType).sort((a, b) => b[1].bytes - a[1].bytes).map(([k, v]) => `${k} ${(100 * v.bytes / d.weightBytes).toFixed(1)}%`).join(', '));
  if (p.ok) {
    out(`  @ ctx ${o.ctx} (${o.kv} KV): KV cache ${f(p.kvTotal)} · total on GPU ${f(p.gpuBytes)} of ${o.vram} GB VRAM`);
    const v = { full: 'FITS — full GPU offload', partial: `PARTIAL — offload ${p.ngl}/${p.layers} layers, ${f(p.cpuBytes)} spills to RAM`, cpu: 'CPU ONLY — no whole layer fits in VRAM', none: 'DOES NOT FIT in VRAM + RAM' }[p.verdict];
    out('  verdict: ' + v);
    out(`  max context for full offload: ${p.maxCtxFull.toLocaleString('en-US')} tokens`);
    out('  run: ' + X.launchCommand(name, d, p, opts));
  } else out('  ' + p.reason);
  for (const x of c) out(`  [${x.sev.toUpperCase()}] ${x.id}: ${x.msg}`);
  return c.some((x) => x.sev === 'error') ? 1 : 0;
}

if (require.main === module) {
  run(process.argv.slice(2), console.log).then((c) => { process.exitCode = c; }, (e) => { console.error('error: ' + e.message); process.exitCode = 2; });
}
module.exports = { run, parseArgs };
