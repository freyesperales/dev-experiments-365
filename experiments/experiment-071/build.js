'use strict';
// Inlines src/core.js into src/index.template.html -> index.html (the single shippable file).
const fs = require('fs'), path = require('path');
const core = fs.readFileSync(path.join(__dirname, 'src/core.js'), 'utf8');
const tpl = fs.readFileSync(path.join(__dirname, 'src/index.template.html'), 'utf8');
if (core.includes('</script')) throw new Error('core.js must not contain </script');
fs.writeFileSync(path.join(__dirname, 'index.html'), tpl.replace('/*CORE*/', () => core));
console.log('built index.html');
