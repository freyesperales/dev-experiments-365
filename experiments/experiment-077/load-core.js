'use strict';
// Loads the pure core out of index.html so the page, the CLI and the tests share one copy.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = /<script id="core">([\s\S]*?)<\/script>/.exec(html);
if (!m) throw new Error('core script not found in index.html');
const sandbox = { module: { exports: {} }, TextDecoder, DataView, Response, Blob, DecompressionStream, Date, Math };
sandbox.module.exports = {};
vm.runInNewContext(m[1], sandbox, { filename: 'index.html#core' });
module.exports = sandbox.module.exports;
