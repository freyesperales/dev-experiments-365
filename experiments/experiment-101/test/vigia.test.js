'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const V = require('../vigia.js');
const KEV = require('../kev-snapshot.js');

const fx = (f) => fs.readFileSync(path.join(__dirname, '..', 'fixtures', f), 'utf8');
const API = JSON.parse(fx('api-2026-11-17.json'));
const NOW = '2026-11-17';

// Offline fetch backed by the API responses recorded on 2026-11-17. Logs every URL.
function offlineFetch(store, log) {
  return (url) => {
    if (log) log.push(url);
    const hit = store[url];
    if (!hit) return Promise.resolve({ status: 599, text: () => Promise.resolve('') });
    return Promise.resolve({ status: hit.status, text: () => Promise.resolve(JSON.stringify(hit.body)) });
  };
}
const run = (text, extra = {}) => V.check(text, Object.assign({ fetch: offlineFetch(API, extra.log), now: NOW, kev: KEV.ids, kevVersion: KEV.version }, extra));
const byName = (report, slug) => report.results.find((r) => r.slug === slug);
const codes = (r) => r.findings.map((f) => f.severity + ':' + f.code);

test('compareVersions handles WordPress-style versions', () => {
  assert.equal(V.compareVersions('5.3.1', '5.3.2'), -1);
  assert.equal(V.compareVersions('6.4', '6.4.0'), 0);
  assert.equal(V.compareVersions('10.0', '9.9.9'), 1);
  assert.equal(V.compareVersions('2.6.3.1', '2.6.3.2'), -1);
  assert.equal(V.compareVersions('7.1-beta1', '7.1'), -1);
  assert.equal(V.compareVersions('7.1-RC2', '7.1-rc1'), 1);
  assert.equal(V.compareVersions('v1.2', '1.2'), 0);
});

test('affects/fixedIn follow WPVulnerability operators', () => {
  const lt = { min_operator: null, min_version: null, max_operator: 'lt', max_version: '6.9', unfixed: '0' };
  assert.equal(V.affects(lt, '6.0'), true);
  assert.equal(V.affects(lt, '6.9'), false);
  assert.equal(V.fixedIn(lt), '6.9');
  const range = { min_operator: 'ge', min_version: '7.2.2', max_operator: 'le', max_version: '8.0.4', unfixed: '0' };
  assert.equal(V.affects(range, '7.2.1'), false);
  assert.equal(V.affects(range, '8.0.4'), true);
  assert.equal(V.fixedIn(range), null, 'a "le" range does not name the fixed release');
  assert.equal(V.fixedIn({ max_operator: 'lt', max_version: '2', unfixed: '1' }), null);
});

test('Site Health "Copy site info" is parsed, including plugin names that contain ": "', () => {
  const p = V.parseInput(fx('site-health.txt'));
  assert.equal(p.format, 'site-health');
  assert.equal(p.core, '6.4.1');
  const akismet = p.items.find((i) => /Akismet/.test(i.name));
  assert.equal(akismet.name, 'Akismet Anti-spam: Spam Protection');
  assert.equal(akismet.version, '5.7.2');
  const cf7 = p.items.find((i) => i.name === 'Contact Form 7');
  assert.equal(cf7.reportedLatest, '6.1.4');
  const theme = p.items.find((i) => i.type === 'theme' && i.status === 'active');
  assert.deepEqual([theme.slug, theme.version], ['twentyfifteen', '1.1']);
  assert.ok(p.items.find((i) => i.type === 'theme' && i.name === 'Twenty Twenty-Four' && i.status === 'inactive'));
  assert.equal(p.items.find((i) => i.name === 'Display Widgets').status, 'inactive');
  assert.ok(!p.items.some((i) => /advanced-cache/.test(i.name)), 'drop-ins are ignored');
  assert.ok(!p.items.some((i) => /php_version|server/.test(i.name)), 'other sections are ignored');
});

test('wp plugin list table, themes: marker, CSV, JSON and plain lines', () => {
  const t = V.parseInput(fx('wp-plugin-list.txt'));
  assert.equal(t.format, 'wp-cli');
  assert.deepEqual(t.items.filter((i) => i.type === 'plugin').map((i) => i.slug), ['akismet', 'contact-form-7', 'wp-file-manager', 'display-widgets', 'acme-booking-pro']);
  assert.deepEqual(t.items.filter((i) => i.type === 'theme').map((i) => i.slug), ['twentyfifteen']);

  const csv = V.parseInput('name,status,update,version\nakismet,active,none,5.7.2\n"wp-file-manager",inactive,available,6.0\n');
  assert.deepEqual(csv.items.map((i) => [i.slug, i.version, i.status]), [['akismet', '5.7.2', 'active'], ['wp-file-manager', '6.0', 'inactive']]);

  const json = V.parseInput('[{"name":"akismet","status":"active","update":"none","version":"5.7.2"}]');
  assert.deepEqual(json.items.map((i) => i.slug), ['akismet']);

  const plain = V.parseInput('# my site\nWordPress 7.1.4\ncontact-form-7 5.9.3\nwoocommerce@9.1.0\ntheme astra 4.6.1\nelementor\n');
  assert.equal(plain.core, '7.1.4');
  assert.deepEqual(plain.items.map((i) => [i.type, i.slug, i.version]), [
    ['plugin', 'contact-form-7', '5.9.3'], ['plugin', 'woocommerce', '9.1.0'], ['theme', 'astra', '4.6.1'], ['plugin', 'elementor', null]
  ]);
  assert.equal(V.parseInput('6.8.2\n').core, '6.8.2', 'bare `wp core version` output');
});

test('full check of a risky site (recorded real API data)', async () => {
  const r = await run(fx('site-health.txt'));
  assert.equal(r.grade, 'F');
  const core = r.results.find((x) => x.type === 'core');
  assert.deepEqual(codes(core), ['critical:kev', 'high:core-insecure']);
  assert.ok(core.findings[0].cves.includes('CVE-2026-119977'));
  assert.match(core.findings[1].fix, /6\.4\.14/, 'suggests the patched release of the same branch');

  const fm = byName(r, 'wp-file-manager');
  assert.equal(fm.findings[0].code, 'kev');
  assert.ok(fm.findings[0].cves.includes('CVE-2020-25213'));
  assert.equal(fm.slugSource, 'guessed', 'Site Health name "WP File Manager" mapped to its slug');

  const dw = byName(r, 'display-widgets');
  assert.ok(codes(dw).includes('high:closed'));
  assert.match(dw.findings.find((f) => f.code === 'vuln').fix, /Replace/, 'closed plugins are replaced, not updated');

  const cf7 = byName(r, 'contact-form-7');
  assert.equal(cf7.findings[0].severity, 'critical');
  assert.equal(cf7.findings[0].code, 'vuln');

  assert.deepEqual(byName(r, 'akismet').findings.filter((f) => f.severity !== 'info'), []);
  assert.equal(r.results[0].worst, 'critical', 'results are sorted by severity');
});

test('a clean, current site gets a good grade', async () => {
  const r = await run(fx('clean.txt'));
  assert.equal(r.counts.critical + r.counts.high + r.counts.medium, 0);
  assert.ok(['A+', 'A'].includes(r.grade));
  assert.equal(r.results.find((x) => x.type === 'core').status, 'latest');
});

test('only slugs and the core version leave the computer, never plugin versions', async () => {
  const log = [];
  await run(fx('wp-plugin-list.txt'), { log });
  assert.ok(log.length > 0);
  for (const u of log) {
    assert.ok(/^https:\/\/(api\.wordpress\.org|www\.wpvulnerability\.net)\//.test(u), u);
    assert.ok(!/5\.3\.1|2\.6\.2|2\.3\.0/.test(u), 'installed plugin version leaked in ' + u);
  }
});

test('abandoned plugins are flagged from last_updated (our 2-year criterion)', () => {
  const info = { status: 200, body: { name: 'Old', version: '1.0', last_updated: '2021-03-01 10:00am GMT' } };
  const vuln = { status: 200, body: { error: 0, data: { vulnerability: [], closed: 0 } } };
  const res = V.assessItem({ type: 'plugin', slug: 'old', name: 'old', version: '1.0', slugSource: 'exact' }, info, vuln, { lang: 'en', now: Date.parse(NOW), kev: {} });
  assert.deepEqual(codes(res), ['medium:abandoned']);
});

test('network failures are reported, never shown as "ok"', async () => {
  const failing = () => Promise.resolve({ status: 503, text: () => Promise.resolve('busy') });
  const r = await V.check('akismet 5.7.2', { fetch: failing, now: NOW, kev: [] });
  assert.ok(codes(r.results[0]).includes('medium:lookup-failed'));
});

test('Spanish output and empty input', async () => {
  const r = await run(fx('wp-plugin-list.txt'), { lang: 'es' });
  const txt = V.formatText(r);
  assert.match(txt, /EXPLOTADA ACTIVAMENTE/);
  assert.match(txt, /Cerrado en wordpress\.org/);
  const empty = await run('hola, esto no es una lista');
  assert.ok(empty.error);
});

test('KEV snapshot is a plausible CISA catalog', () => {
  assert.match(KEV.version, /^\d{4}\.\d{2}\.\d{2}$/);
  assert.ok(KEV.ids.length > 1000);
  assert.ok(KEV.ids.every((id) => /^CVE-\d{4}-\d{4,}$/.test(id)));
  assert.ok(KEV.ids.includes('CVE-2020-25213'));
});
