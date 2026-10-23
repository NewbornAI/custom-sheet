/**
 * The stat blocks of the bestiary.
 *
 * The books come from 5e.tools and sit in the cache. The fetcher shapes the
 * creatures the app names into data/bestiary.json, and the server that
 * holds the whole bestiary shapes the others the same way, so a creature
 * looks the same wherever it comes from.
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

/* The number of the armour class, and the words when it is a formula. */
function armourClass(entry) {
  const out = { ac: 0, text: '' };
  const ac = entry.ac;
  if (typeof ac === 'number') { out.ac = ac; return out; }
  if (Array.isArray(ac) && ac.length) {
    const first = ac[0] || {};
    if (typeof first === 'number') { out.ac = first; return out; }
    if (typeof first.ac === 'number') out.ac = first.ac;
    else if (first.special) out.text = String(first.special);
    return out;
  }
  if (ac && typeof ac === 'object') {
    if (typeof ac.ac === 'number') out.ac = ac.ac;
    else if (ac.special) out.text = String(ac.special);
  }
  return out;
}

/* The hit points, and the dice that make them. */
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

/* The things the creature can do: its actions, its bonus actions and its
   reactions. Each carries the bonus of the attack and the damage of it. */
function actionsOf(entry) {
  const out = [];
  const take = (list) => {
    (list || []).forEach((a) => {
      const raw = (a.entries || []).map((e) => (typeof e === 'string' ? e : '')).join(' ');
      const atk = attackOf(raw);
      out.push({
        name: a.name || '',
        bonus: atk.bonus,
        damage: atk.damage,
        type: atk.type,
        text: creatureText(raw)
      });
    });
  };
  take(entry.action);
  take(entry.bonus);
  take(entry.reaction);
  return out;
}

/* The things the creature is. */
function traitsOf(entry) {
  const out = [];
  (entry.trait || []).forEach((t) => {
    const raw = (t.entries || []).map((e) => (typeof e === 'string' ? e : '')).join(' ');
    const text = creatureText(raw);
    if (!text) return;
    out.push({ name: t.name || '', text: text });
  });
  return out;
}

/* The block, as the app holds it. */
export function creatureRecord(item) {
  const entry = item.entry || item;
  const ac = armourClass(entry);
  const hp = hitPoints(entry);
  return {
    name: entry.name || item.name || '',
    source: entry.source || item.source || '',
    cr: entry.cr || item.cr || '',
    ac: ac.ac,
    acText: ac.text,
    hp: hp.hp,
    hpText: hp.text,
    speed: speedOf(entry),
    size: sizeOf(entry),
    type: typeOf(entry),
    actions: actionsOf(entry),
    traits: traitsOf(entry)
  };
}
