#!/usr/bin/env node
'use strict';
// Inlines core.js into index.html -> plainly.html (one file, shareable, works from file://)
const fs = require('fs'), path = require('path');
const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const core = fs.readFileSync(path.join(dir, 'core.js'), 'utf8');
if (!html.includes('<script src="core.js"></script>')) { console.error('index.html: core.js script tag not found'); process.exit(1); }
const out = html.replace('<script src="core.js"></script>', () => '<script>\n' + core.replace(/<\/script/gi, '<\\/script') + '\n</script>');
fs.writeFileSync(path.join(dir, 'plainly.html'), out);
console.log(`built plainly.html (${(out.length / 1024).toFixed(1)} KB)`);
