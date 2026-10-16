'use strict';
// Inlines src/core.js and a sample session into src/index.template.html -> index.html (single self-contained file).
const fs = require('fs'), path = require('path');
const d = __dirname, rd = (p) => fs.readFileSync(path.join(d, p), 'utf8');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const out = rd('src/index.template.html')
  .replace('/*CORE*/', () => safe(rd('src/core.js')))
  .replace('/*SAMPLE*/', () => safe(JSON.stringify(rd('fixtures/planted.jsonl'))));
fs.writeFileSync(path.join(d, 'index.html'), out);
console.log('built index.html (' + out.length + ' bytes)');
