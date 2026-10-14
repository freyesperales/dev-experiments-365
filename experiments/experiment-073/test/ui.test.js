'use strict';
// Loads the built single file in headless Chromium (if available) and drives the UI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
let pw = null;
for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (e) { /* next */ } }
const chrome = ['/opt/pw-browsers/chromium', ...fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : []].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
test('UI: loads, scores, applies swaps, undo', { skip: !pw || !chrome ? 'no playwright/chromium available' : false }, async () => {
  require('../build.js');
  const b = await pw.chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--no-proxy-server', '--disable-background-networking'] });
  try {
  const pg = await b.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.join(__dirname, '..', 'plainly.html'));
  assert.match(await pg.textContent('#verdict'), /need work/);
  assert.ok((await pg.locator('#view mark').count()) > 0);
  const before = await pg.inputValue('#in');
  await pg.click('#apply');
  assert.notEqual(await pg.inputValue('#in'), before);
  assert.equal(await pg.locator('#view mark').count(), 0);
  await pg.click('#undo');
  assert.equal(await pg.inputValue('#in'), before);
  await pg.click('[data-ex=de]');
  assert.match(await pg.textContent('#stats'), /Deutsch/);
  await pg.fill('#in', 'We got your form. We will reply soon.');
  assert.match(await pg.textContent('#verdict'), /Meets/);
  await pg.fill('#in', '<img src=x onerror=alert(1)> test.');
  assert.equal(await pg.locator('#view img').count(), 0);
  assert.deepEqual(errs, []);
  } finally { await b.close(); }
});
