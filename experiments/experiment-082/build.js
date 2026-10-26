'use strict';
// Inlines src/safecsv.js into src/template.html -> index.html (one self-contained file).
const fs = require('fs');
const path = require('path');
const core = fs.readFileSync(path.join(__dirname, 'src/safecsv.js'), 'utf8');
const tpl = fs.readFileSync(path.join(__dirname, 'src/template.html'), 'utf8');
if (core.includes('</script')) throw new Error('core contains </script>');
fs.writeFileSync(path.join(__dirname, 'index.html'), tpl.replace('/*__CORE__*/', () => core));
console.log('built index.html (' + fs.statSync(path.join(__dirname, 'index.html')).size + ' bytes)');
