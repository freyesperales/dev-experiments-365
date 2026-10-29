#!/usr/bin/env node
'use strict';
// Inlines lib.js into template.html -> index.html (the single shareable file).
const fs = require('fs'), path = require('path');
const lib = fs.readFileSync(path.join(__dirname, 'lib.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'index.html'), tpl.replace('/*LIB*/', () => lib));
console.log('wrote index.html');
