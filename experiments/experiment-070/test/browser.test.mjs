// Real-browser smoke test (Chromium via Playwright). Skips cleanly if Playwright/Chromium are unavailable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const HB = require('../core.cjs');
let chromium = null;
for (const base of [process.env.PLAYWRIGHT_PATH, (() => { try { return join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'); } catch { return null; } })(), '/opt/node-tools/node_modules/playwright', 'playwright']) {
  if (!base) continue;
  try { chromium = require(base).chromium; break; } catch { /* try next */ }
}
const page_url = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
const shots = fileURLToPath(new URL('../docs/', import.meta.url));
const skip = chromium ? false : 'playwright not installed';

async function withPage(fn) {
  const exe = process.env.CHROMIUM_PATH || undefined;
  const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await fn(p, errors);
    assert.deepEqual(errors, []);
  } finally { await b.close(); }
}
const link = async (s) => page_url + '#' + await HB.encode(s);

test('every widget renders from a link; screenshots saved to docs/', { skip }, async () => {
  mkdirSync(shots, { recursive: true });
  const now = Date.now();
  const boards = {
    sign: { ...HB.defaults('sign'), x: 'BACK IN\n10 MIN' },
    count: { ...HB.defaults('count'), x: 'Launch day', at: now + (3 * 86400 + 4 * 3600 + 5 * 60 + 30) * 1000 },
    score: { ...HB.defaults('score'), tm: [{ n: 'Lions', s: 21 }, { n: 'Tigers', s: 17 }] },
    queue: { ...HB.defaults('queue'), n: 41, i: 47 },
    timer: { ...HB.defaults('timer'), st: now - 7 * 60000 },
    sched: HB.defaults('sched'),
  };
  const want = { sign: /back in/i, count: /Launch day[\s\S]*DAYS|days/i, score: /lions[\s\S]*21/i, queue: /041/, timer: /focus 1\/4/i, sched: /keynote/i };
  await withPage(async (p) => {
    for (const [t, s] of Object.entries(boards)) {
      await p.goto(await link(s)); await p.waitForSelector('#stage > *:not(.home)'); await p.waitForTimeout(400);
      assert.match(await p.innerText('#stage'), want[t], t);
      await p.screenshot({ path: join(shots, t + '.png') });
    }
  });
});

test('scoreboard tap updates the visible score AND the URL; reload keeps it', { skip }, async () => {
  await withPage(async (p) => {
    await p.goto(await link(HB.defaults('score'))); await p.waitForSelector('.team');
    const before = await p.evaluate(() => location.hash);
    await p.click('.team >> nth=0'); await p.click('.team >> nth=0'); await p.click('.team >> nth=1');
    await p.waitForFunction(h => location.hash !== h, before);
    await p.waitForTimeout(500);
    const nums = await p.$$eval('.team .big', n => n.map(x => x.textContent));
    assert.deepEqual(nums, ['2', '1']);
    await p.reload(); await p.waitForSelector('.team');
    assert.deepEqual(await p.$$eval('.team .big', n => n.map(x => x.textContent)), ['2', '1']);
  });
});

test('queue: issue + call buttons; timer: start/pause', { skip }, async () => {
  await withPage(async (p) => {
    await p.goto(await link(HB.defaults('queue'))); await p.waitForSelector('.btns');
    await p.click('text=Issue ticket'); await p.click('text=Issue ticket'); await p.click('text=Call next');
    await p.waitForTimeout(300);
    assert.match(await p.innerText('#stage'), /001[\s\S]*1 waiting/i);
    await p.goto(await link(HB.defaults('timer'))); await p.waitForSelector('.btns');
    assert.match(await p.innerText('#stage'), /25:00/);
    await p.click('text=Start'); await p.waitForTimeout(1300);
    assert.match(await p.innerText('#stage'), /24:5\d/);
    await p.click('text=Pause'); await p.waitForTimeout(100);
    const frozen = await p.innerText('.big'); await p.waitForTimeout(1200);
    assert.equal(await p.innerText('.big'), frozen);
    assert.match(await p.innerText('#stage'), /paused/i);
  });
});

test('hostile or damaged links never execute markup and fall back to the picker', { skip }, async () => {
  await withPage(async (p) => {
    const evil = { t: 'sign', th: 'night', ti: '', x: '<img src=x onerror="window.__pwn=1"><script>window.__pwn=2</script>' };
    await p.goto(await link(evil)); await p.waitForTimeout(500);
    assert.equal(await p.evaluate(() => window.__pwn), undefined);
    assert.match(await p.innerText('#stage'), /<img src=x/);
    await p.goto(page_url + '#zTRUNCATED'); await p.waitForSelector('.home');
    assert.match(await p.innerText('.err'), /damaged|unknown|Link/i);
    await p.goto(page_url); await p.waitForSelector('.cards');
    assert.equal((await p.$$('.card')).length, 6);
  });
});

test('editor: picking a card builds a board, QR renders, link meter shown', { skip }, async () => {
  await withPage(async (p) => {
    await p.goto(page_url); await p.click('text=Countdown');
    await p.waitForSelector('#panel.open');
    await p.fill('.sheet input[type=text] >> nth=1', 'Wedding');
    await p.click('text=Show QR'); await p.waitForSelector('#qr canvas');
    assert.match(await p.innerText('#meterwrap'), /characters/);
    await p.click('text=Done');
    assert.match(await p.innerText('#stage'), /wedding/i);
    assert.match(await p.evaluate(() => location.hash), /^#[zj]/);
  });
});
