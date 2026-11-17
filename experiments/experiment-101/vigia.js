#!/usr/bin/env node
/*
 * Vigía 1.0.0 — paste your WordPress plugin list, see which plugins, themes and
 * core version are vulnerable, closed on wordpress.org, actively exploited
 * (CISA KEV) or abandoned. Zero dependencies. Works in Node 18+ and in a browser.
 *
 * Data sources (all free, no account, no key):
 *   - https://api.wordpress.org/plugins/info/1.2/  and /themes/info/1.2/  (latest version, last update, closed status)
 *   - https://api.wordpress.org/core/stable-check/1.0/                     (core: latest / outdated / insecure)
 *   - https://www.wpvulnerability.net/                                     (known vulnerabilities with version ranges)
 *   - CISA KEV (bundled snapshot, see kev-snapshot.js)                     (actively exploited CVEs)
 * Only plugin/theme slugs and the core version leave your computer. Your domain,
 * your installed plugin versions and anything else you pasted never do.
 *
 * Daily Security Lab · Experiment 101 of dev-experiments-365 — MIT licence.
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var SEV = ['critical', 'high', 'medium', 'low', 'info'];
  var SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  var PENALTY = { critical: 40, high: 25, medium: 10, low: 3, info: 0 };
  var ABANDON_YEARS = 2;   // our criterion, not a wordpress.org rule (wordpress.org warns after 2 years too)
  var STALE_YEARS = 1;

  // ---------------------------------------------------------------- text
  var T = {
    en: {
      core: 'WordPress core', plugin: 'Plugin', theme: 'Theme',
      coreInsecure: function (v, latest) { return 'WordPress ' + v + ' is marked "insecure" by wordpress.org. Security fixes exist that this site does not have.'; },
      coreInsecureFix: function (v, latest, branchLatest) { return branchLatest && branchLatest !== latest ? 'Update to ' + latest + ' (or at least ' + branchLatest + ', the patched release of your branch). Dashboard → Updates → Update now. Back up first.' : 'Update to ' + latest + '. Dashboard → Updates → Update now. Back up first.'; },
      coreOutdated: function (v, latest) { return 'WordPress ' + v + ' still gets security fixes, but the current version is ' + latest + '.'; },
      coreOutdatedFix: function (latest) { return 'Plan the update to ' + latest + ' after testing on a copy of the site.'; },
      coreUnknown: function (v) { return 'WordPress ' + v + ' is not in the wordpress.org release list (development build or typo).'; },
      coreUnknownFix: 'Check the version in Dashboard → Updates.',
      coreKev: function (ids) { return 'This core version is affected by ' + ids.join(', ') + ', listed by CISA as exploited in the wild.'; },
      coreKevFix: function (latest) { return 'Update to ' + latest + ' today.'; },
      vuln: function (n, list) { return n + ' known vulnerabilit' + (n === 1 ? 'y' : 'ies') + ' affect this version: ' + list; },
      vulnFix: function (target, type) { var w = type === 'theme' ? '(Appearance → Themes → Update now). If you cannot update, switch to another theme until you can.' : '(Plugins → Update now). If you cannot update, deactivate it until you can.'; return target ? 'Update to ' + target + ' or later ' + w : 'Update to the latest version ' + w; },
      vulnUnfixed: function (list) { return 'Known vulnerability with NO fixed version: ' + list; },
      vulnUnfixedFix: 'Deactivate and replace it. No update fixes this yet.',
      kev: function (ids) { return 'ACTIVELY EXPLOITED: ' + ids.join(', ') + ' ' + (ids.length === 1 ? 'is' : 'are') + ' in the CISA Known Exploited Vulnerabilities catalog.'; },
      kevFix: function (target) { return (target ? 'Update to ' + target + ' or later now' : 'Update now') + ', then look for signs of compromise: unknown administrator users, unknown plugins, files in wp-content/mu-plugins.'; },
      closedSec: function (date) { return 'Closed on wordpress.org on ' + date + ' for a SECURITY ISSUE. It will not receive updates.'; },
      closedOther: function (date, reason) { return 'Closed on wordpress.org on ' + date + ' (' + reason + '). It will not receive updates through WordPress.'; },
      closedFix: 'Replace it with a maintained plugin, then delete it (deactivating is not enough: the files stay reachable).',
      update: function (v, latest) { return 'Installed ' + v + ', latest is ' + latest + '.'; },
      updateFix: function (type) { return 'Update it (' + (type === 'theme' ? 'Appearance → Themes' : 'Plugins') + ' → Update now), or turn on automatic updates for it.'; },
      abandoned: function (d, y) { return 'Last update on wordpress.org: ' + d + ' (more than ' + y + ' years ago). Probably abandoned: future bugs may never be fixed.'; },
      abandonedFix: 'Look for an actively maintained alternative.',
      stale: function (d) { return 'Last update on wordpress.org: ' + d + ' (more than a year ago).'; },
      staleFix: 'Keep an eye on it; prefer plugins updated in the last year.',
      notListed: 'Not on wordpress.org (premium, custom or renamed). Closed status and latest version cannot be checked here.',
      notListedFix: 'Check updates with the vendor. Known vulnerabilities were still checked by slug.',
      noVersion: 'No version given, so vulnerabilities could not be matched.',
      noVersionFix: 'Paste the list with versions (Tools → Site Health → Info → Copy site info).',
      slugGuessed: function (name, slug) { return '"' + name + '" was matched to the wordpress.org slug "' + slug + '" by name.'; },
      slugGuessedFix: 'If that is not your plugin, paste `wp plugin list` instead (it has exact slugs).',
      slugUnknown: function (name) { return 'Could not find "' + name + '" on wordpress.org by name.'; },
      slugUnknownFix: 'Paste `wp plugin list` or "slug version" lines to check it.',
      lookupFailed: function (what) { return 'Lookup failed (' + what + '). This item was NOT fully checked.'; },
      lookupFailedFix: 'Try again later.',
      inactive: ' (inactive: still exploitable if its files are reachable)',
      noItems: 'Nothing recognised. Paste Site Health info, `wp plugin list` output or "slug version" lines.',
      grade: 'grade', checked: 'checked', items: 'items', none: 'No findings.',
      fix: 'Fix'
    },
    es: {
      core: 'Núcleo de WordPress', plugin: 'Plugin', theme: 'Tema',
      coreInsecure: function (v) { return 'wordpress.org marca WordPress ' + v + ' como «inseguro». Existen correcciones de seguridad que este sitio no tiene.'; },
      coreInsecureFix: function (v, latest, branchLatest) { return branchLatest && branchLatest !== latest ? 'Actualiza a ' + latest + ' (o como mínimo a ' + branchLatest + ', la versión corregida de tu rama). Escritorio → Actualizaciones → Actualizar ahora. Haz una copia de seguridad antes.' : 'Actualiza a ' + latest + '. Escritorio → Actualizaciones → Actualizar ahora. Haz una copia de seguridad antes.'; },
      coreOutdated: function (v, latest) { return 'WordPress ' + v + ' aún recibe correcciones de seguridad, pero la versión actual es ' + latest + '.'; },
      coreOutdatedFix: function (latest) { return 'Planifica la actualización a ' + latest + ' después de probarla en una copia del sitio.'; },
      coreUnknown: function (v) { return 'WordPress ' + v + ' no está en la lista de versiones de wordpress.org (versión de desarrollo o error al copiar).'; },
      coreUnknownFix: 'Revisa la versión en Escritorio → Actualizaciones.',
      coreKev: function (ids) { return 'Esta versión del núcleo está afectada por ' + ids.join(', ') + ', que CISA registra como explotada activamente.'; },
      coreKevFix: function (latest) { return 'Actualiza a ' + latest + ' hoy mismo.'; },
      vuln: function (n, list) { return n + (n === 1 ? ' vulnerabilidad conocida afecta' : ' vulnerabilidades conocidas afectan') + ' a esta versión: ' + list; },
      vulnFix: function (target, type) { var w = type === 'theme' ? '(Apariencia → Temas → Actualizar ahora). Si no puedes actualizar, cambia a otro tema mientras tanto.' : '(Plugins → Actualizar ahora). Si no puedes actualizar, desactívalo mientras tanto.'; return target ? 'Actualiza a ' + target + ' o superior ' + w : 'Actualiza a la última versión ' + w; },
      vulnUnfixed: function (list) { return 'Vulnerabilidad conocida SIN versión corregida: ' + list; },
      vulnUnfixedFix: 'Desactívalo y reemplázalo. Todavía no hay actualización que lo corrija.',
      kev: function (ids) { return 'EXPLOTADA ACTIVAMENTE: ' + ids.join(', ') + (ids.length === 1 ? ' está' : ' están') + ' en el catálogo de vulnerabilidades explotadas de CISA (KEV).'; },
      kevFix: function (target) { return (target ? 'Actualiza ya a ' + target + ' o superior' : 'Actualiza ya') + ' y busca señales de intrusión: administradores que no conoces, plugins que no instalaste, archivos en wp-content/mu-plugins.'; },
      closedSec: function (date) { return 'Cerrado en wordpress.org el ' + date + ' por un PROBLEMA DE SEGURIDAD. No recibirá actualizaciones.'; },
      closedOther: function (date, reason) { return 'Cerrado en wordpress.org el ' + date + ' (' + reason + '). No recibirá actualizaciones desde WordPress.'; },
      closedFix: 'Reemplázalo por un plugin mantenido y después bórralo (desactivarlo no basta: los archivos siguen accesibles).',
      update: function (v, latest) { return 'Tienes la ' + v + ' y la última es la ' + latest + '.'; },
      updateFix: function (type) { return 'Actualízalo (' + (type === 'theme' ? 'Apariencia → Temas' : 'Plugins') + ' → Actualizar ahora) o activa sus actualizaciones automáticas.'; },
      abandoned: function (d, y) { return 'Última actualización en wordpress.org: ' + d + ' (hace más de ' + y + ' años). Probablemente abandonado: los fallos futuros quizá nunca se corrijan.'; },
      abandonedFix: 'Busca una alternativa que se mantenga activamente.',
      stale: function (d) { return 'Última actualización en wordpress.org: ' + d + ' (hace más de un año).'; },
      staleFix: 'Vigílalo; prefiere plugins actualizados en el último año.',
      notListed: 'No está en wordpress.org (de pago, a medida o con otro nombre). Aquí no se puede revisar si está cerrado ni su última versión.',
      notListedFix: 'Consulta las actualizaciones con el proveedor. Las vulnerabilidades conocidas sí se revisaron por su identificador.',
      noVersion: 'Sin versión: no se pudieron cruzar las vulnerabilidades.',
      noVersionFix: 'Pega la lista con versiones (Herramientas → Salud del sitio → Información → botón para copiar la información del sitio).',
      slugGuessed: function (name, slug) { return '«' + name + '» se asoció por nombre al identificador «' + slug + '» de wordpress.org.'; },
      slugGuessedFix: 'Si no es tu plugin, pega la salida de `wp plugin list` (trae los identificadores exactos).',
      slugUnknown: function (name) { return 'No se encontró «' + name + '» en wordpress.org por su nombre.'; },
      slugUnknownFix: 'Pega `wp plugin list` o líneas «identificador versión» para revisarlo.',
      lookupFailed: function (what) { return 'Falló la consulta (' + what + '). Este elemento NO se revisó del todo.'; },
      lookupFailedFix: 'Inténtalo de nuevo más tarde.',
      inactive: ' (inactivo: igual se puede explotar si sus archivos son accesibles)',
      noItems: 'No se reconoció nada. Pega la información de Salud del sitio, la salida de `wp plugin list` o líneas «identificador versión».',
      grade: 'nota', checked: 'revisados', items: 'elementos', none: 'Sin hallazgos.',
      fix: 'Arreglo'
    }
  };

  // ---------------------------------------------------------------- versions
  function vparts(v) {
    return String(v).trim().replace(/^v/i, '').split(/[.\-+_ ]/).map(function (p) {
      var n = parseInt(p, 10);
      return isNaN(n) ? p.toLowerCase() : n;
    });
  }
  // Returns -1, 0, 1. Numeric segments compare numerically; "1.2" == "1.2.0";
  // a pre-release tag ("1.2-beta") sorts before the release ("1.2").
  function compareVersions(a, b) {
    var x = vparts(a), y = vparts(b), n = Math.max(x.length, y.length);
    for (var i = 0; i < n; i++) {
      var p = x[i], q = y[i];
      if (p === undefined) p = typeof q === 'string' ? '' : 0;
      if (q === undefined) q = typeof p === 'string' ? '' : 0;
      if (p === q) continue;
      if (typeof p === 'number' && typeof q === 'number') return p < q ? -1 : 1;
      if (p === '') return 1;           // release > pre-release
      if (q === '') return -1;
      if (typeof p === 'number') return 1;
      if (typeof q === 'number') return -1;
      return p < q ? -1 : 1;
    }
    return 0;
  }
  function cmpOp(version, op, bound) {
    if (!op || bound === null || bound === undefined || bound === '') return true;
    var c = compareVersions(version, bound);
    switch (op) {
      case 'lt': return c < 0;
      case 'le': return c <= 0;
      case 'gt': return c > 0;
      case 'ge': return c >= 0;
      case 'eq': return c === 0;
      default: return true;
    }
  }
  // WPVulnerability "operator": {min_operator, min_version, max_operator, max_version, unfixed}
  function affects(op, version) {
    if (!op) return false;
    return cmpOp(version, op.min_operator, op.min_version) && cmpOp(version, op.max_operator, op.max_version);
  }
  function fixedIn(op) {
    if (!op || String(op.unfixed) === '1') return null;
    if (op.max_operator === 'lt' && op.max_version) return op.max_version;
    return null; // "le" ranges: fixed in a later, unnamed release
  }

  // ---------------------------------------------------------------- parsing
  function decodeEntities(s) {
    return String(s || '').replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  function slugify(name) {
    return decodeEntities(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  var SLUG_RE = /^[a-z0-9][a-z0-9_.-]*$/i;
  var VER_RE = /^v?\d+(?:\.[0-9A-Za-z]+)*(?:[-+][0-9A-Za-z.-]+)?$/;

  // Site Health → Info → "Copy site info to clipboard" (always the English "debug" format).
  function parseSiteHealth(text) {
    var out = { format: 'site-health', core: null, items: [] };
    var section = '';
    text.split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/^﻿/, '').trimEnd();
      var h = /^###\s+([^#]+?)(?:\s+\(\d+\))?\s+###$/.exec(line.trim());
      if (h) { section = h[1].trim(); return; }
      if (!line.trim() || /^\s/.test(raw)) return; // blank lines and nested "\tkey: value" sub-fields
      var pm = /^(.*?): ((?:version|author): .*)$/.exec(line);
      var idx = line.indexOf(': ');
      if (idx < 0) return;
      var key = pm ? pm[1].trim() : line.slice(0, idx).trim(), val = pm ? pm[2].trim() : line.slice(idx + 2).trim();
      if (section === 'wp-core' && key === 'version') { out.core = val.split(/\s/)[0]; return; }
      if (section === 'wp-active-theme' || section === 'wp-parent-theme') {
        var t = out._theme && out._theme.section === section ? out._theme : (out._theme = { section: section, type: 'theme', status: section === 'wp-active-theme' ? 'active' : 'parent', source: 'site-health' });
        if (key === 'name') {
          var m = /^(.*)\s+\(([^()]+)\)$/.exec(val);
          if (m) { t.name = m[1]; t.slug = m[2]; t.slugSource = 'exact'; } else { t.name = val; }
        } else if (key === 'version') {
          t.version = val === 'undefined' ? null : val.split(/\s/)[0];
        }
        if (t.name && 'version' in t && !t.pushed) { t.pushed = true; out.items.push(t); }
        return;
      }
      var type = /^wp-(?:mu-)?plugins-/.test(section) || section === 'wp-dropins' ? 'plugin' : section === 'wp-themes-inactive' ? 'theme' : null;
      if (!type || section === 'wp-dropins') return;
      var vm = /(?:^|,\s*)version:\s*([^,\s(]+)/.exec(val);
      var lm = /\(latest version:\s*([^)\s]+)\)/.exec(val);
      out.items.push({
        type: type, name: key, slug: null, slugSource: null,
        version: vm && vm[1] !== '(undefined)' ? vm[1] : null,
        status: /inactive/.test(section) ? 'inactive' : /mu-plugins/.test(section) ? 'must-use' : 'active',
        reportedLatest: lm ? lm[1] : null, source: 'site-health'
      });
    });
    out.items.forEach(function (i) { delete i.pushed; delete i.section; });
    delete out._theme;
    return out;
  }

  function splitCsv(line) {
    var cells = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { cells.push(cur); cur = ''; } else cur += c;
    }
    cells.push(cur);
    return cells.map(function (s) { return s.trim(); });
  }

  function rowsToItems(header, rows, type) {
    var h = header.map(function (s) { return s.toLowerCase(); });
    var iName = h.indexOf('name'), iVer = h.indexOf('version'), iStatus = h.indexOf('status'), iUpd = h.indexOf('update_version');
    if (iName < 0) return [];
    return rows.filter(function (r) { return r[iName]; }).map(function (r) {
      var status = iStatus >= 0 ? r[iStatus] : null;
      return {
        type: status === 'dropin' ? 'dropin' : type, slug: r[iName], name: r[iName], slugSource: 'exact',
        version: iVer >= 0 && r[iVer] ? r[iVer] : null, status: status || null,
        reportedLatest: iUpd >= 0 && r[iUpd] ? r[iUpd] : null, source: 'wp-cli'
      };
    }).filter(function (i) { return i.type !== 'dropin'; });
  }

  // `wp plugin list` / `wp theme list` in table, csv or json format, plain
  // "slug version" lines, `wp core version`, and "plugins:" / "themes:" markers.
  function parseList(text) {
    var out = { format: 'list', core: null, items: [] };
    var type = 'plugin';
    var lines = text.split(/\r?\n/);
    var i = 0;
    function marker(l) {
      var m = /^\s*(?:#+\s*)?(plugins?|themes?|core)\s*:?\s*$/i.exec(l);
      return m ? m[1].toLowerCase().replace(/s$/, '') : null;
    }
    while (i < lines.length) {
      var l = lines[i].trim();
      if (!l || /^\+[-+]+\+$/.test(l)) { i++; continue; }
      var mk = marker(l);
      if (mk) { type = mk === 'core' ? 'plugin' : mk; i++; continue; }
      if (/^\$\s*wp\s+theme\b/.test(l)) { type = 'theme'; i++; continue; }
      if (/^\$\s*wp\s+plugin\b/.test(l)) { type = 'plugin'; i++; continue; }
      if (/^\$\s*wp\s+core\s+version/.test(l)) { i++; if (i < lines.length && VER_RE.test(lines[i].trim())) out.core = lines[i].trim(); i++; continue; }
      // JSON array
      if (l[0] === '[') {
        var buf = [], depth = 0, j = i;
        for (; j < lines.length; j++) { buf.push(lines[j]); depth += (lines[j].match(/\[/g) || []).length - (lines[j].match(/\]/g) || []).length; if (depth <= 0) break; }
        try {
          var arr = JSON.parse(buf.join('\n'));
          if (Array.isArray(arr) && arr.length && typeof arr[0] === 'object') {
            var keys = Object.keys(arr[0]);
            out.items = out.items.concat(rowsToItems(keys, arr.map(function (o) { return keys.map(function (k) { return o[k] == null ? '' : String(o[k]); }); }), type));
            out.format = 'wp-cli';
          }
        } catch (e) { /* not JSON, fall through as text */ }
        i = j + 1; continue;
      }
      // Table
      if (l[0] === '|') {
        var hdr = l.split('|').slice(1, -1).map(function (s) { return s.trim(); });
        var rows = [];
        i++;
        while (i < lines.length && /^\s*[|+]/.test(lines[i])) {
          var t = lines[i].trim();
          if (t[0] === '|') rows.push(t.split('|').slice(1, -1).map(function (s) { return s.trim(); }));
          i++;
        }
        out.items = out.items.concat(rowsToItems(hdr, rows, type));
        out.format = 'wp-cli';
        continue;
      }
      // CSV with header
      if (/^"?name"?,/i.test(l) && /version/i.test(l)) {
        var h2 = splitCsv(l), rows2 = [];
        i++;
        while (i < lines.length && lines[i].indexOf(',') >= 0 && !marker(lines[i])) { rows2.push(splitCsv(lines[i])); i++; }
        out.items = out.items.concat(rowsToItems(h2, rows2, type));
        out.format = 'wp-cli';
        continue;
      }
      // TSV with header (wp-admin copy or spreadsheets)
      if (/^name\tstatus/i.test(l)) {
        var h3 = l.split('\t'), rows3 = [];
        i++;
        while (i < lines.length && lines[i].indexOf('\t') >= 0) { rows3.push(lines[i].split('\t')); i++; }
        out.items = out.items.concat(rowsToItems(h3, rows3, type));
        out.format = 'wp-cli';
        continue;
      }
      // Plain lines
      var p = l.replace(/#.*$/, '').trim();
      var m;
      if ((m = /^(?:wordpress|core|wp)(?:\s+version)?\s*[:=@ ]\s*(\S+)$/i.exec(p)) && VER_RE.test(m[1])) { out.core = m[1].replace(/^v/i, ''); i++; continue; }
      if (VER_RE.test(p) && !out.core && out.items.length === 0 && i === firstContent(lines)) { out.core = p; i++; continue; }
      if ((m = /^(plugin|theme)\s+(\S+)(?:\s*[:=@ ]\s*(\S+))?$/i.exec(p))) {
        out.items.push({ type: m[1].toLowerCase(), slug: m[2], name: m[2], slugSource: 'exact', version: m[3] || null, status: null, source: 'text' }); i++; continue;
      }
      if ((m = /^([A-Za-z0-9][A-Za-z0-9_.-]*?)(?:\s*(?:==|[:=@]|\s)\s*(v?\d[^\s]*))?$/.exec(p)) && SLUG_RE.test(m[1]) && !VER_RE.test(m[1])) {
        out.items.push({ type: type, slug: m[1].toLowerCase(), name: m[1], slugSource: 'exact', version: m[2] ? m[2].replace(/^v/i, '') : null, status: null, source: 'text' }); i++; continue;
      }
      i++;
    }
    return out;
  }
  function firstContent(lines) { for (var k = 0; k < lines.length; k++) if (lines[k].trim()) return k; return -1; }

  function parseInput(text) {
    text = String(text || '');
    var parsed = /^###\s+wp-core\s+###/m.test(text) ? parseSiteHealth(text) : parseList(text);
    // de-duplicate by type+slug/name, keep the first
    var seen = {};
    parsed.items = parsed.items.filter(function (it) {
      var k = it.type + ':' + (it.slug || it.name).toLowerCase();
      if (seen[k]) return false;
      seen[k] = 1; return true;
    });
    return parsed;
  }

  // ---------------------------------------------------------------- data access
  var WPORG = 'https://api.wordpress.org';
  var WPV = 'https://www.wpvulnerability.net';
  var PLUGIN_FIELDS = ['sections', 'description', 'short_description', 'reviews', 'banners', 'icons', 'contributors', 'screenshots', 'versions', 'ratings', 'tags', 'donate_link', 'compatibility', 'author_profile']
    .map(function (f) { return '&request%5Bfields%5D%5B' + f + '%5D=0'; }).join('');
  var THEME_FIELDS = ['sections', 'description', 'reviews_url', 'screenshot_url', 'tags', 'versions', 'ratings', 'theme_url']
    .map(function (f) { return '&request%5Bfields%5D%5B' + f + '%5D=0'; }).join('');
  var urls = {
    pluginInfo: function (slug) { return WPORG + '/plugins/info/1.2/?action=plugin_information&request%5Bslug%5D=' + encodeURIComponent(slug) + PLUGIN_FIELDS; },
    themeInfo: function (slug) { return WPORG + '/themes/info/1.2/?action=theme_information&request%5Bslug%5D=' + encodeURIComponent(slug) + THEME_FIELDS + '&request%5Bfields%5D%5Blast_updated%5D=1'; },
    pluginSearch: function (name) { return WPORG + '/plugins/info/1.2/?action=query_plugins&request%5Bsearch%5D=' + encodeURIComponent(name) + '&request%5Bper_page%5D=5' + PLUGIN_FIELDS; },
    themeSearch: function (name) { return WPORG + '/themes/info/1.2/?action=query_themes&request%5Bsearch%5D=' + encodeURIComponent(name) + '&request%5Bper_page%5D=5' + THEME_FIELDS; },
    stableCheck: function () { return WPORG + '/core/stable-check/1.0/'; },
    vulnPlugin: function (slug) { return WPV + '/plugin/' + encodeURIComponent(slug) + '/'; },
    vulnTheme: function (slug) { return WPV + '/theme/' + encodeURIComponent(slug) + '/'; },
    vulnCore: function (v) { return WPV + '/core/' + encodeURIComponent(v) + '/'; }
  };

  // getJson(url) -> Promise<{status, body}>; body is parsed JSON or null.
  function makeFetcher(fetchImpl) {
    var cache = {};
    return function getJson(url) {
      if (cache[url]) return cache[url];
      cache[url] = Promise.resolve().then(function () { return fetchImpl(url, { headers: { accept: 'application/json' } }); })
        .then(function (r) {
          return r.text().then(function (t) {
            var body = null;
            try { body = JSON.parse(t); } catch (e) { body = null; }
            return { status: r.status, body: body };
          });
        });
      return cache[url];
    };
  }
  function pool(items, n, fn) {
    var i = 0, results = new Array(items.length);
    function next() {
      if (i >= items.length) return Promise.resolve();
      var k = i++;
      return Promise.resolve(fn(items[k], k)).then(function (r) { results[k] = r; return next(); });
    }
    var workers = [];
    for (var w = 0; w < Math.min(n, items.length); w++) workers.push(next());
    return Promise.all(workers).then(function () { return results; });
  }

  function sameName(a, b) { return decodeEntities(a).toLowerCase().replace(/\s+/g, ' ').trim() === decodeEntities(b).toLowerCase().replace(/\s+/g, ' ').trim(); }

  function resolveSlug(item, getJson) {
    if (item.slug) return Promise.resolve(item);
    var guess = slugify(item.name);
    var info = item.type === 'theme' ? urls.themeInfo : urls.pluginInfo;
    return getJson(info(guess)).then(function (r) {
      if (r.status === 200 && r.body && r.body.name && sameName(r.body.name, item.name)) { item.slug = guess; item.slugSource = 'guessed'; return item; }
      if (r.status === 404 && r.body && r.body.error === 'closed' && r.body.name && sameName(r.body.name, item.name)) { item.slug = guess; item.slugSource = 'guessed'; return item; }
      var fallback = r.body && r.body.name && (r.status === 200 || r.body.error === 'closed') ? decodeEntities(r.body.name) : null;
      var search = item.type === 'theme' ? urls.themeSearch : urls.pluginSearch;
      return getJson(search(item.name)).then(function (s) {
        var list = s.body && (s.body.plugins || s.body.themes) || [];
        var hit = list.filter(function (p) { return p && p.name && sameName(p.name, item.name); })[0];
        if (hit) { item.slug = hit.slug; item.slugSource = 'searched'; }
        else if (fallback) { item.slug = guess; item.slugSource = 'guessed'; item.wporgName = fallback; }
        else { item.slug = guess; item.slugSource = 'unverified'; }
        return item;
      });
    }).catch(function () { item.slug = guess; item.slugSource = 'unverified'; return item; });
  }

  // ---------------------------------------------------------------- assessment
  function yearsBetween(dateStr, now) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
    if (!m) return null;
    var d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return (now - d) / (365.25 * 24 * 3600 * 1000);
  }
  function cvssSeverity(v) {
    var imp = v && v.impact;
    if (!imp || Array.isArray(imp)) return null;
    var s = (imp.cvss3 && imp.cvss3.severity) || (imp.cvss && { c: 'critical', h: 'high', m: 'medium', l: 'low', n: 'none' }[imp.cvss.severity]);
    var score = (imp.cvss3 && imp.cvss3.score) || (imp.cvss && imp.cvss.score) || null;
    return s ? { severity: String(s).toLowerCase(), score: score } : null;
  }
  function vulnIds(v) {
    var ids = (v.source || []).map(function (s) { return s.id; }).filter(function (id) { return /^CVE-\d{4}-\d+$/.test(id); });
    return ids.filter(function (x, i) { return ids.indexOf(x) === i; });
  }
  function vulnLinks(v) { return (v.source || []).map(function (s) { return s.link; }).filter(Boolean); }

  function matchVulns(vulnBody, version) {
    var list = vulnBody && vulnBody.data && Array.isArray(vulnBody.data.vulnerability) ? vulnBody.data.vulnerability : [];
    if (!version) return { total: list.length, hits: [] };
    var hits = list.filter(function (v) { return affects(v.operator, version); }).map(function (v) {
      var sev = cvssSeverity(v);
      return {
        title: decodeEntities(v.name), cves: vulnIds(v), links: vulnLinks(v).slice(0, 3),
        severity: sev ? sev.severity : null, score: sev ? sev.score : null,
        fixedIn: fixedIn(v.operator), unfixed: String(v.operator && v.operator.unfixed) === '1'
      };
    });
    return { total: list.length, hits: hits };
  }

  function sevFromCvss(s) { return s === 'critical' ? 'critical' : s === 'high' ? 'high' : s === 'low' ? 'low' : 'medium'; }
  function maxSev(a, b) { return SEV_RANK[a] <= SEV_RANK[b] ? a : b; }
  function highestFix(hits) {
    var f = null;
    hits.forEach(function (h) { if (h.fixedIn && (!f || compareVersions(h.fixedIn, f) > 0)) f = h.fixedIn; });
    return f;
  }
  function describeHits(hits, max) {
    var shown = hits.slice().sort(function (a, b) { return SEV_RANK[sevFromCvss(a.severity)] - SEV_RANK[sevFromCvss(b.severity)]; }).slice(0, max || 3);
    var s = shown.map(function (h) { return (h.cves[0] || h.title) + (h.score ? ' (CVSS ' + h.score + ')' : ''); }).join('; ');
    return s + (hits.length > shown.length ? '; …' : '');
  }

  function assessItem(item, info, vuln, ctx) {
    var L = T[ctx.lang] || T.en, f = [], now = ctx.now;
    var push = function (sev, code, message, fix, extra) { var o = { severity: sev, code: code, message: message, fix: fix }; if (extra) for (var k in extra) o[k] = extra[k]; f.push(o); };
    var inactive = item.status === 'inactive' ? L.inactive : '';

    if (item.slugSource === 'guessed' || item.slugSource === 'searched') push('info', 'slug-matched', L.slugGuessed(item.name, item.slug) + (item.wporgName ? ' (wordpress.org: "' + item.wporgName + '")' : ''), L.slugGuessedFix);
    if (item.slugSource === 'unverified') push('info', 'slug-unverified', L.slugUnknown(item.name), L.slugUnknownFix);

    // wordpress.org directory data
    var latest = null, closed = null, lastUpdated = null, listed = false, failed = [];
    if (info) {
      if (info.status === 200 && info.body && !info.body.error) { listed = true; latest = info.body.version || null; lastUpdated = info.body.last_updated || null; }
      else if (info.body && info.body.error === 'closed') { closed = info.body; }
      else if (info.status === 404 || (info.body && /not found/i.test(info.body.error || ''))) { /* not listed */ }
      else failed.push('wordpress.org');
    }
    if (!latest && item.reportedLatest) latest = item.reportedLatest;

    // vulnerabilities
    var vm = { total: 0, hits: [] };
    if (vuln) {
      if (vuln.status === 200 && vuln.body && vuln.body.error === 0) vm = matchVulns(vuln.body, item.version);
      else failed.push('wpvulnerability.net');
      var vd = vuln.body && vuln.body.data;
      if (!closed && vd && String(vd.closed) === '1' && vd.closed_date) closed = { closed_date: vd.closed_date, reason: vd.closed_reason || 'closed', reason_text: vd.closed_reason || 'closed' };
    }
    if (failed.length) push('medium', 'lookup-failed', L.lookupFailed(failed.join(', ')), L.lookupFailedFix);

    if (!item.version) push('info', 'no-version', L.noVersion, L.noVersionFix);

    var kevIds = [];
    vm.hits.forEach(function (h) { h.kev = h.cves.filter(function (c) { return ctx.kev[c]; }); kevIds = kevIds.concat(h.kev); });
    kevIds = kevIds.filter(function (x, i) { return kevIds.indexOf(x) === i; });
    var target = highestFix(vm.hits);
    if (latest && target && compareVersions(latest, target) > 0) target = latest;
    if (kevIds.length) push('critical', 'kev', L.kev(kevIds) + inactive, L.kevFix(target), { cves: kevIds });

    var unfixed = vm.hits.filter(function (h) { return h.unfixed; });
    var fixable = vm.hits.filter(function (h) { return !h.unfixed; });
    if (unfixed.length) {
      var su = unfixed.reduce(function (s, h) { return maxSev(s, sevFromCvss(h.severity)); }, 'low');
      push(su, 'vuln-unfixed', L.vulnUnfixed(describeHits(unfixed)) + inactive, L.vulnUnfixedFix, { cves: [].concat.apply([], unfixed.map(function (h) { return h.cves; })), links: unfixed[0].links });
    }
    if (fixable.length) {
      var sf = fixable.reduce(function (s, h) { return maxSev(s, sevFromCvss(h.severity)); }, 'low');
      if (kevIds.length && sf === 'critical') sf = 'high'; // the KEV finding already carries "critical"
      push(sf, 'vuln', L.vuln(fixable.length, describeHits(fixable)) + inactive, closed ? L.closedFix : L.vulnFix(target, item.type), { cves: [].concat.apply([], fixable.map(function (h) { return h.cves; })), links: fixable[0].links, fixedIn: target });
    }

    if (closed) {
      var sec = /security/i.test(closed.reason || '');
      push(sec ? 'high' : 'medium', 'closed', sec ? L.closedSec(closed.closed_date) : L.closedOther(closed.closed_date, closed.reason_text || closed.reason), L.closedFix, { reason: closed.reason });
    } else if (listed) {
      if (item.version && latest && compareVersions(item.version, latest) < 0 && !vm.hits.length) push('low', 'update', L.update(item.version, latest), L.updateFix(item.type), { latest: latest });
      var age = yearsBetween(lastUpdated, now);
      if (age !== null && age > ABANDON_YEARS) push('medium', 'abandoned', L.abandoned(String(lastUpdated).slice(0, 10), ABANDON_YEARS), L.abandonedFix, { lastUpdated: lastUpdated });
      else if (age !== null && age > STALE_YEARS) push('low', 'stale', L.stale(String(lastUpdated).slice(0, 10)), L.staleFix, { lastUpdated: lastUpdated });
    } else if (info && !failed.length && item.slugSource !== 'unverified') {
      push('info', 'not-listed', L.notListed, L.notListedFix);
      if (item.version && item.reportedLatest && compareVersions(item.version, item.reportedLatest) < 0 && !vm.hits.length) push('low', 'update', L.update(item.version, item.reportedLatest), L.updateFix(item.type), { latest: item.reportedLatest });
    }

    f.sort(function (a, b) { return SEV_RANK[a.severity] - SEV_RANK[b.severity]; });
    return {
      type: item.type, name: item.name, slug: item.slug, slugSource: item.slugSource, version: item.version, status: item.status,
      latest: latest, lastUpdated: lastUpdated, closed: !!closed, knownVulns: vm.total, affectingVulns: vm.hits.length, findings: f
    };
  }

  function branchOf(v) { var p = String(v).split('.'); return p[0] + '.' + (p[1] || '0'); }
  function assessCore(version, stable, vulnCore, ctx) {
    var L = T[ctx.lang] || T.en, f = [];
    var latest = null, branchLatest = null, status = null;
    if (stable && stable.status === 200 && stable.body) {
      Object.keys(stable.body).forEach(function (v) {
        if (stable.body[v] === 'latest') latest = v;
        if (branchOf(v) === branchOf(version) && stable.body[v] !== 'insecure' && (!branchLatest || compareVersions(v, branchLatest) > 0)) branchLatest = v;
      });
      status = stable.body[version] || null;
      if (!status && /^\d+\.\d+\.0$/.test(version)) status = stable.body[version.replace(/\.0$/, '')] || null;
    } else {
      f.push({ severity: 'medium', code: 'lookup-failed', message: L.lookupFailed('api.wordpress.org'), fix: L.lookupFailedFix });
    }
    var vm = vulnCore && vulnCore.status === 200 && vulnCore.body && vulnCore.body.error === 0 ? vulnCore.body.data && vulnCore.body.data.vulnerability || [] : [];
    var kev = [];
    vm.forEach(function (v) { vulnIds(v).forEach(function (c) { if (ctx.kev[c] && kev.indexOf(c) < 0) kev.push(c); }); });
    if (kev.length && status !== 'latest') f.push({ severity: 'critical', code: 'kev', message: L.coreKev(kev), fix: L.coreKevFix(latest || 'the latest version'), cves: kev });
    if (status === 'insecure') f.push({ severity: 'high', code: 'core-insecure', message: L.coreInsecure(version, latest), fix: L.coreInsecureFix(version, latest, branchLatest), latest: latest });
    else if (status === 'outdated') f.push({ severity: 'low', code: 'core-outdated', message: L.coreOutdated(version, latest), fix: L.coreOutdatedFix(latest), latest: latest });
    else if (!status && latest) f.push({ severity: 'info', code: 'core-unknown', message: L.coreUnknown(version), fix: L.coreUnknownFix });
    f.sort(function (a, b) { return SEV_RANK[a.severity] - SEV_RANK[b.severity]; });
    return { type: 'core', name: 'WordPress', slug: 'wordpress', version: version, status: status, latest: latest, knownVulns: vm.length, findings: f };
  }

  function gradeOf(score) { return score >= 100 ? 'A+' : score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F'; }

  // check(text, {fetch, lang, now, kev, concurrency}) -> Promise<report>
  function check(text, opts) {
    opts = opts || {};
    var fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch.bind(root) : null);
    if (!fetchImpl) return Promise.reject(new Error('No fetch implementation available (Node 18+ required).'));
    var getJson = opts.getJson || makeFetcher(fetchImpl);
    var kevList = opts.kev || (root.VIGIA_KEV && root.VIGIA_KEV.ids) || [];
    var kevMap = {};
    (kevList.ids || kevList).forEach(function (id) { kevMap[id] = 1; });
    var ctx = { lang: opts.lang === 'es' ? 'es' : 'en', now: opts.now ? +new Date(opts.now) : Date.now(), kev: kevMap };
    var parsed = parseInput(text);
    var items = parsed.items;
    var report = { tool: 'vigia', version: VERSION, format: parsed.format, checkedAt: new Date(ctx.now).toISOString(), lang: ctx.lang, kevVersion: opts.kevVersion || (root.VIGIA_KEV && root.VIGIA_KEV.version) || null, results: [] };
    if (!items.length && !parsed.core) {
      report.error = (T[ctx.lang]).noItems; report.score = null; report.grade = null; report.counts = {};
      return Promise.resolve(report);
    }
    var corePromise = parsed.core ? Promise.all([getJson(urls.stableCheck()).catch(function () { return null; }), getJson(urls.vulnCore(parsed.core)).catch(function () { return null; })])
      .then(function (r) { return assessCore(parsed.core, r[0], r[1], ctx); }) : Promise.resolve(null);
    var itemsPromise = pool(items, opts.concurrency || 4, function (item) {
      return resolveSlug(item, getJson).then(function (it) {
        var infoUrl = it.type === 'theme' ? urls.themeInfo(it.slug) : urls.pluginInfo(it.slug);
        var vulnUrl = it.type === 'theme' ? urls.vulnTheme(it.slug) : urls.vulnPlugin(it.slug);
        return Promise.all([getJson(infoUrl).catch(function () { return { status: 0, body: null }; }), getJson(vulnUrl).catch(function () { return { status: 0, body: null }; })])
          .then(function (r) { return assessItem(it, r[0], r[1], ctx); });
      });
    });
    return Promise.all([corePromise, itemsPromise]).then(function (r) {
      if (r[0]) report.results.push(r[0]);
      report.results = report.results.concat(r[1]);
      var counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, score = 100;
      report.results.forEach(function (res) {
        var worst = 'info';
        res.findings.forEach(function (x) { counts[x.severity]++; worst = maxSev(worst, x.severity); });
        res.worst = worst;
        // penalise each item once, by its worst finding, so 30 outdated plugins do not drown one critical
        score -= PENALTY[worst];
      });
      report.counts = counts;
      report.score = Math.max(0, score);
      report.grade = counts.critical ? 'F' : gradeOf(report.score);
      report.results.sort(function (a, b) { return SEV_RANK[a.worst] - SEV_RANK[b.worst] || (a.type === 'core' ? -1 : b.type === 'core' ? 1 : 0); });
      return report;
    });
  }

  // ---------------------------------------------------------------- text output
  function formatText(report) {
    var L = T[report.lang] || T.en;
    if (report.error) return 'Vigía ' + VERSION + '\n' + report.error + '\n';
    var lines = [];
    lines.push('Vigía ' + VERSION + ' — ' + report.results.length + ' ' + L.items + ' ' + L.checked + '   ' + L.grade + ' ' + report.grade + ' (' + report.score + '/100)   CISA KEV ' + (report.kevVersion || '?'));
    lines.push('');
    var any = false;
    report.results.forEach(function (r) {
      var label = r.type === 'core' ? L.core : (r.type === 'theme' ? L.theme : L.plugin);
      var head = label + ': ' + (r.type === 'core' ? 'WordPress' : r.slug || r.name) + ' ' + (r.version || '?') + (r.latest && r.latest !== r.version ? '  → ' + r.latest : '') + (r.status && r.type !== 'core' ? '  [' + r.status + ']' : '');
      var shown = r.findings.filter(function (x) { return x.severity !== 'info' || x.code === 'not-listed' || x.code === 'slug-unverified' || x.code === 'no-version'; });
      if (!shown.length) { lines.push('  ok      ' + head); return; }
      any = true;
      lines.push(head);
      shown.forEach(function (x) {
        lines.push('  [' + (x.severity.toUpperCase() + '      ').slice(0, 8) + '] ' + x.message);
        lines.push('             ' + L.fix + ': ' + x.fix);
      });
    });
    if (!any) lines.push(L.none);
    return lines.join('\n') + '\n';
  }

  var api = {
    VERSION: VERSION, parseInput: parseInput, parseSiteHealth: parseSiteHealth, parseList: parseList,
    compareVersions: compareVersions, affects: affects, fixedIn: fixedIn, slugify: slugify,
    matchVulns: matchVulns, assessItem: assessItem, assessCore: assessCore, check: check,
    formatText: formatText, urls: urls, makeFetcher: makeFetcher, SEVERITIES: SEV
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Vigia = api;

  // ---------------------------------------------------------------- CLI
  if (typeof require === 'function' && typeof module === 'object' && require.main === module) {
    var fs = require('fs'), path = require('path');
    var argv = process.argv.slice(2), o = { lang: 'en', failOn: 'high' }, file = null;
    for (var a = 0; a < argv.length; a++) {
      var arg = argv[a];
      if (arg === '--json') o.json = true;
      else if (arg === '--lang') o.lang = argv[++a];
      else if (arg === '--es') o.lang = 'es';
      else if (arg === '--fail-on') o.failOn = argv[++a];
      else if (arg === '--offline') o.offline = argv[++a];
      else if (arg === '--record') o.record = argv[++a];
      else if (arg === '--now') o.now = argv[++a];
      else if (arg === '--kev-live') o.kevLive = true;
      else if (arg === '-h' || arg === '--help') { o.help = true; }
      else if (arg === '-v' || arg === '--version') { console.log(VERSION); process.exit(0); }
      else if (arg[0] === '-' && arg !== '-') { console.error('Unknown option ' + arg); process.exit(2); }
      else file = arg;
    }
    if (o.help) {
      console.log([
        'Vigía ' + VERSION + ' — WordPress plugin, theme and core vulnerability check for small businesses',
        '',
        'Usage: node vigia.js [file|-] [--lang es] [--json] [--fail-on critical|high|medium|low|never] [--kev-live]',
        '',
        'Input (file or stdin), any of:',
        '  Tools → Site Health → Info → "Copy site info to clipboard"',
        '  wp plugin list   (table, --format=csv or --format=json); add a line "themes:" before `wp theme list`',
        '  wp core version, or lines like "wordpress 6.8.2", "contact-form-7 5.9.3", "theme astra 4.6.1"',
        '',
        'Only slugs and the core version are sent (to api.wordpress.org and wpvulnerability.net).',
        'Exit codes: 0 ok, 1 findings at or above --fail-on, 2 usage or network error.'
      ].join('\n'));
      process.exit(0);
    }
    var input;
    try { input = !file || file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8'); }
    catch (e) { console.error('Cannot read input: ' + e.message); process.exit(2); }

    var recorded = {};
    var fetchImpl;
    if (o.offline) {
      var store = JSON.parse(fs.readFileSync(o.offline, 'utf8'));
      fetchImpl = function (url) {
        var hit = store[url];
        if (!hit) return Promise.resolve({ status: 599, text: function () { return Promise.resolve(''); } });
        return Promise.resolve({ status: hit.status, text: function () { return Promise.resolve(JSON.stringify(hit.body)); } });
      };
    } else {
      fetchImpl = function (url, init) {
        return fetch(url, Object.assign({}, init, { headers: { accept: 'application/json', 'user-agent': 'vigia/' + VERSION + ' (+https://github.com/freyesperales/dev-experiments-365)' } }))
          .then(function (r) {
            return r.text().then(function (t) {
              if (o.record) { var b = null; try { b = JSON.parse(t); } catch (e) { } recorded[url] = { status: r.status, body: b }; }
              return { status: r.status, text: function () { return Promise.resolve(t); } };
            });
          });
      };
    }
    var kevSnap = require(path.join(__dirname, 'kev-snapshot.js'));
    var kevP = o.kevLive && !o.offline
      ? fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json').then(function (r) { return r.json(); })
        .then(function (d) { return { ids: d.vulnerabilities.map(function (v) { return v.cveID; }), version: d.catalogVersion + ' (live)' }; })
        .catch(function () { return kevSnap; })
      : Promise.resolve(kevSnap);
    kevP.then(function (kev) {
      return check(input, { fetch: fetchImpl, lang: o.lang, now: o.now, kev: kev.ids, kevVersion: kev.version });
    }).then(function (report) {
      if (o.record) fs.writeFileSync(o.record, JSON.stringify(recorded, null, 1));
      process.stdout.write(o.json ? JSON.stringify(report, null, 2) + '\n' : formatText(report));
      if (report.error) process.exit(2);
      var failed = report.results.some(function (r) { return r.findings.some(function (x) { return x.code === 'lookup-failed'; }); });
      var limit = o.failOn === 'never' ? -1 : SEV_RANK[o.failOn] === undefined ? 1 : SEV_RANK[o.failOn];
      var worst = Math.min.apply(null, report.results.map(function (r) { return SEV_RANK[r.worst]; }).concat([4]));
      process.exit(limit >= 0 && worst <= limit ? 1 : failed ? 2 : 0);
    }).catch(function (e) { console.error('Error: ' + (e && e.message || e)); process.exit(2); });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
