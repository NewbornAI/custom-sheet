/**
 * Pulls the 2024 Player's Handbook data this app needs from 5e.tools and writes
 * two files: the wild magic surge table, and the sorcerer's spell list.
 *
 *   node tools/fetch-5e-data.mjs
 *
 * The raw upstream files are downloaded into tools/.5e-cache/ and are not in git.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(root, 'tools', '.5e-cache');
mkdirSync(cache, { recursive: true });

const FILES = {
  class: 'https://5e.tools/data/class/class-sorcerer.json',
  spells: 'https://5e.tools/data/spells/spells-xphb.json',
  lookup: 'https://5e.tools/data/generated/gendata-spell-source-lookup.json'
};

function download(url, file) {
  const out = resolve(cache, file);
  if (existsSync(out) && readFileSync(out).length > 1000) return out;
  console.log('downloading ' + url);
  const r = spawnSync('curl.exe', ['-sSL', '--fail', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', '-o', out, url], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('curl failed for ' + url);
  return out;
}

const classData = JSON.parse(readFileSync(download(FILES.class, 'class-sorcerer.json'), 'utf8'));
const spellData = JSON.parse(readFileSync(download(FILES.spells, 'spells-xphb.json'), 'utf8')).spell;
const lookup = JSON.parse(readFileSync(download(FILES.lookup, 'gendata-spell-source-lookup.json'), 'utf8'));

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

function entriesToText(entries) {
  if (!entries) return '';
  const parts = Array.isArray(entries) ? entries : [entries];
  const out = [];
  for (const e of parts) {
    if (typeof e === 'string') { out.push(clean(e)); continue; }
    if (e && e.name) { out.push(clean(e.name) + ':'); continue; }
    if (e && e.entries) out.push(entriesToText(e.entries));
  }
  return out.filter(Boolean).join(' ');
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
  const amt = d && d.amount ? d.amount + ' ' + (d.type === 'foot' ? 'feet' : d.type) : '';
  switch (range.type) {
    case 'point': return amt || 'Special';
    case 'self': return d ? 'Self (' + amt + ')' : 'Self';
    case 'sphere': return amt ? amt + ' radius' : 'Sphere';
    case 'cone': return amt ? amt + ' cone' : 'Cone';
    case 'line': return amt ? amt + ' line' : 'Line';
    case 'special': return amt || 'Special';
    default: return amt || 'Special';
  }
}

function formatDuration(duration) {
  if (!Array.isArray(duration)) return '';
  return duration.map((d) => {
    if (d.type === 'instant') return 'Instantaneous';
    if (d.type === 'permanent') return 'Permanent';
    if (d.type === 'special') return 'Special';
    if (d.duration) {
      const n = d.duration.amount ? d.duration.amount + ' ' : '';
      return n + String(d.duration.type || '');
    }
    return String(d.type || '');
  }).join(' or ');
}

/* ---------- the surge table ---------- */

const surgeFeature = classData.subclassFeature.find(
  (f) => f.classSource === 'XPHB' && f.name === 'Wild Magic Surge'
);
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
  surgeRows.push({ from, to, text: entriesToText(row[1]) });
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

/* ---------- the sorcerer's spells ---------- */

const classLookup = lookup.xphb || lookup.XPHB || {};
const sorcererSpells = [];
for (const spell of spellData) {
  const entry = classLookup[spell.name.toLowerCase()];
  if (!entry || !entry.class || !entry.class.XPHB) continue;
  if (!entry.class.XPHB.Sorcerer && !entry.class.XPHB.Warlock) continue;
  sorcererSpells.push({
    name: spell.name,
    level: spell.level,
    school: spell.school || '',
    time: formatTime(spell.time),
    range: formatRange(spell.range),
    duration: formatDuration(spell.duration),
    components: ['v', 's', 'm'].filter((k) => spell.components && spell.components[k]).map((k) => k.toUpperCase()).join(''),
    ritual: !!(spell.miscTags || []).includes('RITUAL'),
    concentration: !!spell.concentration,
    description: entriesToText(spell.entries)
  });
}
sorcererSpells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
const byLevel = {};
for (const s of sorcererSpells) (byLevel[s.level] = byLevel[s.level] || []).push(s.name);

writeFileSync(
  resolve(root, 'data', 'spells-sorcerer-xphb.json'),
  JSON.stringify({
    edition: "2024 Player's Handbook, the Sorcerer spell list",
    source: 'https://5e.tools/spells.html',
    fetched: new Date().toISOString().slice(0, 10),
    spells: sorcererSpells
  }, null, 2) + '\n',
  'utf8'
);
for (const lv of Object.keys(byLevel).sort((a, b) => a - b)) {
  console.log('level ' + lv + ': ' + byLevel[lv].length + ' spells');
}
console.log('wrote ' + sorcererSpells.length + ' sorcerer spells');
