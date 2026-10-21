(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChatLedger = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TAIL = '(\\d{1,2})[\\/.\\-](\\d{1,2})[\\/.\\-](\\d{2,4}),?\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*([APap]\\.?[Mm]\\.?)?';
  var RE_ANDROID = new RegExp('^' + TAIL + '\\s+-\\s+([\\s\\S]*)$');
  var RE_IOS = new RegExp('^\\[' + TAIL + '\\]\\s+([\\s\\S]*)$');

  function clean(s) {
    return s.replace(/[‎‏‪-‮]/g, '').replace(/[  ]/g, ' ').replace(/\r$/, '');
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Split an export into messages. Date parts stay raw (a, b) until the order is known.
  function parseChat(text, opts) {
    opts = opts || {};
    var raw = [], cur = null, lines = String(text || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = clean(lines[i]);
      var m = RE_IOS.exec(line) || RE_ANDROID.exec(line);
      if (m) {
        var rest = m[8], sm = /^([^:]+?):\s([\s\S]*)$/.exec(rest);
        cur = { a: +m[1], b: +m[2], y: +m[3], h: +m[4], min: +m[5], ap: m[7] ? m[7][0].toLowerCase() : '',
                sender: sm ? sm[1].trim() : null, text: sm ? sm[2] : rest, system: !sm };
        if (cur.y < 100) cur.y += 2000;
        raw.push(cur);
      } else if (cur && line !== '') {
        cur.text += '\n' + line;
      }
    }
    var order = opts.dateOrder || detectDateOrder(raw);
    var messages = [];
    raw.forEach(function (r) {
      if (r.system) return;
      var day = order === 'mdy' ? r.b : r.a, mon = order === 'mdy' ? r.a : r.b, h = r.h;
      if (r.ap === 'p' && h < 12) h += 12;
      if (r.ap === 'a' && h === 12) h = 0;
      if (mon < 1 || mon > 12 || day < 1 || day > 31) return;
      if (/<(media omitted|multimedia omitido|arquivo de mídia oculto)>|omitted$/i.test(r.text.trim()) && !/\d/.test(r.text)) return;
      messages.push({ date: r.y + '-' + pad(mon) + '-' + pad(day), time: pad(h) + ':' + pad(r.min),
                      sender: r.sender, text: r.text.trim() });
    });
    return { messages: messages, dateOrder: order };
  }

  function detectDateOrder(raw) {
    var firstBig = false, secondBig = false;
    raw.forEach(function (r) { if (r.a > 12) firstBig = true; if (r.b > 12) secondBig = true; });
    if (secondBig && !firstBig) return 'mdy';
    return 'dmy';
  }

  function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  // "1.234,50" "1,234.50" "1.500" "12,5" -> number
  function parseNumber(tok) {
    var s = tok.replace(/\s/g, ''), lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc >= 0 && ld >= 0) {
      var dec = lc > ld ? ',' : '.';
      s = dec === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lc >= 0 || ld >= 0) {
      var sep = lc >= 0 ? ',' : '.', parts = s.split(sep);
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0')) s = parts.join('');
      else s = parts.join('.');
    }
    var v = parseFloat(s);
    return isFinite(v) ? v : NaN;
  }

  var PAY_WORDS = /\b(pago|pague|pagaron|pagado|pagada|transfer\w*|deposit\w*|abon\w*|liquid\w*|paid|payment|venmo|zelle|cashapp|pix|paguei|pagamento|depositei|recibi|received|comprobante|comprovante|settled)\b/;
  var CHARGE_WORDS = /\b(total|subtotal|seria|serian|cuesta|cuestan|precio|price|cost|costs|valor|cobro|cobrar|debes|debe|debo|deberia|owe|owes|custa|custam|importe)\b/;
  var NUM_RE = /(R\$|US\$|[$€£¥])?\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)(\s?(?:usd|mxn|ars|cop|clp|brl|eur|pesos|dolares|dollars|reais|soles|bucks)\b)?/gi;

  // Returns {amount, kind} or null when the message carries no money.
  function detectMoney(text) {
    var plain = stripAccents(text), cands = [], m;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(plain))) {
      var v = parseNumber(m[2]);
      if (isNaN(v) || v === 0) continue;
      // skip clock times such as 5:30 and dates such as 12/03
      var before = plain.charAt(m.index - 1), after = plain.charAt(m.index + m[0].length);
      if (!m[1] && !m[3] && (/[:\/]/.test(after) || /[:\/]/.test(before))) continue;
      cands.push({ v: v, idx: m.index, marked: !!(m[1] || m[3]) });
    }
    if (!cands.length) return null;
    var pay = PAY_WORDS.test(plain), chg = CHARGE_WORDS.test(plain);
    var marked = cands.filter(function (c) { return c.marked; });
    if (!marked.length && !pay && !chg) return null;
    var pick;
    if (marked.length) pick = marked[0];
    else {
      var kw = (plain.match(pay ? PAY_WORDS : CHARGE_WORDS) || {}).index || 0;
      pick = cands.filter(function (c) { return c.idx >= kw; })[0] || cands[cands.length - 1];
    }
    var kind = pay ? 'payment' : chg ? 'charge' : 'review';
    if (text.indexOf('?') >= 0 || text.indexOf('¿') >= 0) kind = 'review';
    return { amount: pick.v, kind: kind };
  }

  function guessOwner(messages) {
    var score = {}, count = {};
    messages.forEach(function (m) {
      count[m.sender] = (count[m.sender] || 0) + 1;
      var d = detectMoney(m.text);
      if (d && d.kind === 'charge') score[m.sender] = (score[m.sender] || 0) + 1;
    });
    var best = null, bs = -1;
    Object.keys(count).forEach(function (s) {
      var sc = (score[s] || 0) * 1000 + count[s];
      if (sc > bs) { bs = sc; best = s; }
    });
    return best;
  }

  // overrides: { [messageIndex]: 'charge'|'payment'|'ignore' }
  function buildEntries(messages, owner, overrides) {
    overrides = overrides || {};
    var entries = [], last = null, first = '(unassigned)';
    for (var k = 0; k < messages.length; k++) if (messages[k].sender !== owner) { first = messages[k].sender; break; }
    messages.forEach(function (m, i) {
      var isOwner = m.sender === owner;
      if (!isOwner) last = m.sender;
      if (last === null) last = first; // owner spoke first: attach to the first customer who replies
      var d = detectMoney(m.text);
      if (!d) return;
      var kind = overrides[i] || d.kind;
      entries.push({ index: i, date: m.date, time: m.time, sender: m.sender,
                     customer: isOwner ? last : m.sender, amount: d.amount, kind: kind, text: m.text });
    });
    return entries;
  }

  function ledger(entries) {
    var by = {};
    entries.forEach(function (e) {
      if (e.kind !== 'charge' && e.kind !== 'payment') return;
      var c = by[e.customer] || (by[e.customer] = { customer: e.customer, charged: 0, paid: 0, balance: 0, last: '', count: 0 });
      if (e.kind === 'charge') c.charged += e.amount; else c.paid += e.amount;
      c.count++;
      if (e.date > c.last) c.last = e.date;
    });
    return Object.keys(by).map(function (k) {
      var c = by[k]; c.charged = round(c.charged); c.paid = round(c.paid); c.balance = round(c.charged - c.paid); return c;
    }).sort(function (a, b) { return b.balance - a.balance; });
  }

  function round(n) { return Math.round(n * 100) / 100; }

  function csvCell(v) {
    var s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(entries) {
    var rows = [['date', 'time', 'customer', 'kind', 'amount', 'message']];
    entries.forEach(function (e) {
      if (e.kind === 'ignore') return;
      rows.push([e.date, e.time, e.customer, e.kind, e.amount, e.text.replace(/\n/g, ' ')]);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }

  var SAMPLE = [
    '[12/10/2026, 09:14:02] Panadería Lupita: Buen día Marta! Tu pedido: 2 roscas y 12 conchas',
    '[12/10/2026, 09:14:40] Panadería Lupita: El total son $480',
    '[12/10/2026, 09:20:11] Marta Gómez: Perfecto, ya te transferí $300',
    '[12/10/2026, 09:21:00] Panadería Lupita: Recibido, quedan $180 pendientes',
    '[14/10/2026, 18:02:45] Marta Gómez: Hola! para el viernes 3 tartas',
    '[14/10/2026, 18:05:10] Panadería Lupita: Serían 1,250 pesos',
    '[14/10/2026, 18:06:33] Marta Gómez: ¿son 1,250 o 1,350?',
    '[14/10/2026, 18:07:00] Panadería Lupita: 1,250',
    '[15/10/2026, 10:00:00] Jorge Ruiz: Buenas, 6 empanadas para hoy',
    '[15/10/2026, 10:01:12] Panadería Lupita: Total $210.50',
    '[15/10/2026, 10:30:00] Jorge Ruiz: Pagué $210.50 por transferencia, comprobante adjunto',
    '[16/10/2026, 08:00:00] Marta Gómez: Pagué el saldo anterior, 180',
    '[16/10/2026, 08:01:00] Marta Gómez: nos vemos a las 5:30'
  ].join('\n');

  return { parseChat: parseChat, detectMoney: detectMoney, parseNumber: parseNumber, guessOwner: guessOwner,
           buildEntries: buildEntries, ledger: ledger, toCSV: toCSV, SAMPLE: SAMPLE };
});
