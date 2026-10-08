// Loads the pure core out of index.html so the CLI and tests exercise the exact shipped code.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error('core script not found in index.html');
const module_ = {exports: {}};
new Function('module', m[1])(module_);
module.exports = module_.exports;
