'use strict';
// Inlines src/unbilled.js into src/template.html -> index.html (one self-contained file).
const fs = require('fs');
const path = require('path');
const core = fs.readFileSync(path.join(__dirname, 'src/unbilled.js'), 'utf8');
const tpl = fs.readFileSync(path.join(__dirname, 'src/template.html'), 'utf8');
if (core.includes('</script')) throw new Error('core contains </script>');
const sm = f => JSON.stringify(fs.readFileSync(path.join(__dirname, 'samples', f), 'utf8')).replace(/</g, '\\u003c');
const html = tpl.replace('/*__CORE__*/', () => core)
  .replace("/*__SAMPLE_TIME__*/''", () => sm('toggl.csv'))
  .replace("/*__SAMPLE_INV__*/''", () => sm('invoiced.csv'))
  .replace("/*__SAMPLE_CFG__*/'{}'", () => sm('config.json'));
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('built index.html (' + fs.statSync(path.join(__dirname, 'index.html')).size + ' bytes)');
