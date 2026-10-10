#!/usr/bin/env node
// Inlines src/core.js + src/sample.js into src/index.template.html -> index.html
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function build() {
  const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
  const safe = s => s.replace(/<\/script/gi, '<\\/script');
  return rd('src/index.template.html')
    .replace('/*__CORE__*/', () => safe(rd('src/core.js')))
    .replace('/*__SAMPLE__*/', () => safe(rd('src/sample.js')));
}
if (require.main === module) {
  const html = build();
  const out = path.join(root, 'index.html');
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== html) { console.error('index.html is stale — run: node scripts/build.js'); process.exit(1); }
    console.log('index.html is up to date');
  } else { fs.writeFileSync(out, html); console.log('wrote index.html (' + html.length + ' bytes)'); }
}
module.exports = { build };
