/**
 * The stat blocks of the bestiary.
 *
 * The books come from 5e.tools and sit in the cache. The fetcher shapes the
 * creatures the app names into data/bestiary.json, and the server that
 * holds the whole bestiary shapes the others the same way, so a creature
 * looks the same wherever it comes from.
 *
 * A block may come in forms: the celestial spirit is an avenger or a
 * defender, the same creature with another armour class and another
 * attack. The forms are the versions of the block upstream, and the card
 * carries the one that was chosen.
 *
 * The numbers the book writes as words are read here too: the armour class
 * of a spirit is the level of the calling spell, and the damage of an
 * attack grows with the slot that paid for it.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { creatureText, attackOf } from './markup.mjs';

/* The books, in the order a name without a book is looked up. The 2024
   handbook comes first, then the 2024 monsters, then the old ones. */
export const BOOKS = ['xphb', 'xmm', 'mm', 'au', 'tce', 'phb', 'xge', 'ftd', 'skt', 'mpmm', 'vgm', 'scc'];

/* Every monster of every book, by the lowercased name. A name can sit in
   more than one book, so the entry holds them all. */
export function loadBestiary(cacheDir) {
  const all = {};
  BOOKS.forEach((book) => {
    const file = resolve(cacheDir, 'bestiary-' + book + '.json');
    if (!existsSync(file)) return;
    const json = JSON.parse(readFileSync(file, 'utf8'));
    (json.monster || []).forEach((m) => {
      const key = String(m.name || '').toLowerCase();
      if (!key) return;
      if (!all[key]) all[key] = [];
      all[key].push({ name: m.name, source: m.source || book.toUpperCase(), cr: m.cr || '', entry: m });
    });
  });
  return all;
}

/* The block a reference names. The book of the reference wins when it says
   one, and the first of the name is taken otherwise. */
export function resolveCreature(all, name, source) {
  const key = String(name || '').toLowerCase();
  if (!key || !all[key]) return null;
  const list = all[key];
  if (source) {
    const want = String(source).toLowerCase();
    for (const item of list) {
      if (String(item.source).toLowerCase() === want) return item;
    }
  }
  return list[0];
}

/* ---- the numbers the book writes as words ---- */

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
};

const ABILITY_KEYS = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha'
};

function wordNumber(text) {
  const word = String(text || '').toLowerCase();
  if (/^\d+$/.test(word)) return Number(word);
  return WORD_NUMBERS[word] || 0;
}

/* One term of a formula: a number, the level of the calling spell, the
   proficiency, a modifier, or the level of a class. */
function termOf(text) {
  const t = String(text || '').toLowerCase().trim();
  let m;
  if ((m = t.match(/^(\d+)$/))) return { const: Number(m[1]) };
  if (/^(the spell'?s level|the level of the spell|the spell level|summonspelllevel)$/.test(t)) return { level: 1 };
  if ((m = t.match(/^(\d+)\s+per\s+spell\s+level$/))) return { perLevel: Number(m[1]) };
  if ((m = t.match(/^(\d+)\s+for\s+each\s+spell\s+level\s+above\s+(\d+)(?:st|nd|rd|th)?$/))) {
    return { perLevelAbove: Number(m[1]), above: Number(m[2]) };
  }
  if (/^pb$/.test(t)) return { prof: 1 };
  if ((m = t.match(/^your\s+(\w+)\s+modifier$/))) {
    const key = ABILITY_KEYS[m[1].toLowerCase()];
    return key ? { ability: key } : null;
  }
  if ((m = t.match(/^(\w+)\s+times\s+your\s+(\w+)\s+level$/))) {
    const n = wordNumber(m[1]);
    return n ? { class: m[2].toLowerCase(), per: n } : null;
  }
  if ((m = t.match(/^your\s+(\w+)\s+level$/))) return { class: m[1].toLowerCase(), per: 1 };
  return null;
}

/* The terms of a formula, in the order the book writes them. */
function termsOf(text) {
  const body = String(text || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .trim();
  if (!body) return null;
  if (body.indexOf(',') >= 0) return null;          /* a table of sizes */
  const parts = body.split(/\s+plus\s+|\s*\+\s*/i).map((p) => p.trim()).filter(Boolean);
  const terms = [];
  for (const part of parts) {
    const t = termOf(part);
    if (!t) return null;
    terms.push(t);
  }
  return terms.length ? terms : null;
}

/* The words in brackets at the end of a branch: "Brute only", "Air only". */
function qualifierOf(text) {
  const m = String(text || '').match(/\(([^)]*)\)\s*$/);
  return m ? m[1].trim() : '';
}

/* The formula of a number, with the branches it has: the block of the
   battle familiar says "30 (Brute only) or 20 (Flyer or Stalker only) + 5
   for each spell level above 2", and the tail belongs to both. */
export function parseFormula(text) {
  if (!text) return null;
  const raw = String(text).trim();
  const parts = splitOn(raw, /\s+or\s+/i);
  const branches = [];
  let tail = [];
  parts.forEach((part, ix) => {
    let body = part;
    if (parts.length > 1 && ix === parts.length - 1) {
      const cut = lastPlus(body);
      if (cut > 0) {
        const rest = termsOf(body.slice(cut));
        if (rest) { tail = rest; body = body.slice(0, cut); }
      }
    }
    const terms = termsOf(body);
    if (!terms) return;
    branches.push({ qualifier: qualifierOf(body), terms: terms.concat(tail) });
  });
  if (!branches.length) return null;
  return { text: raw, branches: branches };
}

/* The damage of an attack: the dice, and what is added to them. */
export function parseDamage(text) {
  if (!text) return null;
  const raw = String(text).split('|')[0].trim();
  const parts = raw.split(/\s*\+\s*/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0].toLowerCase();
  let dice = null;
  let m = first.match(/^\(\s*summonspelllevel\s*-\s*(\d+)\s*\)\s*d(\d+)$/);
  if (m) dice = { size: Number(m[2]), levelCount: -Number(m[1]) };
  if (!dice) {
    m = first.match(/^(\d*)d(\d+)$/);
    if (!m) return null;
    dice = { size: Number(m[2]), count: m[1] ? Number(m[1]) : 1 };
  }
  const flat = [];
  for (let i = 1; i < parts.length; i++) {
    const t = termOf(parts[i]);
    if (!t) return null;
    flat.push(t);
  }
  return { dice: dice, flat: flat };
}

/* The number of attacks of a multiattack, when the book counts them by the
   level of the calling spell. */
export function parseMultiattack(text) {
  if (/equal to half this spell'?s level/i.test(String(text || ''))) return { half: true };
  return null;
}

/* ---- the block of a creature ---- */

/* The armour class: a number, or the words that make one. */
function armourClass(entry) {
  const out = { ac: 0, text: '' };
  const ac = entry.ac;
  if (typeof ac === 'number') { out.ac = ac; return out; }
  if (Array.isArray(ac) && ac.length) {
    const first = ac[0];
    if (typeof first === 'number') { out.ac = first; return out; }
    if (first && typeof first.ac === 'number') out.ac = first.ac;
    else if (first && first.special) out.text = String(first.special);
    return out;
  }
  if (ac && typeof ac === 'object') {
    if (typeof ac.ac === 'number') out.ac = ac.ac;
    else if (ac.special) out.text = String(ac.special);
  }
  return out;
}

/* The hit points: a number, or the words that make one. */
function hitPoints(entry) {
  const out = { hp: 0, text: '' };
  const hp = entry.hp;
  if (!hp || typeof hp !== 'object') return out;
  if (typeof hp.average === 'number') {
    out.hp = hp.average;
    out.text = hp.formula ? String(hp.formula) : '';
    return out;
  }
  if (hp.special) out.text = String(hp.special);
  return out;
}

/* The speed, in the order the book gives it. */
function speedOf(entry) {
  const sp = entry.speed;
  if (typeof sp === 'string') return sp;
  if (!sp || typeof sp !== 'object') return '';
  const bits = [];
  Object.keys(sp).forEach((k) => {
    if (k === 'canHover') return;
    const v = sp[k];
    if (typeof v === 'number') { bits.push(k + ' ' + v + ' ft.'); return; }
    if (v && typeof v === 'object' && v.number) {
      bits.push(k + ' ' + v.number + ' ft.' + (v.condition ? ' ' + v.condition : ''));
    }
  });
  return bits.join(', ');
}

/* The kind of creature, as the book says it. */
function typeOf(entry) {
  const t = entry.type;
  if (typeof t === 'string') return t;
  if (!t || typeof t !== 'object') return '';
  if (t.type && typeof t.type === 'object') return t.type.type || '';
  if (typeof t.type === 'string') return t.type;
  return '';
}

/* The size, which a creature may have in more than one shape. */
function sizeOf(entry) {
  const s = entry.size;
  if (typeof s === 'string') return s;
  if (Array.isArray(s)) return s.join(' or ');
  return '';
}

/* The things the creature can do, and the things it is. */
function rawActions(entry) {
  return [].concat(entry.action || [], entry.bonus || [], entry.reaction || []);
}

function rawTraits(entry) {
  return entry.trait || [];
}

function shapeActions(list) {
  return list.map((a) => {
    const raw = (a.entries || []).map((e) => (typeof e === 'string' ? e : '')).join(' ');
    const atk = attackOf(raw);
    const out = {
      name: a.name || '',
      bonus: atk.bonus,
      damage: atk.damage,
      damageParts: parseDamage(atk.damage),
      type: atk.type,
      text: creatureText(raw)
    };
    if (/multiattack/i.test(a.name || '')) {
      const count = parseMultiattack(raw);
      if (count) out.count = count;
    }
    return out;
  });
}

function shapeTraits(list) {
  const out = [];
  list.forEach((t) => {
    const raw = (t.entries || []).map((e) => (typeof e === 'string' ? e : '')).join(' ');
    const text = creatureText(raw);
    if (!text) return;
    out.push({ name: t.name || '', text: text });
  });
  return out;
}

/* The patches a version makes to the block: it takes an action away, or
   renames one, or gives it another text. */
function applyPatches(list, patches) {
  let out = list.map((a) => Object.assign({}, a));
  (patches ? [].concat(patches) : []).forEach((op) => {
    if (!op || !op.mode) return;
    if (op.mode === 'removeArr') {
      const names = [].concat(op.names || []);
      out = out.filter((a) => names.indexOf(a.name) < 0);
      return;
    }
    if (op.mode === 'renameArr' && op.renames) {
      out.forEach((a) => { if (a.name === op.renames.rename) a.name = op.renames.with; });
      return;
    }
    if (op.mode === 'replaceArr' && op.items) {
      const ix = out.findIndex((a) => a.name === op.replace);
      if (ix >= 0) out[ix] = op.items;
      return;
    }
    if (op.mode === 'appendArr' && op.entries) {
      out = out.concat(op.entries);
    }
  });
  return out;
}

/* The forms of a creature: the versions of the block upstream. */
function formsOf(entry) {
  const versions = entry._versions || [];
  if (!versions.length) return [];
  const base = String(entry.name || '');
  return versions.map((v) => {
    const label = String(v.name || '').replace(base, '').replace(/[()]/g, '').trim() || String(v.name || '');
    const ac = v.ac ? armourClass(v) : armourClass(entry);
    const hp = v.hp ? hitPoints(v) : hitPoints(entry);
    return {
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: label,
      ac: ac.ac,
      acText: ac.text,
      acTerms: parseFormula(ac.text),
      hp: hp.hp,
      hpText: hp.text,
      hpTerms: parseFormula(hp.text),
      actions: shapeActions(applyPatches(rawActions(entry), v._mod && v._mod.action)),
      traits: shapeTraits(applyPatches(rawTraits(entry), v._mod && v._mod.trait))
    };
  });
}

/* The block, as the app holds it. */
export function creatureRecord(item) {
  const entry = item.entry || item;
  const ac = armourClass(entry);
  const hp = hitPoints(entry);
  const out = {
    name: entry.name || item.name || '',
    source: entry.source || item.source || '',
    cr: entry.cr || item.cr || '',
    speed: speedOf(entry),
    size: sizeOf(entry),
    type: typeOf(entry),
    ac: ac.ac,
    acText: ac.text,
    acTerms: parseFormula(ac.text),
    hp: hp.hp,
    hpText: hp.text,
    hpTerms: parseFormula(hp.text),
    actions: shapeActions(rawActions(entry)),
    traits: shapeTraits(rawTraits(entry))
  };
  const forms = formsOf(entry);
  if (forms.length) out.forms = forms;
  return out;
}

/* ---- the helpers of the formulas ---- */

/* Split a text on a pattern, but not inside brackets. */
function splitOn(text, pattern) {
  const out = [];
  let depth = 0;
  let current = '';
  const words = String(text).split(/(\s+)/);
  for (const word of words) {
    const bare = word.trim();
    if (depth === 0 && bare && pattern.test(bare)) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += word;
    for (const ch of word) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
  }
  out.push(current.trim());
  return out.filter(Boolean);
}

/* The place of the last plus that is not inside brackets. */
function lastPlus(text) {
  let depth = 0;
  let at = -1;
  const str = String(text);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '+' && depth === 0) at = i;
  }
  return at;
}
