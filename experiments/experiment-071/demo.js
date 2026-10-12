'use strict';
// Writes a synthetic, header-accurate Llama-3.1-8B-shaped GGUF (sparse data) to demo/ for trying the tool.
const fs = require('fs'), path = require('path');
const { build } = require('./test/make-gguf.js');
const out = path.join(__dirname, 'demo');
fs.mkdirSync(out, { recursive: true });
const tpl = "{{ bos_token }}{% for m in messages %}<|{{ m.role }}|>{{ m.content }}{% endfor %}{% if tools %}{{ tools }}{% endif %}";
const h = build({ name: 'Demo-8B-Instruct', layers: 32, emb: 4096, heads: 32, kvHeads: 8, ffn: 14336, vocab: 128256, qtype: 12, fileType: 15, ctx: 131072, template: tpl, addBos: true, noData: true });
// header only: declare the full tensor data size via a sparse file so size checks pass without writing GBs
const fd = fs.openSync(path.join(out, 'demo-8b-q4_k.gguf'), 'w');
fs.writeSync(fd, h);
const { parseHeader, describe } = require('./src/core.js');
const hd = parseHeader(h), d = describe(hd);
fs.ftruncateSync(fd, hd.dataStart + Math.max(...hd.tensors.map((t) => t.offset + t.bytes)));
fs.closeSync(fd);
console.log('wrote demo/demo-8b-q4_k.gguf (sparse, ' + (d.weightBytes / 1e9).toFixed(2) + ' GB declared)');
