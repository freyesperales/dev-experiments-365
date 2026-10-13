#!/usr/bin/env node
'use strict';
// Inlines src/core.js and the example feeds into src/template.html -> index.html
const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function build() {
  const samples = { podcast: read('examples/podcast.xml'), atom: read('examples/blog.atom'), sitemap: read('examples/sitemap.xml') };
  const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1');
  return read('src/template.html')
    .replace('/*__CORE__*/', () => safe(read('src/core.js')))
    .replace('/*__SAMPLES__*/ {}', () => safe(JSON.stringify(samples)));
}

if (require.main === module) {
  const out = build();
  fs.writeFileSync(path.join(root, 'index.html'), out);
  console.log('wrote index.html (' + out.length + ' chars)');
}
module.exports = { build };
