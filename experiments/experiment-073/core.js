/* Plainly core — pure JS, no dependencies, runs in browsers and Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Plainly = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LANGS = ['en', 'es', 'de'];
  const LANG_NAMES = { en: 'English', es: 'Español', de: 'Deutsch' };

  const STOP = {
    en: 'the of and to in is that it for with as was on are by this be or from at you have not your will an can if we'.split(' '),
    es: 'de la que el en y los se del las por un para con no una su al es lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre'.split(' '),
    de: 'der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie einem über'.split(' '),
  };

  // Targets: how plain should the text be?
  const TARGETS = {
    easy:     { label: 'Easy (≈A2)',     maxWords: 12, lix: 35, maxLong: 0.08 },
    plain:    { label: 'Plain (≈B1)',    maxWords: 17, lix: 42, maxLong: 0.12 },
    standard: { label: 'Standard (≈B2)', maxWords: 25, lix: 50, maxLong: 0.18 },
  };

  const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

  function words(text) {
    const out = [];
    let m;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text))) out.push({ w: m[0].replace(/[-'’]+$/, ''), i: m.index });
    return out;
  }

  function detectLang(text) {
    const ws = words(text).map(x => x.w.toLowerCase());
    if (!ws.length) return 'en';
    const score = {};
    for (const l of LANGS) {
      const set = new Set(STOP[l]);
      score[l] = ws.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0);
    }
    if (/[ñ¿¡]/i.test(text)) score.es += 3;
    if (/[äöüß]/i.test(text)) score.de += 2;
    return LANGS.slice().sort((a, b) => score[b] - score[a])[0];
  }

  // ---------- syllables ----------
  function syllablesEn(w) {
    w = w.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|(?<=[^td])ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const g = w.match(/[aeiouy]+/g);
    return Math.max(1, g ? g.length : 1);
  }
  function syllablesEs(w) {
    w = w.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
    const strong = 'aeoáéó', weakAcc = 'íú', weak = 'iuü', all = 'aeiouáéíóúü';
    let n = 0, prev = '';
    for (const ch of w) {
      if (!all.includes(ch)) { prev = ''; continue; }
      if (prev === '') n++;
      else {
        const hiatus = (strong.includes(prev) && strong.includes(ch)) || weakAcc.includes(prev) || weakAcc.includes(ch);
        if (hiatus) n++;
      }
      prev = ch;
      if (weak.includes(ch) && false) prev = '';
    }
    return Math.max(1, n);
  }
  function syllablesDe(w) {
    w = w.toLowerCase().replace(/[^a-zäöüß]/g, '');
    const g = w.match(/[aeiouyäöü]+/g);
    return Math.max(1, g ? g.length : 1);
  }
  function syllables(word, lang) {
    return word.split(/[-'’]/).filter(Boolean).reduce(
      (n, p) => n + (lang === 'es' ? syllablesEs(p) : lang === 'de' ? syllablesDe(p) : syllablesEn(p)), 0) || 1;
  }

  // ---------- sentences ----------
  const ABBR = new Set(['dr', 'dra', 'sr', 'sra', 'mr', 'mrs', 'ms', 'prof', 'hr', 'fr', 'nr', 'vs', 'etc', 'usw', 'bzw', 'ca', 'z', 'b', 'u', 'a', 'd', 'h', 'e', 'i', 'g', 'o', 'st', 'no', 'art', 'tel', 'ej', 'pág', 'p', 'ud', 'uds', 'inc', 'ltd', 'jr', 'sa', 'abs', 'ggf', 'evtl', 'inkl', 'zzgl', 'vgl', 'geb']);

  const TITLES = new Set(['dr', 'dra', 'sr', 'sra', 'mr', 'mrs', 'ms', 'prof', 'hr', 'fr', 'st', 'jr', 'ud', 'uds', 'nr', 'no', 'art']);

  function sentences(text, lang) {
    const out = [];
    const re = /[.!?…]+["'”»)\]]*(?=\s)|\n\s*\n/g;
    let start = 0, m;
    const push = (s, e) => {
      let a = s, b = e;
      while (a < b && /\s/.test(text[a])) a++;
      while (b > a && /\s/.test(text[b - 1])) b--;
      if (b > a && /[\p{L}\p{N}]/u.test(text.slice(a, b))) out.push({ start: a, end: b, text: text.slice(a, b) });
    };
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length;
      if (m[0][0] !== '\n') {
        const before = text.slice(start, m.index);
        const last = (before.match(/([\p{L}]+)$/u) || [])[1];
        const nxt = text.slice(end).match(/^\s*(\S)/);
        const singleDot = m[0] === '.';
        if (singleDot && last && TITLES.has(last.toLowerCase())) continue;
        if (singleDot && last && ABBR.has(last.toLowerCase()) && (last.length === 1 || !nxt || !/[\p{Lu}¿¡]/u.test(nxt[1]))) continue;
        if (singleDot && nxt && /[\p{Ll}]/u.test(nxt[1])) continue; // lowercase continues the sentence
        if (singleDot && /\d$/.test(before) && nxt && /\d/.test(nxt[1])) continue;
        if (singleDot && lang === 'de' && /(?:^|[^\d])\d{1,2}$/.test(before)) continue; // German ordinals: "am 3. März"
      }
      push(start, end);
      start = end;
    }
    push(start, text.length);
    return out;
  }

  // ---------- swap dictionaries (phrase -> plainer) ----------
  const SWAPS = {
    en: {
      'in order to': 'to', 'prior to': 'before', 'subsequent to': 'after', 'in the event that': 'if',
      'with regard to': 'about', 'with respect to': 'about', 'pursuant to': 'under', 'in accordance with': 'under',
      'notwithstanding': 'despite', 'at this point in time': 'now', 'at the present time': 'now',
      'due to the fact that': 'because', 'in view of the fact that': 'because', 'a number of': 'some',
      'the majority of': 'most', 'in the absence of': 'without', 'for the purpose of': 'for',
      'is required to': 'must', 'are required to': 'must', 'shall': 'must', 'failure to': 'if you do not',
      'in the near future': 'soon', 'on a regular basis': 'regularly', 'has the ability to': 'can',
      'utilize': 'use', 'utilise': 'use', 'commence': 'start', 'terminate': 'end', 'endeavor': 'try',
      'endeavour': 'try', 'ascertain': 'find out', 'remuneration': 'pay', 'assistance': 'help',
      'additional': 'more', 'approximately': 'about', 'demonstrate': 'show', 'facilitate': 'help',
      'obtain': 'get', 'purchase': 'buy', 'sufficient': 'enough', 'requirement': 'need',
      'inform': 'tell', 'reside': 'live', 'indicate': 'show', 'subsequently': 'then', 'however': 'but',
      'therefore': 'so', 'nevertheless': 'still', 'consequently': 'so', 'regarding': 'about',
      'attempt': 'try', 'accompany': 'go with', 'forward': 'send', 'modify': 'change', 'prohibited': 'not allowed',
    },
    es: {
      'a efectos de': 'para', 'en virtud de': 'por', 'con anterioridad a': 'antes de', 'con posterioridad a': 'después de',
      'en el supuesto de que': 'si', 'dar cumplimiento a': 'cumplir', 'habida cuenta de': 'porque',
      'no obstante': 'pero', 'asimismo': 'también', 'a tal efecto': 'para eso', 'abonar': 'pagar', 'sufragar': 'pagar',
      'remitir': 'enviar', 'subsanar': 'corregir', 'efectuar': 'hacer', 'ostentar': 'tener', 'percibir': 'recibir',
      'con el fin de': 'para', 'a fin de': 'para', 'mediante': 'con', 'por medio de': 'con', 'en caso de': 'si',
      'al objeto de': 'para', 'resulta necesario': 'hay que', 'fallecimiento': 'muerte', 'solicitar': 'pedir',
      'comparecer': 'presentarse', 'con carácter previo': 'antes', 'con carácter general': 'en general',
      'en el plazo de': 'en', 'dentro del plazo de': 'en', 'procederá a': 'va a', 'deberá': 'debe', 'deberán': 'deben',
      'poseer': 'tener', 'cuantía': 'cantidad', 'inmueble': 'vivienda', 'a la mayor brevedad': 'pronto',
    },
    de: {
      'bezüglich': 'zu', 'hinsichtlich': 'zu', 'aufgrund': 'wegen', 'auf Grund': 'wegen', 'im Falle von': 'bei',
      'im Falle, dass': 'wenn', 'im Fall, dass': 'wenn', 'sofern': 'wenn', 'gegebenenfalls': 'wenn nötig',
      'zeitnah': 'bald', 'umgehend': 'sofort', 'unverzüglich': 'sofort', 'erforderlich': 'nötig',
      'ersuchen': 'bitten', 'mitteilen': 'sagen', 'in Kenntnis setzen': 'informieren',
      'zur Verfügung stellen': 'geben', 'in Anspruch nehmen': 'nutzen', 'Gebrauch machen von': 'nutzen',
      'tätigen': 'machen', 'vornehmen': 'machen', 'entrichten': 'zahlen', 'begleichen': 'zahlen',
      'im Rahmen von': 'bei', 'im Rahmen der': 'bei der', 'seitens': 'von', 'diesbezüglich': 'dazu',
      'binnen': 'innerhalb von', 'obliegen': 'zuständig sein für', 'bzw.': 'oder', 'ausreichend': 'genug',
      'ersichtlich': 'zu sehen', 'beantragen': 'fragen nach', 'aushändigen': 'geben', 'Antragsteller': 'Antragsteller/in',
      'erfolgt': 'geschieht', 'hierfür': 'dafür', 'insbesondere': 'vor allem', 'darüber hinaus': 'außerdem',
    },
  };

  const swapRes = {};
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function swapRegexes(lang) {
    if (swapRes[lang]) return swapRes[lang];
    const entries = Object.entries(SWAPS[lang]).sort((a, b) => b[0].length - a[0].length);
    swapRes[lang] = entries.map(([from, to]) => ({
      from, to,
      re: new RegExp('(?<![\\p{L}\\p{N}])' + escRe(from).replace(/\s+/g, '\\s+') + '(?![\\p{L}\\p{N}])', 'giu'),
    }));
    return swapRes[lang];
  }
  function matchCase(src, rep) {
    if (/^\p{Lu}/u.test(src) && !/^\p{Lu}/u.test(rep)) return rep[0].toUpperCase() + rep.slice(1);
    return rep;
  }
  function findSwaps(text, lang) {
    const hits = [];
    for (const { from, to, re } of swapRegexes(lang)) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) hits.push({ start: m.index, end: m.index + m[0].length, found: m[0], from, to: matchCase(m[0], to) });
    }
    hits.sort((a, b) => a.start - b.start || b.end - a.end);
    const res = []; let last = -1;
    for (const h of hits) if (h.start >= last) { res.push(h); last = h.end; }
    return res;
  }
  function applySwaps(text, lang) {
    const hits = findSwaps(text, lang);
    let out = '', pos = 0;
    for (const h of hits) { out += text.slice(pos, h.start) + h.to; pos = h.end; }
    return { text: out + text.slice(pos), count: hits.length };
  }

  // ---------- style detectors ----------
  const EN_PART = 'taken|given|written|shown|chosen|broken|driven|spoken|forgotten|eaten|seen|known|hidden|stolen|grown|drawn|thrown|worn|made|done|held|kept|sent|paid|built|found|told|set|put|read|lost|brought|bought|sold|left';
  const PASSIVE = {
    en: new RegExp('\\b(?:is|are|was|were|be|been|being)\\s+(?:\\w+ly\\s+)?(?:\\p{L}+ed|' + EN_PART + ')\\b', 'iu'),
    es: /(?<![\p{L}])(?:es|son|fue|fueron|será|serán|ha sido|han sido|había sido|sido|siendo|ser)\s+(?:\p{L}+(?:ado|ada|ados|adas|ido|ida|idos|idas)|hecho|hecha|hechos|hechas|escrito|escrita|visto|vista|dicho|dicha|puesto|puesta|roto|rota|abierto|abierta|resuelto|resuelta)(?![\p{L}])/iu,
    de: /(?<![\p{L}])(?:wird|werden|wurde|wurden|worden|wirst|werdet)(?![\p{L}])[^.!?;]{0,60}?(?<![\p{L}])(?:(?:an|auf|aus|ab|bei|ein|mit|nach|vor|zu|zurück|weg|um|fest)?ge\p{L}{2,}(?:t|en)|\p{L}+iert)(?![\p{L}])/iu,
  };
  const NOMINAL = {
    en: /^\p{L}{5,}(?:tion|sion|ment|ness|ity|ance|ence)s?$/iu,
    es: /^\p{L}{4,}(?:ción|sión|miento|dad|ncia)(?:es|s)?$/iu,
    de: /^\p{L}{3,}(?:ung|keit|heit|schaft|ion)(?:en)?$/iu,
  };

  function analyzeSentence(s, lang, target, offset) {
    const ws = words(s.text);
    const flags = [];
    const n = ws.length;
    const sylls = ws.map(x => syllables(x.w, lang));
    const longWords = ws.filter(x => x.w.replace(/[-'’]/g, '').length > 6).length;
    if (n > target.maxWords) flags.push({ id: 'long', label: `Long sentence (${n} words, target ≤ ${target.maxWords})`, hint: 'Split at "and", "but", a colon or a relative clause.' });
    if (PASSIVE[lang].test(s.text)) flags.push({ id: 'passive', label: 'Passive voice', hint: 'Say who does the action: "we will send" instead of "will be sent".' });
    const nom = ws.filter(x => NOMINAL[lang].test(x.w)).length;
    if (nom >= 3 || (nom >= 2 && n <= 14)) flags.push({ id: 'nominal', label: `Noun-heavy (${nom} abstract nouns)`, hint: 'Turn abstract nouns back into verbs: "make a decision" → "decide".' });
    const commas = (s.text.match(/[,;]/g) || []).length;
    if (commas >= 4) flags.push({ id: 'commas', label: `Many clauses (${commas} commas/semicolons)`, hint: 'One idea per sentence.' });
    if (/\([^)]{25,}\)/.test(s.text)) flags.push({ id: 'paren', label: 'Long parenthetical', hint: 'Move the aside into its own sentence.' });
    const veryLong = ws.filter(x => x.w.length >= 15 && lang !== 'de' || x.w.length >= 20);
    if (veryLong.length) flags.push({ id: 'word', label: `Very long word: ${veryLong[0].w}`, hint: 'Use a shorter word or explain it.' });
    const swaps = findSwaps(s.text, lang).map(h => ({ ...h, start: h.start + offset, end: h.end + offset }));
    if (swaps.length) flags.push({ id: 'jargon', label: `Plainer wording available (${swaps.length})`, hint: swaps.slice(0, 3).map(h => `"${h.found}" → "${h.to}"`).join(', ') });
    return { words: n, syllables: sylls.reduce((a, b) => a + b, 0), longWords, flags, swaps };
  }

  // ---------- scores ----------
  function band(lix) {
    if (lix < 30) return 'very easy';
    if (lix < 40) return 'easy';
    if (lix < 50) return 'medium';
    if (lix < 60) return 'hard';
    return 'very hard';
  }

  function scores(stats, lang) {
    const { words: W, sentences: S, syllables: Y, longWords: L } = stats;
    if (!W || !S) return { lix: 0, band: 'very easy', formula: null };
    const asl = W / S, asw = Y / W;
    const lix = asl + (100 * L) / W;
    let formula;
    if (lang === 'en') {
      formula = { name: 'Flesch Reading Ease', value: 206.835 - 1.015 * asl - 84.6 * asw, higherIsEasier: true,
        extra: { name: 'Flesch–Kincaid grade', value: 0.39 * asl + 11.8 * asw - 15.59 } };
    } else if (lang === 'es') {
      formula = { name: 'Fernández-Huerta', value: 206.84 - 0.6 * (100 * Y / W) - 1.02 * (100 * S / W), higherIsEasier: true };
    } else {
      formula = { name: 'Amstad (Flesch-de)', value: 180 - asl - 58.5 * asw, higherIsEasier: true };
    }
    return { lix, band: band(lix), formula };
  }

  function wstf(stats, sylCounts) {
    // Wiener Sachtextformel 1 (German), as used by the Zurich/ZIX-adjacent literature
    const W = stats.words; if (!W) return null;
    const MS = 100 * sylCounts.ge3 / W, SL = W / stats.sentences, IW = 100 * stats.longWords / W, ES = 100 * sylCounts.one / W;
    return 0.1935 * MS + 0.1672 * SL + 0.1297 * IW - 0.0327 * ES - 0.875;
  }

  function analyze(text, opts) {
    opts = opts || {};
    const lang = LANGS.includes(opts.lang) ? opts.lang : detectLang(text);
    const target = TARGETS[opts.target] || TARGETS.plain;
    const sents = sentences(text, lang);
    const out = [];
    const stats = { words: 0, sentences: 0, syllables: 0, longWords: 0 };
    const sylCounts = { ge3: 0, one: 0 };
    for (const s of sents) {
      const a = analyzeSentence(s, lang, target, s.start);
      for (const x of words(s.text)) {
        const sy = syllables(x.w, lang);
        if (sy >= 3) sylCounts.ge3++;
        if (sy === 1) sylCounts.one++;
      }
      stats.words += a.words; stats.syllables += a.syllables; stats.longWords += a.longWords;
      if (a.words) stats.sentences++;
      out.push({ ...s, ...a });
    }
    const sc = scores(stats, lang);
    const flagged = out.filter(s => s.flags.length);
    const meeting = out.filter(s => s.words <= target.maxWords).length;
    return {
      lang, target: opts.target in TARGETS ? opts.target : 'plain', targetInfo: target, stats, sentences: out,
      lix: sc.lix, band: sc.band, formula: sc.formula,
      wstf: lang === 'de' ? wstf(stats, sylCounts) : null,
      avgSentence: stats.sentences ? stats.words / stats.sentences : 0,
      longWordPct: stats.words ? (100 * stats.longWords) / stats.words : 0,
      flaggedCount: flagged.length,
      sentencesWithinTarget: out.length ? meeting / out.length : 1,
      passesTarget: sc.lix <= target.lix && (out.length === 0 || meeting === out.length),
    };
  }

  // ---------- reports ----------
  function checklistMarkdown(text, a) {
    const L = [];
    L.push(`# Plain-language rewrite checklist`);
    L.push('');
    L.push(`Language: ${LANG_NAMES[a.lang]} · Target: ${a.targetInfo.label} · LIX ${a.lix.toFixed(1)} (${a.band}) · ${a.formula ? a.formula.name + ' ' + a.formula.value.toFixed(1) : ''}`);
    L.push(`Words: ${a.stats.words} · Sentences: ${a.stats.sentences} · Avg sentence: ${a.avgSentence.toFixed(1)} words`);
    L.push('');
    const fl = a.sentences.map((s, i) => ({ s, i })).filter(x => x.s.flags.length);
    if (!fl.length) { L.push('Nothing to fix at this target. ✔'); return L.join('\n') + '\n'; }
    for (const { s, i } of fl) {
      const ex = s.text.replace(/\s+/g, ' ');
      L.push(`- [ ] **Sentence ${i + 1}:** “${ex.length > 110 ? ex.slice(0, 107) + '…' : ex}”`);
      for (const f of s.flags) L.push(`  - ${f.label}. ${f.hint}`);
    }
    return L.join('\n') + '\n';
  }

  return { analyze, detectLang, sentences, words, syllables, findSwaps, applySwaps, checklistMarkdown, TARGETS, LANGS, LANG_NAMES, SWAPS };
});
