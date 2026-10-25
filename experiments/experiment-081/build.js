// Inlines src/core.js into src/ui.html -> index.html (single self-contained file).
const fs = require('fs'), path = require('path');
const core = fs.readFileSync(path.join(__dirname, 'src/core.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, 'src/ui.html'), 'utf8');
const sample = fs.readFileSync(path.join(__dirname, 'samples/production.conf'), 'utf8');
if (!ui.includes('/*__CORE__*/') || !ui.includes('/*__SAMPLE__*/')) throw new Error('placeholder missing in src/ui.html');
const esc = s => s.replace(/<\/script/gi, '<\\/script');
fs.writeFileSync(path.join(__dirname, 'index.html'), ui.replace('/*__CORE__*/', () => esc(core)).replace('/*__SAMPLE__*/', () => esc(JSON.stringify(sample))));
console.log('built index.html');
