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

const TIME_UNITS = {
  action: ['action', 'actions'],
  bonus: ['bonus action', 'bonus actions'],
  reaction: ['reaction', 'reactions'],
  minute: ['minute', 'minutes'],
  hour: ['hour', 'hours'],
  day: ['day', 'days'],
  second: ['second', 'seconds'],
  round: ['round', 'rounds']
};

function unitWords(unit, n) {
  const pair = TIME_UNITS[unit];
  if (!pair) return unit;
  return n > 1 ? pair[1] : pair[0];
}

/* The casting time, short for the card and whole for the full page: a
   reaction carries the trigger it waits for. */
function formatTime(time) {
  if (!Array.isArray(time)) return { short: '', full: '' };
  const short = time.map((t) => {
    const unit = String(t.unit || '');
    const n = t.number || 1;
    if (unit === 'action') return n > 1 ? n + ' actions' : 'Action';
    if (unit === 'bonus') return n > 1 ? n + ' bonus actions' : 'Bonus Action';
    if (unit === 'reaction') return n > 1 ? n + ' reactions' : 'Reaction';
    return n + ' ' + unitWords(unit, n);
  }).join(' or ');
  const full = time.map((t) => {
    const unit = String(t.unit || '');
    const n = t.number || 1;
    const one = n + ' ' + unitWords(unit, n);
    return t.condition ? one + ', ' + clean(t.condition) : one;
  }).join(' or ');
  return { short: short, full: full };
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

/* The classes the app knows: the eight of the 2024 handbook, and the
   hexblade, the warlock subclass the character plays. */
const CLASSES = ['Sorcerer', 'Warlock', 'Wizard', 'Bard', 'Cleric', 'Druid', 'Ranger', 'Paladin'];
const SUBCLASSES = ['Hexblade'];

/* Who can learn a spell: the classes that have it, and the subclasses that
   add it. */
function sourcesFor(name) {
  const entry = lookup.xphb[String(name).toLowerCase()];
  const out = [];
  if (!entry) return out;
  if (entry.class && entry.class.XPHB) {
    for (const c of CLASSES) if (entry.class.XPHB[c]) out.push(c);
  }
  if (entry.subclass && entry.subclass.XPHB) {
    for (const cls of Object.keys(entry.subclass.XPHB)) {
      const bySource = entry.subclass.XPHB[cls];
      for (const src of Object.keys(bySource)) {
        for (const sub of Object.keys(bySource[src])) {
          if (SUBCLASSES.indexOf(sub) >= 0 && out.indexOf(sub) < 0) out.push(sub);
        }
      }
    }
  }
  return out;
}

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
  const time = formatTime(spell.time);
  return {
    name: spell.name,
    level: spell.level,
    school: spell.school || '',
    time: time.short,
    timeFull: time.full,
    range: formatRange(spell.range),
    duration: formatDuration(spell.duration),
    components: ['v', 's', 'm'].filter((k) => spell.components && spell.components[k]).map((k) => k.toUpperCase()).join(''),
    ritual: (spell.miscTags || []).includes('RITUAL'),
    /* In the 2024 data the concentration flag sits on the duration. */
    concentration: !!(spell.concentration || (Array.isArray(spell.duration) && spell.duration.some((d) => d && d.concentration))),
    source: sourceTag || '',
    classes: [],
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

/* every spell the classes can learn, and the classes of each one */
for (const spell of bySource.XPHB) {
  const classes = sourcesFor(spell.name);
  if (!classes.length) continue;
  if (book.has(spell.name)) {
    const rec = book.get(spell.name);
    rec.classes = classes;
    if (!rec.source) rec.source = classes[0];
    continue;
  }
  const rec = spellRecord(spell, classes[0]);
  rec.classes = classes;
  book.set(spell.name, rec);
}

/* The same class, written two ways on the sheet: the hexblade's second
   level list is written "hex", and the izzet engineer is written both
   ways. */
const SOURCE_ALIAS = { 'izzet': 'Izzet engineer', 'high elf': 'elf', 'hex': 'Hexblade' };
function canonSource(source) {
  const name = String(source || '').trim();
  return SOURCE_ALIAS[name.toLowerCase()] || name;
}

/* the source the sheet gave a spell joins the classes that can learn it */
for (const row of seed) {
  const rec = book.get(row.name);
  if (!rec) continue;
  const source = canonSource(row.source);
  if (rec.classes.indexOf(source) < 0) rec.classes.push(source);
}

const spells = [...book.values()].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

writeFileSync(
  resolve(root, 'data', 'spellbook.json'),
  JSON.stringify({
    edition: "2024 Player's Handbook, every spell the classes can learn, plus the character's own sheet",
    source: 'https://5e.tools/spells.html',
    fetched: new Date().toISOString().slice(0, 10),
    sheet: 'data/spell-sheet.csv',
    seed: seed,
    spells: spells
  }, null, 2) + '\n',
  'utf8'
);

/* ---------- the features ---------- */

/* The features the character tracks. The short text, the uses and the
   recovery are Mandal's own table of 2026-10-22; the long text is pulled
   from 5e.tools. */
const FEATURE_SPECS = [
  { key: 'innateSorcery', name: 'Innate sorcery', source: 'Sorcerer', active: true, uses: 2, recovery: 'long', action: 'B', duration: '1 min', desc: 'DC +1, advantage attack w/ spells sorcerer', from: { file: 'class-sorcerer', list: 'classFeature', name: 'Innate Sorcery', source: 'XPHB' } },
  { key: 'metamagic', name: 'Metamagic', source: 'Sorcerer', active: true, uses: 8, recovery: 'long', action: '', duration: '', desc: 'Heighten + quicken', hidden: true, from: { file: 'class-sorcerer', list: 'classFeature', name: 'Metamagic', source: 'XPHB' } },
  { key: 'tidesOfChaos', name: 'Tides of chaos', source: 'Wild Magic', active: true, uses: 1, recovery: 'long', action: '', duration: '', desc: 'Advantage, on spell slot: roll surge to refund', from: { file: 'class-sorcerer', list: 'subclassFeature', name: 'Tides of Chaos', source: 'XPHB' } },
  { key: 'sorcerousRest', name: 'Sorcerous rest', source: 'Sorcerer', active: true, uses: 1, recovery: 'long', action: '', duration: '', desc: 'Regain 1/2 sorc level SP', hidden: true, from: { file: 'class-sorcerer', list: 'classFeature', name: 'Sorcerous Restoration', source: 'XPHB' } },
  { key: 'bendLuck', name: 'Bend luck', source: 'Wild Magic', active: true, uses: 0, recovery: 'special', cost: 'sp', action: 'R', duration: '', desc: 'Creature I can see rolls D20: +/-1d4', from: { file: 'class-sorcerer', list: 'subclassFeature', name: 'Bend Luck', source: 'XPHB' } },
  { key: 'magicalCunning', name: 'Magical Cunning', source: 'Warlock', active: true, uses: 1, recovery: 'long', action: '', duration: '1 min', desc: 'Regain 1 spell slot', hidden: true, from: { file: 'class-warlock', list: 'classFeature', name: 'Magical Cunning', source: 'XPHB' } },
  { key: 'hexCurse', name: 'Hexblade curse', source: 'Hexblade', active: true, uses: 1, recovery: 'short', action: 'B', duration: '1 min', desc: '+PRO damage, crit 19+, regain CHA+lvl hp', from: { file: 'class-warlock', list: 'subclassFeature', name: "Hexblade's Curse", source: 'XGE' } },
  { key: 'elvenLineageI', name: 'Elven Lineage I', source: 'High Elf', active: true, uses: 1, recovery: 'long', action: '', duration: '', desc: 'Detect Magic for free', from: { file: 'races', name: 'Elf', source: 'XPHB', entry: 'Elven Lineage' } },
  { key: 'elvenLineageII', name: 'Elven Lineage II', source: 'High Elf', active: true, uses: 1, recovery: 'long', action: '', duration: '', desc: 'Misty Step for free', from: { file: 'races', name: 'Elf', source: 'XPHB', entry: 'Elven Lineage' } },

  { key: 'sorceryIncarnate', name: 'Sorc incarnate', source: 'Sorcerer', active: false, desc: 'Spend 2 SP: regain innate sorcery', from: { file: 'class-sorcerer', list: 'classFeature', name: 'Sorcery Incarnate', source: 'XPHB' } },
  { key: 'devilsSight', name: "Devil's sight", source: 'Warlock', active: false, desc: 'Darkvision 120 ft, see darkness', from: { file: 'optionalfeatures', name: "Devil's Sight", source: 'PHB' } },
  { key: 'repellingBlast', name: 'Repelling blast', source: 'Warlock', active: false, desc: 'Hit: push 10 feet straight away from you', from: { file: 'optionalfeatures', name: 'Repelling Blast', source: 'PHB' } },
  { key: 'agonisingBlast', name: 'Agonising blast', source: 'Warlock', active: false, desc: '+CHA damage', from: { file: 'optionalfeatures', name: 'Agonizing Blast', source: 'PHB' } },
  { key: 'wildSurge', name: 'Wild surge', source: 'Wild Magic', active: false, desc: 'Every spell slot: roll d20, 20 = roll surge', from: { file: 'class-sorcerer', list: 'subclassFeature', name: 'Wild Magic Surge', source: 'XPHB' } },
  { key: 'hexWarrior', name: 'Hex Warrior', source: 'Hexblade', active: false, desc: 'Linked weapon attacks with CHA', from: { file: 'class-warlock', list: 'subclassFeature', name: 'Hex Warrior', source: 'XGE' } },
  { key: 'trance', name: 'Trance', source: 'Elf', active: false, desc: 'Sleep 4h, conscious', from: { file: 'races', name: 'Elf', source: 'XPHB', entry: 'Trance' } },
  { key: 'feyAncestry', name: 'Fey Ancestry', source: 'Elf', active: false, desc: 'Advantage vs Charm', from: { file: 'races', name: 'Elf', source: 'XPHB', entry: 'Fey Ancestry' } },
  { key: 'elvenAccuracy', name: 'Elven Accuracy', source: 'Feat', active: false, desc: 'Attacks roll 3d20 on advantage', from: { file: 'feats', name: 'Elven Accuracy' } }
];

function classFile(name) {
  return JSON.parse(readFileSync(download(BASE + 'class/class-' + name + '.json', 'class-' + name + '.json'), 'utf8'));
}

function featureEntries(spec) {
  if (spec.file === 'class-sorcerer' || spec.file === 'class-warlock') {
    const data = spec.file === 'class-sorcerer' ? classData : classFile('warlock');
    const list = data[spec.list] || [];
    const hit = list.find((f) => f.name === spec.name && f.source === spec.source);
    return hit ? hit.entries : null;
  }
  if (spec.file === 'races') {
    const races = JSON.parse(readFileSync(download(BASE + 'races.json', 'races.json'), 'utf8'));
    const race = (races.race || []).find((r) => r.name === spec.name && r.source === spec.source);
    if (!race) return null;
    if (!spec.entry) return race.entries;
    let found = null;
    const walk = (n) => {
      if (found) return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n && typeof n === 'object') {
        if (n.name === spec.entry && n.type === 'entries') { found = n.entries; return; }
        for (const k of Object.keys(n)) walk(n[k]);
      }
    };
    walk(race.entries);
    return found;
  }
  if (spec.file === 'feats') {
    const feats = JSON.parse(readFileSync(download(BASE + 'feats.json', 'feats.json'), 'utf8'));
    const hit = (feats.feat || []).find((f) => f.name === spec.name);
    return hit ? hit.entries : null;
  }
  if (spec.file === 'optionalfeatures') {
    const opt = JSON.parse(readFileSync(download(BASE + 'optionalfeatures.json', 'optionalfeatures.json'), 'utf8'));
    const hit = (opt.optionalfeature || []).find((f) => f.name === spec.name && f.source === spec.source);
    return hit ? hit.entries : null;
  }
  return null;
}

const featureList = [];
for (const spec of FEATURE_SPECS) {
  const entries = featureEntries(spec.from);
  if (!entries) { console.log('feature not found: ' + spec.name); continue; }
  featureList.push({
    key: spec.key,
    name: spec.name,
    source: spec.source,
    active: !!spec.active,
    uses: spec.uses || 0,
    recovery: spec.recovery || 'passive',
    cost: spec.cost || '',
    hidden: !!spec.hidden,
    action: spec.action || '',
    duration: spec.duration || '',
    desc: spec.desc || '',
    blocks: blocksFrom(entries)
  });
}

writeFileSync(
  resolve(root, 'data', 'features.json'),
  JSON.stringify({
    edition: "The character's own table of 2026-10-22, with the long text from 5e.tools",
    source: 'https://5e.tools',
    fetched: new Date().toISOString().slice(0, 10),
    features: featureList
  }, null, 2) + '\n',
  'utf8'
);
console.log('wrote ' + featureList.length + ' features');

const byLevel = {};
for (const s of seed) (byLevel[s.level] = byLevel[s.level] || []).push(s.name + ' (' + s.source + ')');
for (const lv of Object.keys(byLevel).sort((a, b) => a - b)) console.log('level ' + lv + ': ' + byLevel[lv].join(', '));
console.log('wrote ' + spells.length + ' spells, ' + seed.length + ' of them on the sheet');
