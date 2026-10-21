'use strict';
// Inlines src/core.js into src/app.html -> index.html (single self-contained file).
const fs = require('fs'), path = require('path');
const core = fs.readFileSync(path.join(__dirname, 'src/core.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'src/app.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'index.html'), app.replace('/*CORE*/', () => core.replace(/<\/script/gi, '<\\/script')));
console.log('wrote index.html');
