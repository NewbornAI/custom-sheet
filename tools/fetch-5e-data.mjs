/**
 * Pulls the 2024 Player's Handbook data this app needs from 5e.tools and writes
 * two files: the wild magic surge table, and the spell book.
 *
 *   node tools/fetch-5e-data.mjs
 *
 * The spell book is built from the character's own sheet (data/spell-sheet.csv)
 * plus the sorcerer and warlock lists, so the app can offer a grimoire.
 * The raw upstream files are downloaded into tools/.5e-cache/ and are not in git.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(root, 'tools', '.5e-cache');
mkdirSync(cache, { recursive: true });

const BASE = 'https://5e.tools/data/';

function download(url, file) {
  const out = resolve(cache, file);
  if (existsSync(out) && readFileSync(out).length > 1000) return out;
  console.log('downloading ' + url);
  const r = spawnSync('curl.exe', ['-sSL', '--fail', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', '-o', out, url], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('curl failed for ' + url);
  return out;
}

/* ---------- the sheet ---------- */

function parseSheet(csv) {
  const rows = [];
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { quoted = !quoted; continue; }
      if (ch === ',' && !quoted) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    if (cells.length < 3) continue;
    if (cells[0].trim().toLowerCase() === 'source') continue;
    const source = cells[0].trim();
    const level = Number(cells[1]);
    if (!source || !Number.isFinite(level) || level < 0) continue;
    for (const raw of cells.slice(2).join(',').split(',')) {
      const item = raw.trim();
      if (!item) continue;
      let name = item;
      let hint = null;
      const m = item.match(/^https?:\/\/[^#]*#(.+)$/);
      if (m) {
        const bits = decodeURIComponent(m[1]).split('_');
        hint = bits.pop();
        name = bits.join('_');
      }
      rows.push({ name: name, level: level, source: source, hint: hint });
    }
  }
  return rows;
}

/* ---------- 5e.tools markup ---------- */

const ABILITIES = { DEX: 'Dexterity', STR: 'Strength', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' };

function clean(text) {
  if (typeof text !== 'string') return '';
  let out = text;
  out = out.replace(/\{@filter ([^}]*)}/g, '');
  out = out.replace(/\{@([a-zA-Z]+)\s+([^}|]*)(?:\|[^}]*)?}/g, (m, tag, body) => {
    const b = body.trim();
    if (tag === 'actSave') {
      const abil = b.split(',').map((a) => ABILITIES[a.trim()] || a.trim()).join(' or ');
      return abil + ' saving throw';
    }
    if (tag === 'hit') return 'on a hit, ' + b;
    if (tag === 'recharge') return 'recharges on a ' + b;
    if (tag === 'atk') return b.replace(/^(\w)(\w*)/, (x, a, r) => a.toUpperCase() + r) + ' attack';
    if (tag === 'dc') return 'DC ' + b;
    if (tag === 'note') return 'Note: ' + b;
    if (tag === 'i' || tag === 'b' || tag === 'highlight') return b;
    return b;
  });
  out = out.replace(/\{@[a-zA-Z]+\s*}/g, '');
  return out.replace(/\s+/g, ' ').trim();
}

function textOf(entries) {
  if (typeof entries === 'string') return clean(entries);
  if (Array.isArray(entries)) return entries.map(textOf).filter(Boolean).join(' ');
  if (entries && typeof entries === 'object') {
    if (entries.entries) return textOf(entries.entries);
    if (entries.text) return clean(entries.text);
    if (entries.name) return clean(entries.name);
  }
  return '';
}

/* A table cell can be a die roll rather than a word. */
function cellText(cell) {
  if (typeof cell === 'string') return clean(cell);
  if (!cell || typeof cell !== 'object') return '';
  if (cell.type === 'cell' && cell.roll) {
    const r = cell.roll;
    if (r.exact !== undefined) return String(r.exact);
    if (r.min !== undefined && r.max !== undefined) return r.min + '-' + r.max;
    if (r.dice) return clean(String(r.dice) + (r.faces ? 'd' + r.faces : ''));
    if (r.note) return clean(r.note);
  }
  return textOf(cell);
}

function blocksFrom(entries) {
  const out = [];
  for (const e of entries || []) {
    if (typeof e === 'string') {
      const t = clean(e);
      if (t) out.push({ t: 'p', text: t });
      continue;
    }
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'entries' || e.type === 'section' || e.type === 'subsection') {
      if (e.name) out.push({ t: 'h', text: clean(e.name) });
      out.push(...blocksFrom(e.entries));
      continue;
    }
    if (e.type === 'table') {
      out.push({
        t: 'table',
        caption: clean(e.caption || ''),
        head: (e.colLabels || []).map((h) => clean(h)),
        rows: (e.rows || []).map((r) => (Array.isArray(r) ? r : [r]).map(cellText))
      });
      continue;
    }
    if (e.type === 'list') {
      const items = (e.items || []).map((i) => (typeof i === 'string' ? clean(i) : textOf(i))).filter(Boolean);
      if (items.length) out.push({ t: 'list', items });
      continue;
    }
    if (e.type === 'inset') {
      const t = clean(e.title || 'Read aloud') + ': ' + textOf(e.entries);
      if (t) out.push({ t: 'p', text: t });
      continue;
    }
    if (e.type && e.type.startsWith('ability')) {
      const attrs = (e.attributes || []).map((a) => clean(a)).join(' or ');
      const bits = [];
      if (attrs) bits.push(attrs + ' saving throw');
      if (e.action) bits.push(clean(e.action));
      if (e.dc) bits.push('DC ' + e.dc);
      if (e.atk) bits.push('attack');
      const t = bits.join(', ');
      if (t) out.push({ t: 'p', text: t });
      continue;
    }
    if (e.entries) { out.push(...blocksFrom(e.entries)); continue; }
    if (e.text) { out.push({ t: 'p', text: clean(e.text) }); continue; }
    if (e.name) { out.push({ t: 'h', text: clean(e.name) }); }
  }
  return out;
}

/* ---------- formatters ---------- */

function formatTime(time) {
  if (!Array.isArray(time)) return '';
  return time.map((t) => {
    const unit = String(t.unit || '');
    const n = t.number || 1;
    if (unit === 'action') return n > 1 ? n + ' Actions' : 'Action';
    if (unit === 'bonus') return n > 1 ? n + ' Bonus Actions' : 'Bonus Action';
    if (unit === 'reaction') return n > 1 ? n + ' Reactions' : 'Reaction';
    if (unit === 'minute') return n + (n > 1 ? ' minutes' : ' minute');
    if (unit === 'hour') return n + (n > 1 ? ' hours' : ' hour');
    if (unit === 'day') return n + (n > 1 ? ' days' : ' day');
    return (n > 1 ? n + ' ' : '') + unit;
  }).join(' or ');
}

function formatRange(range) {
  if (!range) return '';
  const d = range.distance;
  if (d && d.type === 'self') return 'Self' + (d.amount ? ' (' + d.amount + ' feet)' : '');
  if (d && d.type === 'touch') return 'Touch';
  const amt = d && d.amount ? d.amount + ' ' + (d.type === 'foot' ? 'feet' : d.type) : '';
  switch (range.type) {
    case 'point': return amt || 'Special';
    case 'self': return d ? 'Self (' + amt + ')' : 'Self';
    case 'sphere': return amt ? amt + ' radius' : 'Sphere';
    case 'cone': return amt ? amt + ' cone' : 'Cone';
    case 'line': return amt ? amt + ' line' : 'Line';
    default: return amt || 'Special';
  }
}

function plural(unit, n) {
  if (n === 1) return unit;
  if (unit === 'minute') return 'minutes';
  if (unit === 'hour') return 'hours';
  if (unit === 'day') return 'days';
  if (unit === 'second') return 'seconds';
  if (unit === 'round') return 'rounds';
  return unit ? unit + 's' : unit;
}

function formatDuration(duration) {
  if (!Array.isArray(duration)) return '';
  return duration.map((d) => {
    if (d.type === 'instant') return 'Instantaneous';
    if (d.type === 'permanent') return 'Permanent';
    if (d.type === 'special') return 'Special';
    if (d.duration) {
      const amount = d.duration.amount;
      const unit = String(d.duration.type || '');
      return amount ? amount + ' ' + plural(unit, amount) : unit;
    }
    return String(d.type || '');
  }).join(' or ');
}

/* ---------- the surge table ---------- */

const classData = JSON.parse(readFileSync(download(BASE + 'class/class-sorcerer.json', 'class-sorcerer.json'), 'utf8'));
const surgeFeature = classData.subclassFeature.find((f) => f.classSource === 'XPHB' && f.name === 'Wild Magic Surge');
if (!surgeFeature) throw new Error('the Wild Magic Surge feature was not found');
const table = surgeFeature.entries.find((e) => e && e.type === 'table');
if (!table) throw new Error('the surge table was not found');

const surgeRows = [];
for (const row of table.rows) {
  const range = String(row[0]).replace(/[–—]/g, '-').trim();
  const m = range.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) throw new Error('bad range: ' + row[0]);
  let from = Number(m[1]);
  let to = Number(m[2]);
  if (to < from) to = 100;
  surgeRows.push({ from, to, text: textOf(row[1]) });
}
surgeRows.sort((a, b) => a.from - b.from);
let covered = 0;
for (const r of surgeRows) {
  if (r.from !== covered + 1) throw new Error('gap in the surge table at ' + r.from);
  covered = r.to;
}
if (covered !== 100) throw new Error('the surge table covers ' + covered);

writeFileSync(
  resolve(root, 'data', 'wild-magic-surge-xphb.json'),
  JSON.stringify({
    name: 'Wild Magic Surge',
    edition: "2024 Player's Handbook, the Wild Magic Surge table",
    source: 'https://5e.tools/classes.html#sorcerer_xphb',
    fetched: new Date().toISOString().slice(0, 10),
    rows: surgeRows
  }, null, 2) + '\n',
  'utf8'
);
console.log('surge table: ' + surgeRows.length + ' rows covering 1-100');

/* ---------- the spell data ---------- */

const SOURCES = ['XPHB', 'PHB', 'XGE', 'AU', 'SCC'];
const files = { XPHB: 'spells/spells-xphb.json', PHB: 'spells/spells-phb.json', XGE: 'spells/spells-xge.json', AU: 'spells/spells-au.json', SCC: 'spells/spells-scc.json' };
const bySource = {};
for (const src of SOURCES) {
  const list = JSON.parse(readFileSync(download(BASE + files[src], 'spells-' + src.toLowerCase() + '.json'), 'utf8')).spell;
  bySource[src] = list;
}

const lookup = JSON.parse(readFileSync(download(BASE + 'generated/gendata-spell-source-lookup.json', 'gendata-spell-source-lookup.json'), 'utf8'));

function norm(name) { return String(name).toLowerCase().replace(/[^a-z0-9]/g, ''); }

const index = {};
for (const src of SOURCES) {
  for (const s of bySource[src]) {
    const key = norm(s.name);
    if (!index[key]) index[key] = [];
    index[key].push(Object.assign({}, s, { _src: src }));
  }
}

function spellRecord(spell, sourceTag) {
  return {
    name: spell.name,
    level: spell.level,
    school: spell.school || '',
    time: formatTime(spell.time),
    range: formatRange(spell.range),
    duration: formatDuration(spell.duration),
    components: ['v', 's', 'm'].filter((k) => spell.components && spell.components[k]).map((k) => k.toUpperCase()).join(''),
    ritual: (spell.miscTags || []).includes('RITUAL'),
    /* In the 2024 data the concentration flag sits on the duration. */
    concentration: !!(spell.concentration || (Array.isArray(spell.duration) && spell.duration.some((d) => d && d.concentration))),
    source: sourceTag || '',
    blocks: blocksFrom(spell.entries).concat(blocksFrom(spell.entriesHigherLevel))
  };
}

const sheet = parseSheet(readFileSync(resolve(root, 'data', 'spell-sheet.csv'), 'utf8'));
const seed = [];
const book = new Map();

for (const row of sheet) {
  const key = norm(row.name);
  const candidates = index[key] || [];
  const pick = candidates.find((c) => c._src === row.hint) || candidates.find((c) => c._src === 'XPHB') || candidates[0];
  if (!pick) { console.log('not found: ' + row.name + ' (' + row.source + ')'); continue; }
  seed.push({ name: pick.name, level: row.level, source: row.source });
  if (!book.has(pick.name)) book.set(pick.name, spellRecord(pick, row.source));
}

/* the class lists, so the grimoire can offer more */
const classLookup = lookup.xphb || {};
for (const spell of bySource.XPHB) {
  const entry = classLookup[spell.name.toLowerCase()];
  if (!entry || !entry.class || !entry.class.XPHB) continue;
  const classes = Object.keys(entry.class.XPHB).filter((c) => entry.class.XPHB[c] && (c === 'Sorcerer' || c === 'Warlock'));
  if (!classes.length) continue;
  if (book.has(spell.name)) {
    const rec = book.get(spell.name);
    if (!rec.source) rec.source = classes[0];
    continue;
  }
  book.set(spell.name, spellRecord(spell, classes[0]));
}

const spells = [...book.values()].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

writeFileSync(
  resolve(root, 'data', 'spellbook.json'),
  JSON.stringify({
    edition: "2024 Player's Handbook, the character's own sheet plus the sorcerer and warlock lists",
    source: 'https://5e.tools/spells.html',
    fetched: new Date().toISOString().slice(0, 10),
    sheet: 'data/spell-sheet.csv',
    seed: seed,
    spells: spells
  }, null, 2) + '\n',
  'utf8'
);

const byLevel = {};
for (const s of seed) (byLevel[s.level] = byLevel[s.level] || []).push(s.name + ' (' + s.source + ')');
for (const lv of Object.keys(byLevel).sort((a, b) => a - b)) console.log('level ' + lv + ': ' + byLevel[lv].join(', '));
console.log('wrote ' + spells.length + ' spells, ' + seed.length + ' of them on the sheet');
