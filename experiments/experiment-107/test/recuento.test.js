'use strict';
// All data here is invented: example.com / example.net and the documentation
// address ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 2001:db8::/32).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const R = require('../recuento.js');

const FIX = path.join(__dirname, '..', 'fixtures');
const CLI = path.join(__dirname, '..', 'recuento.js');
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const u8 = (b) => new Uint8Array(b);
const enc = (s) => new TextEncoder().encode(s);

// --- helpers to build archives the way real receivers do ---------------------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files, { store = false, encrypted = false } = {}) {
  const locals = [], centrals = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), data = Buffer.from(f.data), comp = store ? data : zlib.deflateRawSync(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(encrypted ? 1 : 0, 6); lh.writeUInt16LE(store ? 0 : 8, 8);
    lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(encrypted ? 1 : 0, 8); ch.writeUInt16LE(store ? 0 : 8, 10);
    ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp); centrals.push(ch, name); offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return u8(Buffer.concat([...locals, cd, eocd]));
}
const D = 'example.com';
const base = { org: 'receiver.example', orgDomain: 'receiver.example', id: 'r1', begin: 1795305600, end: 1795391999, domain: D };
const xml = (rows, extra) => R._xmlReport(Object.assign({}, base, { rows }, extra || {}));
const row = (o) => Object.assign({ ip: '192.0.2.10', count: 10, dkimAligned: false, spfAligned: false, dkim: [], spf: [D, 'fail'] }, o);
const one = (rows, extra, opts) => R.read([{ name: 'r.xml', data: xml(rows, extra) }], opts).domains[0];
const kinds = (d) => d.groups.map((g) => g.kind);

// --- inflate ------------------------------------------------------------------
test('inflate: matches zlib on text, random bytes, long runs and stored blocks', () => {
  const rnd = Buffer.alloc(70000); let x = 12345;
  for (let i = 0; i < rnd.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; rnd[i] = x >> 16; }
  const inputs = [Buffer.from(''), Buffer.from('a'), Buffer.from(xml([row({})]).repeat(40)), rnd, Buffer.alloc(300000, 65), Buffer.from('abcabcabcabc'.repeat(5000))];
  for (const input of inputs) for (const level of [0, 1, 6, 9]) {
    const out = R._inflateRaw(u8(zlib.deflateRawSync(input, { level })), 0);
    assert.ok(Buffer.from(out.out).equals(input), `level ${level}, ${input.length} bytes`);
  }
  const fixed = zlib.deflateRawSync(Buffer.from('hello hello hello'), { strategy: zlib.constants.Z_FIXED });
  assert.strictEqual(Buffer.from(R._inflateRaw(u8(fixed), 0).out).toString(), 'hello hello hello');
});

test('inflate: stops at the end of the stream and reports where', () => {
  const comp = zlib.deflateRawSync(Buffer.from('report'));
  const r = R._inflateRaw(u8(Buffer.concat([comp, Buffer.from('JUNK')])), 0);
  assert.strictEqual(Buffer.from(r.out).toString(), 'report');
  assert.strictEqual(r.end, comp.length);
});

test('inflate: output limit stops a zip bomb; damaged data is an error, not a hang', () => {
  const bomb = u8(zlib.deflateRawSync(Buffer.alloc(5 * 1024 * 1024)));
  assert.throws(() => R._inflateRaw(bomb, 0, 1024 * 1024), (e) => e.code === 'too-big');
  const good = zlib.deflateRawSync(Buffer.from(xml([row({})])));
  assert.throws(() => R._inflateRaw(u8(good.subarray(0, good.length - 20)), 0), (e) => /^deflate-/.test(e.code));
  assert.throws(() => R._inflateRaw(u8([0x07, 0xff, 0xff]), 0), (e) => /^deflate-/.test(e.code));
});

// --- containers ---------------------------------------------------------------
test('gzip: plain, with a stored file name, with a trailing CRLF, twice, and concatenated members', () => {
  const x = xml([row({ dkimAligned: true, dkim: [[D, 's1', 'pass']] })]);
  const plain = R.read([{ name: 'a.xml.gz', data: u8(zlib.gzipSync(x)) }]);
  assert.strictEqual(plain.files.read, 1);
  const trailing = R.read([{ name: 'a.xml.gz', data: u8(Buffer.concat([zlib.gzipSync(x), Buffer.from('\r\n')])) }]);
  assert.strictEqual(trailing.files.read, 1);
  assert.deepStrictEqual(trailing.files.notes.map((n) => n.note), ['gzip-trailing']);
  const twice = R.read([{ name: 'a.xml.gz', data: u8(zlib.gzipSync(zlib.gzipSync(x))) }]);
  assert.strictEqual(twice.files.read, 1);
  assert.deepStrictEqual(twice.files.notes.map((n) => n.note), ['gzip-twice']);
  const g = R._gunzip(u8(Buffer.concat([zlib.gzipSync('<a>'), zlib.gzipSync('</a>')])));
  assert.strictEqual(Buffer.from(g.out).toString(), '<a></a>');
  assert.strictEqual(g.members, 2);
});

test('zip: several reports, stored and deflated; a zip named .gz is read by its bytes, not its name', () => {
  const a = xml([row({ dkimAligned: true, dkim: [[D, 's1', 'pass']] })], { id: 'a' }), b = xml([row({})], { id: 'b' });
  for (const store of [false, true]) {
    const r = R.read([{ name: 'reports.zip', data: zip([{ name: 'a.xml', data: a }, { name: 'sub/b.xml', data: b }, { name: 'sub/', data: '' }], { store }) }]);
    assert.strictEqual(r.files.read, 2);
    assert.strictEqual(r.domains[0].totals.messages, 20);
  }
  const misnamed = R.read([{ name: 'report.xml.gz', data: zip([{ name: 'a.xml', data: a }]) }]);
  assert.strictEqual(misnamed.files.read, 1);
  assert.deepStrictEqual(misnamed.files.notes.map((n) => n.note), ['zip-named-gz']);
  const gzInZip = R.read([{ name: 'r.zip', data: zip([{ name: 'a.xml.gz', data: zlib.gzipSync(a) }]) }]);
  assert.strictEqual(gzInZip.files.read, 1);
});

test('zip: encrypted entries and damaged archives are skipped with a reason', () => {
  const locked = R.read([{ name: 'r.zip', data: zip([{ name: 'a.xml', data: 'x' }], { encrypted: true }) }]);
  assert.strictEqual(locked.files.skipped[0].reason, 'zip-encrypted');
  const good = zip([{ name: 'a.xml', data: xml([row({})]) }]);
  const cut = R.read([{ name: 'r.zip', data: good.subarray(0, good.length - 30) }]);
  assert.strictEqual(cut.files.skipped[0].reason, 'zip-no-directory');
  assert.strictEqual(cut.domains.length, 0);
});

test('email: report attached as base64, single part and multipart, with a wrong media type', () => {
  const x = xml([row({ dkimAligned: true, dkim: [[D, 's1', 'pass']] })]);
  const b64 = zlib.gzipSync(x).toString('base64').replace(/(.{76})/g, '$1\r\n');
  const single = ['Received: from mail.receiver.example', 'From: noreply-dmarc@receiver.example', 'To: dmarc@example.com', 'Subject: Report Domain: example.com Submitter: receiver.example Report-ID: r1',
    'MIME-Version: 1.0', 'Content-Type: application/zip;', '\tname="receiver.example!example.com!1795305600!1795391999.xml.gz"', 'Content-Transfer-Encoding: base64', '', b64, ''].join('\r\n');
  assert.strictEqual(R.read([{ name: 'report.eml', data: single }]).files.read, 1);
  const multi = ['From: noreply-dmarc@receiver.example', 'To: dmarc@example.com', 'Subject: Report Domain: example.com', 'Date: Mon, 23 Nov 2026 10:00:00 +0000', 'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="=_b1"', '', '--=_b1', 'Content-Type: text/plain', '', 'This is an aggregate report.', '--=_b1', 'Content-Type: application/gzip',
    'Content-Disposition: attachment; filename="r.xml.gz"', 'Content-Transfer-Encoding: base64', '', b64, '--=_b1--', ''].join('\r\n');
  const r = R.read([{ name: 'report.eml', data: multi }]);
  assert.strictEqual(r.files.read, 1);
  assert.strictEqual(r.domains[0].totals.pass, 10);
  const none = R.read([{ name: 'hello.eml', data: 'From: a@example.com\r\nTo: b@example.com\r\nSubject: hi\r\nDate: today\r\n\r\nhello' }]);
  assert.strictEqual(none.files.skipped[0].reason, 'email-no-attachment');
});

test('things that are not DMARC reports are named, not guessed', () => {
  const r = R.read([
    { name: 'unused.xml.gz', data: u8(zlib.gzipSync('unused')) },
    { name: 'tls.json', data: '{"organization-name":"Receiver","date-range":{},"policies":[]}' },
    { name: 'page.html', data: '<html><body>hi</body></html>' },
    { name: 'notes.txt', data: 'just text' },
    { name: 'empty.xml', data: '' },
    { name: 'cut.xml', data: xml([row({})]).slice(0, 300) + '<row' }
  ]);
  const why = Object.fromEntries(r.files.skipped.map((s) => [s.name.replace(/\.gz$/, ''), s.reason]));
  assert.deepStrictEqual(why, { 'unused.xml': 'placeholder', 'tls.json': 'tls-report', 'page.html': 'not-dmarc', 'notes.txt': 'not-xml', 'empty.xml': 'empty', 'cut.xml': 'xml-unclosed' });
  assert.strictEqual(r.domains.length, 0);
  for (const lang of ['en', 'es']) { const out = R.render(r, lang); assert.ok(!/undefined/.test(out)); assert.ok(out.includes(R.T[lang].nothing)); }
});

// --- XML ----------------------------------------------------------------------
test('xml: entities, CDATA, comments, prefixes, attributes with ">" and self-closing tags', () => {
  const t = R._parseXml('<?xml version="1.0"?><!-- c --><ns:a xmlns:ns="urn:x" note="1 > 0"><b>Tom &amp; Co &#233;&#x41;</b><c><![CDATA[<raw&>]]></c><d/></ns:a>');
  const a = t.children[0];
  assert.strictEqual(a.name, 'a'); assert.strictEqual(a.ns, 'urn:x');
  assert.deepStrictEqual(a.children.map((c) => [c.name, c.text]), [['b', 'Tom & Co éA'], ['c', '<raw&>'], ['d', '']]);
});

test('xml: entities declared in a DOCTYPE are never expanded (XML bomb stays inert)', () => {
  const bomb = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]>' +
    xml([row({})]).replace(/<\?xml[^>]*\?>/, '').replace('<org_name>receiver.example</org_name>', '<org_name>&lol2;&lol2;&lol2;</org_name>');
  const r = R.parseReport(bomb, 'bomb.xml');
  assert.strictEqual(r.org, '&lol2;&lol2;&lol2;');
  assert.ok(r.warnings.includes('doctype'));
  const deep = '<a>'.repeat(200) + '</a>'.repeat(200);
  assert.throws(() => R._parseXml(deep), (e) => e.code === 'xml-too-deep');
});

// --- formats --------------------------------------------------------------------
test('RFC 9990 Appendix B sample is read as the new format', () => {
  const r = R.parseReport(fs.readFileSync(path.join(FIX, 'rfc9990-appendix-b.xml'), 'utf8'));
  assert.strictEqual(r.format, 'rfc9990');
  assert.strictEqual(r.namespace, 'urn:ietf:params:xml:ns:dmarc-2.0');
  assert.deepStrictEqual([r.org, r.reportId, r.generator], ['Sample Reporter', '3v98abbp8ya9n3va8yr8oa3ya', 'Example DMARC Aggregate Reporter v1.2']);
  assert.deepStrictEqual([r.policy.p, r.policy.sp, r.policy.np, r.policy.testing, r.policy.discovery, r.policy.pct], ['quarantine', 'none', 'none', 'n', 'treewalk', null]);
  const rec = r.records[0];
  assert.deepStrictEqual([rec.ip, rec.count, rec.disposition, rec.dkimAligned, rec.spfAligned, rec.envelopeFrom], ['192.0.2.123', 123, 'pass', true, false, 'example.com']);
  assert.deepStrictEqual(rec.dkim, [{ domain: 'example.com', selector: 'abc123', result: 'pass' }]);
  const d = R.analyze([r]).domains[0];
  assert.strictEqual(d.totals.pass, 123);
  assert.ok(d.notes.some((n) => n.code === 'format-9990'));
  assert.ok(d.enforced);
});

test('old format without namespace (what large providers send) and the RFC 7489 namespace', () => {
  const r = R.parseReport(fs.readFileSync(path.join(FIX, 'old-format-no-namespace.xml'), 'utf8'));
  assert.strictEqual(r.format, 'rfc7489');
  assert.strictEqual(r.policy.pct, 100);
  assert.strictEqual(r.records[1].ip, '2001:db8::25');
  const ns = R.parseReport(xml([row({})]).replace('<feedback>', '<feedback xmlns="http://dmarc.org/dmarc-xml/0.1">'));
  assert.strictEqual(ns.format, 'rfc7489');
  const prefixed = R.parseReport('<d:feedback xmlns:d="urn:ietf:params:xml:ns:dmarc-2.0"><d:report_metadata><d:org_name>X</d:org_name><d:report_id>1</d:report_id><d:date_range><d:begin>10</d:begin><d:end>20</d:end></d:date_range></d:report_metadata><d:policy_published><d:domain>Example.COM.</d:domain><d:p>reject</d:p></d:policy_published></d:feedback>');
  assert.deepStrictEqual([prefixed.format, prefixed.policy.domain, prefixed.policy.p], ['rfc9990', 'example.com', 'reject']);
  assert.ok(prefixed.warnings.includes('no-records'));
});

test('report id is kept as text (ids longer than a number can hold)', () => {
  const id = '170364209938104215471703642099381042154';
  assert.strictEqual(R.parseReport(xml([row({})], { id })).reportId, id);
});

test('committed fixtures folder: gzip twice + CRLF and a normal .xml.gz are read; duplicates counted once', () => {
  const files = fs.readdirSync(FIX).map((f) => ({ name: f, data: u8(fs.readFileSync(path.join(FIX, f))) }));
  const r = R.read(files);
  assert.strictEqual(r.files.read, 4);
  assert.strictEqual(r.duplicates, 2);
  assert.strictEqual(r.domains[0].totals.messages, 166);
});

// --- classification -------------------------------------------------------------
test('aligned mail is OK; SPF-only mail gets the forwarding advice', () => {
  const d = one([row({ dkimAligned: true, spfAligned: true, dkim: [[D, 'google', 'pass']], spf: [D, 'pass'] }), row({ ip: '192.0.2.20', spfAligned: true, spf: ['bounce.' + D, 'pass'] })]);
  assert.deepStrictEqual(kinds(d), ['ok', 'ok']);
  assert.strictEqual(d.totals.fail, 0);
  const spfOnly = d.groups.find((g) => g.spfOnly);
  assert.strictEqual(spfOnly.spfDomain, 'bounce.' + D);
  assert.ok(d.notes.some((n) => n.code === 'spf-only'));
});

test('a known sending service authenticated as itself is a FIX, grouped by provider', () => {
  const d = one([row({ ip: '198.51.100.1', count: 30, dkim: [['sendgrid.net', 'smtpapi', 'pass']], spf: ['sendgrid.net', 'pass'] }), row({ ip: '198.51.100.2', count: 5, spf: ['u123.wl.sendgrid.net', 'pass'] }), row({ ip: '198.51.100.9', count: 7, dkim: [['mail.amazonses.com', 'x', 'pass']] })]);
  const sg = d.groups.find((g) => g.provider === 'sendgrid.net');
  assert.deepStrictEqual([sg.kind, sg.status, sg.count, sg.ipCount, sg.service], ['service', 'fix', 35, 2, 'SendGrid']);
  assert.strictEqual(d.groups.find((g) => g.provider === 'amazonses.com').service, 'Amazon SES');
  assert.strictEqual(d.verdict, 'fix-first');
});

test('Google Workspace and Microsoft 365 signing with their default domain get the exact fix', () => {
  const d = one([row({ dkim: [['example-com.20230601.gappssmtp.com', '20230601', 'pass']] }), row({ ip: '192.0.2.44', dkim: [['examplecom.onmicrosoft.com', 'selector1-examplecom-onmicrosoft-com', 'pass']] })]);
  assert.deepStrictEqual(kinds(d), ['default-key', 'default-key']);
  const text = R.render({ domains: [d], minDays: 30 }, 'en');
  assert.ok(/Google Admin/.test(text) && /Microsoft Defender portal/.test(text));
});

test('forwarding: receiver-declared reasons, and a mailbox provider passing while your signature broke', () => {
  const d = one([
    row({ ip: '203.0.113.1', count: 2, reason: ['local_policy', 'arc=pass'], dkim: [[D, 's1', 'fail']], spf: ['fw.example.net', 'pass'] }),
    row({ ip: '203.0.113.2', count: 1, reason: ['mailing_list', ''], spf: ['lists.example.net', 'pass'] }),
    row({ ip: '203.0.113.3', count: 4, dkim: [[D, 's1', 'fail']], spf: ['gmail.com', 'pass'] }),
    row({ ip: '192.0.2.10', count: 500, dkimAligned: true, dkim: [[D, 's1', 'pass']] })
  ]);
  const by = Object.fromEntries(d.groups.map((g) => [g.kind, g]));
  assert.strictEqual(by.forwarded.count, 3);
  assert.strictEqual(by.forwarder.count, 4);
  assert.strictEqual(by.forwarder.status, 'info');
  assert.strictEqual(d.verdict, 'more-data');
});

test('local_policy without an ARC pass is not treated as forwarding', () => {
  const d = one([row({ reason: ['local_policy', 'manual allow list'] })]);
  assert.deepStrictEqual(kinds(d), ['unknown']);
});

test('your own signature failing: a little is forwarding (info), a lot is a broken key (fix)', () => {
  const few = one([row({ count: 3, dkim: [[D, 's1', 'fail']], spf: ['', 'none'] }), row({ count: 997, dkimAligned: true, dkim: [[D, 's1', 'pass']] })]);
  assert.strictEqual(few.groups.find((g) => g.kind === 'signature-broken').status, 'info');
  const many = one([row({ count: 400, dkim: [[D, 's1', 'fail']], spf: ['', 'none'] }), row({ count: 600, dkimAligned: true, dkim: [[D, 's1', 'pass']] })]);
  assert.strictEqual(many.groups.find((g) => g.kind === 'signature-broken').status, 'fix');
  assert.strictEqual(many.verdict, 'fix-first');
});

test('strict alignment: passes as your subdomain and still fails DMARC', () => {
  const d = one([row({ dkim: [['mail.' + D, 's1', 'pass']], spf: ['bounce.' + D, 'pass'] })], { policy: { p: 'none' } });
  assert.deepStrictEqual([d.groups[0].kind, d.groups[0].status, d.groups[0].via], ['strict', 'fix', 'mail.' + D]);
});

test('an unknown third-party domain must be identified before tightening; tiny amounts do not block the verdict', () => {
  const big = one([row({ count: 50, spf: ['mailer.acme-crm.example', 'pass'] }), row({ count: 950, dkimAligned: true, dkim: [[D, 's1', 'pass']] })]);
  assert.deepStrictEqual([big.groups[0].kind, big.groups[0].status, big.groups[0].domain], ['other-domain', 'check', 'acme-crm.example']);
  assert.strictEqual(big.verdict, 'check-first');
  const tiny = one([row({ count: 2, spf: ['mailer.acme-crm.example', 'pass'] }), row({ count: 998, dkimAligned: true, dkim: [[D, 's1', 'pass']] })]);
  assert.strictEqual(tiny.groups.find((g) => g.kind === 'other-domain').status, 'info');
  assert.strictEqual(tiny.verdict, 'more-data');
});

test('mail with no proof is "unknown": it never blocks the verdict, it is what enforcement is for', () => {
  const d = one([row({ ip: '203.0.113.200', count: 80, dkim: [], spf: [D, 'softfail'] }), row({ ip: '203.0.113.201', count: 5, dkim: [['evil.example', 'x', 'fail']], spf: ['', 'none'] }), row({ count: 300, dkimAligned: true, dkim: [[D, 's1', 'pass']] })]);
  const u = d.groups.find((g) => g.kind === 'unknown');
  assert.deepStrictEqual([u.count, u.status, u.ipCount], [85, 'check', 2]);
  assert.strictEqual(d.verdict, 'more-data');
  assert.ok(d.notes.some((n) => n.code === 'fail-not-blocked' && n.n === 85));
});

test('organisation grouping and service lookup helpers', () => {
  assert.strictEqual(R._orgOf('a.b.example.com'), 'example.com');
  assert.strictEqual(R._orgOf('mail.tienda.com.mx'), 'tienda.com.mx');
  assert.strictEqual(R._orgOf('example.cl'), 'example.cl');
  assert.strictEqual(R._serviceOf('u1.wl.sendgrid.net').name, 'SendGrid');
  assert.strictEqual(R._serviceOf('notsendgrid.net.example'), null);
});

// --- verdicts ---------------------------------------------------------------------
test('verdicts on the built-in samples: fix-first, ready, blocking, more-data', () => {
  const S = R.samples();
  const v = (k, o) => R.read(S[k], o).domains[0];
  assert.strictEqual(v('shop').verdict, 'fix-first');
  const ready = v('ready');
  assert.deepStrictEqual([ready.verdict, ready.next, ready.period.days, ready.reporters.length], ['ready', 'quarantine', 31, 3]);
  const blocked = v('blocked');
  assert.strictEqual(blocked.verdict, 'blocking');
  assert.ok(blocked.totals.failRejected > 2000);
  assert.strictEqual(v('week').verdict, 'more-data');
  assert.strictEqual(v('week', { minDays: 7 }).verdict, 'ready');
  assert.ok(!ready.notes.some((n) => n.code === 'policy-changed'), 'old and new formats of the same policy are not a policy change');
});

test('next step follows the ladder: none -> quarantine -> reject -> protected; testing mode first', () => {
  const ok = [row({ count: 100, dkimAligned: true, dkim: [[D, 's1', 'pass']] })];
  const at = (policy, format) => one(ok, { policy, format }, { minDays: 1 });
  assert.deepStrictEqual([at({ p: 'none' }).verdict, at({ p: 'none' }).next], ['ready', 'quarantine']);
  assert.deepStrictEqual([at({ p: 'quarantine' }).verdict, at({ p: 'quarantine' }).next], ['ready', 'reject']);
  assert.strictEqual(at({ p: 'reject' }).verdict, 'protected');
  const t = at({ p: 'reject', testing: 'y' }, 'rfc9990');
  assert.deepStrictEqual([t.verdict, t.next, t.enforced, t.testing], ['ready', 'reject', false, true]);
  const pct0 = at({ p: 'quarantine', pct: 0 });
  assert.deepStrictEqual([pct0.enforced, pct0.testing], [false, true]);
  const pct50 = at({ p: 'quarantine', pct: 50 });
  assert.ok(pct50.notes.some((n) => n.code === 'pct' && n.n === 50));
});

test('duplicates are counted once; two policy domains are analysed separately; --domain filter', () => {
  const a = xml([row({ count: 7, dkimAligned: true, dkim: [[D, 's1', 'pass']] })]);
  const b = R._xmlReport(Object.assign({}, base, { domain: 'example.net', id: 'n1', rows: [row({ count: 3 })] }));
  const r = R.read([{ name: '1.xml', data: a }, { name: 'copy.xml', data: a }, { name: '2.xml', data: b }]);
  assert.strictEqual(r.duplicates, 1);
  assert.deepStrictEqual(r.domains.map((d) => [d.domain, d.totals.messages]), [['example.com', 7], ['example.net', 3]]);
  assert.deepStrictEqual(R.read([{ name: '1.xml', data: a }, { name: '2.xml', data: b }], { domain: 'Example.NET' }).domains.map((d) => d.domain), ['example.net']);
});

test('subdomains under the same policy and a single reporter are pointed out', () => {
  const d = one([row({ from: 'shop.' + D, dkimAligned: true, dkim: [['shop.' + D, 's1', 'pass']] })]);
  assert.ok(d.notes.some((n) => n.code === 'subdomains' && n.value === 'shop.' + D));
  assert.ok(d.notes.some((n) => n.code === 'one-reporter'));
});

// --- output -------------------------------------------------------------------------
test('every sample renders in English and Spanish without holes', () => {
  const S = R.samples();
  for (const k of Object.keys(S)) for (const lang of ['en', 'es']) {
    const out = R.render(R.read(S[k]), lang);
    assert.ok(!/undefined|NaN|\[object/.test(out), k + ' ' + lang);
    assert.ok(out.includes(R.T[lang].nextTitle));
  }
  assert.ok(R.render(R.read(S.ready), 'es').includes('3.698 pasaron DMARC (98,4 %)'));
});

test('every group kind has a title and an explanation in both languages', () => {
  const d = one([
    row({ dkimAligned: true, dkim: [[D, 's1', 'pass']] }), row({ spfAligned: true, spf: [D, 'pass'] }),
    row({ dkim: [['x.gappssmtp.com', 'a', 'pass']] }), row({ dkim: [['x.onmicrosoft.com', 'a', 'pass']] }), row({ spf: ['mcsv.net', 'pass'] }),
    row({ dkim: [['m.' + D, 'a', 'pass']] }), row({ count: 900, dkim: [[D, 'a', 'fail']], spf: ['', 'none'] }), row({ spf: ['other.example', 'pass'] }),
    row({ spf: ['outlook.com', 'pass'] }), row({ reason: ['forwarded', ''] }), row({ disposition: 'reject' })
  ], { policy: { p: 'reject' } });
  assert.strictEqual(new Set(kinds(d)).size, 9);
  for (const lang of ['en', 'es']) for (const g of d.groups) {
    assert.ok(R.T[lang].title(g, d).length > 5, g.kind);
    assert.ok(R.T[lang].explain(g, d).filter(Boolean).length >= 1, g.kind);
  }
  for (const lang of ['en', 'es']) for (const v of ['no-data', 'blocking', 'fix-first', 'check-first', 'more-data', 'ready', 'protected']) assert.ok(R.T[lang].verdict[v]);
});

test('the file makes no network call', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|require\(['"](https?|net|dns|tls|dgram)['"]\)|navigator\.sendBeacon/.test(src));
});

// --- CLI --------------------------------------------------------------------------------
test('CLI: exit codes, --json, --lang, folder input, bad usage', () => {
  assert.strictEqual(run(['--demo', 'shop']).status, 1);
  assert.strictEqual(run(['--demo', 'ready']).status, 0);
  const es = run(['--demo', 'blocked', '--lang', 'es']);
  assert.strictEqual(es.status, 1);
  assert.ok(es.stdout.includes('SE ESTÁ BLOQUEANDO CORREO QUE PARECE TUYO'));
  const json = JSON.parse(run(['--demo', 'ready', '--json']).stdout);
  assert.deepStrictEqual([json.version, json.domains[0].verdict, json.files.read], [R.VERSION, 'ready', 53]);
  const folder = run([FIX]);
  assert.strictEqual(folder.status, 1);
  assert.ok(folder.stdout.includes('Google Workspace is signing with its own domain'));
  assert.strictEqual(run([]).status, 2);
  assert.strictEqual(run(['--nope']).status, 2);
  assert.strictEqual(run(['does-not-exist.xml']).status, 2);
  assert.strictEqual(run(['--lang', 'fr', '--demo', 'shop']).status, 2);
  assert.strictEqual(run([path.join(__dirname, 'recuento.test.js')]).status, 2);
  assert.ok(run(['--help']).stdout.includes('Usage'));
});
