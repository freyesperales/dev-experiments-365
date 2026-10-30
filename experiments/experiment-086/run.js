#!/usr/bin/env node
'use strict';
// Usage: node run.js            start the VULNERABLE lab on 127.0.0.1:7077
//        node run.js --fixed    start the fixed server
//        node run.js hint N     print the next hints for challenge N (1-4)
//        node run.js list       list challenges
const hints = require('./hints.json');
const [a, b] = process.argv.slice(2);
if (a === 'list') { for (const [n, c] of Object.entries(hints)) console.log(n + '. ' + c.title + ' — ' + c.goal); process.exit(0); }
if (a === 'hint') {
  const c = hints[b];
  if (!c) { console.error('usage: node run.js hint 1..4'); process.exit(2); }
  console.log(c.title + '\nGoal: ' + c.goal); c.hints.forEach((h, i) => console.log('Hint ' + (i + 1) + ': ' + h)); process.exit(0);
}
if (a && a !== '--fixed') { console.error('unknown argument: ' + a); process.exit(2); }
const dir = a === '--fixed' ? './solutions/server.js' : './lab/server.js';
const port = Number(process.env.PORT || 7077);
require(dir).createServer().listen(port, '127.0.0.1', () =>
  console.log('TOOLTRAP ' + (a ? 'FIXED' : 'VULNERABLE — FOR TRAINING, NEVER DEPLOY') + ' on http://127.0.0.1:' + port));
