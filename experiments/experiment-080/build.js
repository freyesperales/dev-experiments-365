// Inlines src/core.js into src/ui.html -> index.html (single self-contained file).
const fs = require('fs'), path = require('path');
const core = fs.readFileSync(path.join(__dirname, 'src/core.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, 'src/ui.html'), 'utf8');
if (!ui.includes('/*__CORE__*/')) throw new Error('placeholder missing in src/ui.html');
fs.writeFileSync(path.join(__dirname, 'index.html'), ui.replace('/*__CORE__*/', () => core.replace(/<\/script/gi, '<\\/script')));
console.log('built index.html');
