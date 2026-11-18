'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const C = require('../candado.js');
const FX = n => path.join(__dirname, '..', 'fixtures', n);
const json = n => JSON.parse(fs.readFileSync(FX(n), 'utf8'));
const txt = n => fs.readFileSync(FX(n), 'utf8');
const ids = r => r.findings.map(f => f.id);
const NOW = '2026-11-18T12:00:00Z';
const run = (domain, zone, extra) => C.analyze(domain, Object.assign({ resolver: C.fixtureResolver(json(zone)), now: NOW }, extra || {}));
const CLI = path.join(__dirname, '..', 'candado.js');

test('normalizeDomain accepts URLs, emails and wildcards, rejects junk', () => {
  assert.strictEqual(C.normalizeDomain('https://Shop.Example.com/path?x=1'), 'shop.example.com');
  assert.strictEqual(C.normalizeDomain('ventas@example.com'), 'example.com');
  assert.strictEqual(C.normalizeDomain('*.example.com'), 'example.com');
  assert.strictEqual(C.normalizeDomain('example.com.'), 'example.com');
  assert.strictEqual(C.normalizeDomain('not a domain'), null);
  assert.strictEqual(C.normalizeDomain('localhost'), null);
});

test('parseCaa reads DoH CAA data, flags, params and extra quotes', () => {
  const a = C.parseCaa('0 issue "letsencrypt.org; validationmethods=dns-01; accounturi=https://acme-v02.api.letsencrypt.org/acme/acct/1"');
  assert.strictEqual(a.tag, 'issue');
  assert.strictEqual(a.issuer, 'letsencrypt.org');
  assert.strictEqual(a.params.validationmethods, 'dns-01');
  assert.strictEqual(a.extraQuotes, false);
  const b = C.parseCaa('0 issue "\\"letsencrypt.org\\""');
  assert.strictEqual(b.extraQuotes, true);
  assert.strictEqual(b.issuer, 'letsencrypt.org');
  const c = C.parseCaa('128 tbs "x"');
  assert.strictEqual(c.critical, true);
  assert.strictEqual(C.parseCaa('0 issuewild ";"').issuer, '');
});

test('allowedIssuers: issuewild overrides issue for wildcards, ";" and broken quotes allow nobody', () => {
  const recs = ['0 issue "letsencrypt.org"', '0 issuewild ";"', '0 iodef "mailto:a@b.c"'].map(C.parseCaa);
  assert.deepStrictEqual(C.allowedIssuers(recs, false), ['letsencrypt.org']);
  assert.deepStrictEqual(C.allowedIssuers(recs, true), []);
  assert.strictEqual(C.allowedIssuers([C.parseCaa('0 iodef "mailto:a@b.c"')], false), null);
  assert.deepStrictEqual(C.allowedIssuers([C.parseCaa('0 issue "\\"pki.goog\\""')], false), []);
});

test('CA mapping comes from the CCADB identifiers and catches typos', () => {
  assert.strictEqual(C.caForIssuer("C=US, O=Let's Encrypt, CN=R12").ids[0], 'letsencrypt.org');
  assert.strictEqual(C.caForIssuer('C=US, O=Google Trust Services, CN=WE1').ids[0], 'pki.goog');
  assert.strictEqual(C.caForIssuer('C=US, O=SSL Corporation, CN=Cloudflare TLS Issuing ECC CA 3').ids[0], 'ssl.com');
  assert.strictEqual(C.caForIssuer('C=AT, O=ZeroSSL, CN=ZeroSSL RSA Domain Secure Site CA').ids[0], 'sectigo.com');
  assert.strictEqual(C.caForIssuer('C=XX, O=Unknown CA'), null);
  assert.strictEqual(C.suggestId('actalis.com'), 'actalis.it');
  assert.strictEqual(C.suggestId('letsencrypt.com'), 'letsencrypt.org');
  assert.ok(C.KNOWN_IDS.has('pki.goog') && C.KNOWN_IDS.has('certainly.com'));
});

test('lifetime schedule follows CA/B Forum BR 2.3.1 (200 / 100 / 47 days)', () => {
  assert.strictEqual(C.lifetimeLimitOn(new Date('2026-03-14T00:00:00Z')), 398);
  assert.strictEqual(C.lifetimeLimitOn(new Date('2026-11-18T00:00:00Z')), 200);
  assert.strictEqual(C.lifetimeLimitOn(new Date('2027-03-15T00:00:00Z')), 100);
  assert.strictEqual(C.lifetimeLimitOn(new Date('2029-03-15T00:00:00Z')), 47);
  assert.deepStrictEqual(C.nextLifetimeStep(new Date(NOW)), { from: '2027-03-15', days: 100 });
});

test('good domain: A+, only the Let\'s Encrypt info note, precert duplicates collapsed', async () => {
  const r = await run('example.org', 'good-zone.json', { ctEntries: json('good-ct.json'), securityTxt: txt('good-security.txt') });
  assert.deepStrictEqual(ids(r), ['cert-le-no-email']);
  assert.strictEqual(r.grade, 'A+');
  assert.strictEqual(r.dnssec.state, 'signed');
  assert.strictEqual(r.certificate.certs, 2); // 3 CT rows: one precert/leaf pair + an older cert
  assert.strictEqual(r.certificate.daysLeft, 69);
  assert.strictEqual(r.securityTxt.expires, '2027-09-30T00:00:00.000Z');
});

test('bad CAA: extra quotes, typo issuer, critical unknown tag, and it blocks the current CA (normal and wildcard)', async () => {
  const r = await run('shop.example.com', 'bad-zone.json', { ctEntries: json('bad-ct.json'), securityTxt: txt('bad-security.txt') });
  const i = ids(r);
  for (const id of ['caa-extra-quotes', 'caa-unknown-issuer', 'caa-critical-unknown', 'caa-blocks-current-ca']) assert.ok(i.includes(id), id);
  assert.strictEqual(r.caa.foundAt, 'example.com', 'CAA is inherited from the parent (RFC 8659 tree climbing)');
  const blocks = r.findings.filter(f => f.id === 'caa-blocks-current-ca');
  assert.strictEqual(blocks.length, 2);
  assert.match(blocks[0].fix.en, /0 issue "pki\.goog"/);
  assert.match(blocks[1].fix.en, /0 issuewild "pki\.goog"/);
  assert.match(r.findings.find(f => f.id === 'caa-unknown-issuer').fix.en, /actalis\.it/);
  assert.strictEqual(r.grade, 'F');
});

test('certificates: renewal late, long manual lifetime, suggested CAA from CT issuers', async () => {
  const r = await run('shop.example.com', 'bad-zone.json', { ctEntries: json('bad-ct.json'), securityTxt: '' });
  const i = ids(r);
  assert.ok(i.includes('cert-renewal-late'), 'newest cert: 74 of 90 days used, 15 left, no renewal yet');
  assert.ok(i.includes('cert-long-lifetime'), 'a 396-day Sectigo cert means manual renewal');
  assert.deepStrictEqual(r.suggestedCaa.lines.slice(0, 2), ['shop.example.com. CAA 0 issue "pki.goog"', 'shop.example.com. CAA 0 issue "sectigo.com"']);
  const late = await run('example.org', 'good-zone.json', { ctEntries: json('good-ct.json'), now: '2027-01-10T00:00:00Z', securityTxt: txt('good-security.txt') });
  assert.ok(ids(late).includes('cert-renewal-late'), '73 of 90 days elapsed without renewal');
  const soon = await run('example.org', 'good-zone.json', { ctEntries: json('good-ct.json'), now: '2027-01-15T00:00:00Z', securityTxt: txt('good-security.txt') });
  assert.ok(ids(soon).includes('cert-expiring-soon'), '12 days left');
  const dying = await run('example.org', 'good-zone.json', { ctEntries: json('good-ct.json'), now: '2027-01-24T00:00:00Z', securityTxt: txt('good-security.txt') });
  assert.ok(ids(dying).includes('cert-expiring'));
  const none = await run('example.org', 'good-zone.json', { ctEntries: [], securityTxt: txt('good-security.txt') });
  assert.ok(ids(none).includes('cert-none'));
});

test('DNSSEC: broken (DS left behind), DS missing, off, and NXDOMAIN', async () => {
  const b = await run('broken.example.net', 'bad-zone.json', { ct: false });
  assert.strictEqual(b.dnssec.state, 'bogus');
  assert.ok(ids(b).includes('dnssec-bogus'));
  assert.ok(ids(b).includes('caa-lookup-fail'), 'CAs must refuse when the CAA lookup fails');
  assert.match(b.findings.find(f => f.id === 'dnssec-bogus').msg.en, /EDE\(9\)/);
  const u = await run('unlinked.example.net', 'bad-zone.json', { ct: false });
  assert.strictEqual(u.dnssec.state, 'unlinked');
  const off = await run('shop.example.com', 'bad-zone.json', { ct: false });
  assert.ok(ids(off).includes('dnssec-off'));
  const gone = await run('gone.example.net', 'bad-zone.json', { ct: false });
  assert.deepStrictEqual(ids(gone), ['dns-nxdomain']);
});

test('security.txt (RFC 9116): bad file, missing file, HTML 404 page, PGP-signed file', async () => {
  const bad = await run('shop.example.com', 'bad-zone.json', { ct: false, securityTxt: txt('bad-security.txt') });
  for (const id of ['sectxt-expired', 'sectxt-contact-uri', 'sectxt-expires-dup', 'sectxt-syntax', 'sectxt-canonical']) assert.ok(ids(bad).includes(id), id);
  const missing = await run('shop.example.com', 'bad-zone.json', { ct: false, securityTxt: '' });
  assert.ok(ids(missing).includes('sectxt-missing'));
  const html = await run('shop.example.com', 'bad-zone.json', { ct: false, securityTxt: '<!doctype html><title>Not found</title>' });
  assert.ok(ids(html).includes('sectxt-html'));
  assert.ok(!ids(html).includes('sectxt-missing'));
  const signed = '-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\nContact: mailto:security@example.org\nExpires: 2027-06-01T00:00:00.000Z\n-----BEGIN PGP SIGNATURE-----\nabc\n-----END PGP SIGNATURE-----\n';
  const s = await run('example.org', 'good-zone.json', { ct: false, securityTxt: signed });
  assert.strictEqual(s.securityTxt.signed, true);
  assert.deepStrictEqual(s.securityTxt.contact, ['mailto:security@example.org']);
  assert.ok(!ids(s).some(x => x.startsWith('sectxt')));
  const noContact = await run('example.org', 'good-zone.json', { ct: false, securityTxt: 'Expires: 2027-06-01T00:00:00.000Z\n' });
  assert.ok(ids(noContact).includes('sectxt-no-contact'));
});

test('BIMI mark certificates (VMC) in CT are ignored; quoted O= values still map to a CA', async () => {
  const vmc = { issuer_ca_id: 1, issuer_name: 'C=US, O="DigiCert, Inc.", CN=DigiCert Verified Mark RSA4096 SHA256 2021 CA1', name_value: 'example.org', id: 9, not_before: '2026-06-11T00:00:00', not_after: '2027-06-13T23:59:59', serial_number: 'vm1' };
  const certs = C.summarizeCt(json('good-ct.json').concat([vmc]), 'example.org', new Date(NOW));
  assert.ok(certs.every(c => c.id !== 9));
  assert.strictEqual(C.caForIssuer('C=US, O="DigiCert, Inc.", CN=DigiCert Global G2 TLS RSA SHA256 2020 CA1').ids[0], 'digicert.com');
});

test('crt.sh being down degrades to an info note, never a crash', async () => {
  const r = await run('example.org', 'good-zone.json', { ct: async () => { throw new Error('crt.sh HTTP 502'); }, securityTxt: txt('good-security.txt') });
  assert.deepStrictEqual(ids(r), ['ct-unavailable']);
  assert.strictEqual(r.ctAvailable, false);
});

test('dohResolver parses AD, CAA answers and EDE, falls back to the second endpoint', async () => {
  let calls = 0;
  const fake = async (url) => {
    calls++;
    if (url.startsWith('https://first')) throw new Error('blocked');
    assert.match(url, /cd=true/);
    return { ok: true, json: async () => ({ Status: 0, AD: true, Answer: [{ type: 257, data: '0 issue "pki.goog"' }, { type: 5, data: 'x.' }], Comment: ['EDE(0): test'] }) };
  };
  const resolve = C.dohResolver({ fetch: fake, endpoints: [(n, t) => 'https://first/' + n, (n, t, cd) => `https://second/?name=${n}&type=${t}${cd ? '&cd=true' : ''}`] });
  const r = await resolve('example.org', 'CAA', { cd: true });
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(r.answers, ['0 issue "pki.goog"']);
  assert.strictEqual(r.ad, true);
  assert.match(r.ede, /EDE\(0\)/);
});

test('icsReminder writes a valid all-day event 10 days before expiry', () => {
  const ics = C.icsReminder('example.org', '2027-01-27T08:00:00.000Z', new Date(NOW));
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270117/);
  assert.match(ics, /SUMMARY:Check certificate of example\.org/);
});

test('CLI: text output, Spanish, JSON and exit codes', () => {
  const base = ['--zone', FX('bad-zone.json'), '--ct', FX('bad-ct.json'), '--security-txt', FX('bad-security.txt'), '--now', NOW];
  const bad = spawnSync(process.execPath, [CLI, 'shop.example.com', ...base, '--lang', 'es'], { encoding: 'utf8' });
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /La próxima renovación será rechazada/);
  const js = spawnSync(process.execPath, [CLI, 'shop.example.com', ...base, '--json', '--fail-on', 'never'], { encoding: 'utf8' });
  assert.strictEqual(js.status, 0);
  assert.strictEqual(JSON.parse(js.stdout).domain, 'shop.example.com');
  const good = spawnSync(process.execPath, [CLI, 'example.org', '--zone', FX('good-zone.json'), '--ct', FX('good-ct.json'), '--security-txt', FX('good-security.txt'), '--now', NOW], { encoding: 'utf8' });
  assert.strictEqual(good.status, 0);
  assert.match(good.stdout, /grade A\+/);
  const usage = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.strictEqual(usage.status, 2);
});
