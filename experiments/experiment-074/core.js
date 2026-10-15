'use strict';
// Loads the single source of truth: the <script id="core"> block inside index.html.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = /\/\/ <core>([\s\S]*?)\/\/ <\/core>/.exec(html);
if (!m) throw new Error('core block not found in index.html');
const names = 'SIZES readVal parseDate parseQuery search interpretAt plausibleDates identify scanMagics findStrings analyzeBlocks entropy hexdumpLine isoZ'.split(' ');
const ctx = {TextEncoder, TextDecoder, DataView, Uint8Array, Uint32Array, BigInt, Number, Date, Math, String, Set, isFinite, isNaN, Array, Object, Error};
vm.createContext(ctx);
vm.runInContext(m[1] + '\n;this.__api={' + names.join(',') + '};', ctx);
module.exports = ctx.__api;
