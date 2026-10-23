/**
 * The markup of 5e.tools, and the creatures it names.
 *
 * The upstream text holds tags like {@creature Battle Familiar|AU} and
 * {@damage 2d4 + 2}. The fetcher cleans them for the spell book, and the
 * bestiary is shaped from the same text, so the two never drift apart.
 */
const ABILITIES = { DEX: 'Dexterity', STR: 'Strength', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' };

export function clean(text) {
  if (typeof text !== 'string') return '';
  let out = text;
  out = out.replace(/\{@filter ([^}]*)}/g, '');
  /* The damage takes the type that follows it: "8d6 Fire damage". */
  out = out.replace(/\{@damage ([^}]+)\}(\s+([A-Z][a-z]+)( damage)?)?/g, (m, dice, gap, type, dmg) =>
    '[[d:' + dice + (gap ? ' ' + type + (dmg || '') : '') + ']]');
  /* The conditions keep their name, the page shows them as a reference. */
  out = out.replace(/\{@condition ([^}|]+)(?:\|[^}]*)?}/g, (m, name) => '[[c:' + name.trim() + ']]');
  out = out.replace(/\{@([a-zA-Z]+)\s+([^}|]*)(?:\|[^}]*)?}/g, (m, tag, body) => {
    const b = body.trim();
    if (tag === 'actSave') {
      const abil = b.split(',').map((a) => ABILITIES[a.trim()] || a.trim()).join(' or ');
      return abil + ' saving throw';
    }
    if (tag === 'damage' || tag === 'scaledamage') return '[[d:' + b + ']]';
    if (tag === 'condition') return '[[c:' + b + ']]';
    if (tag === 'hit') return 'on a hit, ' + b;
    if (tag === 'recharge') return 'recharges on a ' + b;
    if (tag === 'atk') return b.replace(/^(\w)(\w*)/, (x, a, r) => a.toUpperCase() + r) + ' attack';
    if (tag === 'dc') return 'DC ' + b;
    if (tag === 'note') return 'Note: ' + b;
    if (tag === 'i' || tag === 'b' || tag === 'highlight') return b;
    return b;
  });
  out = out.replace(/\{@[a-zA-Z]+\s*}/g, '');
  /* The saving throws, in blue. */
  out = out.replace(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/g, '[[s:$1 saving throw]]');
  return out.replace(/\s+/g, ' ').trim();
}

export function textOf(entries) {
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
export function cellText(cell) {
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

export function blocksFrom(entries) {
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

/* ---- the creatures the text names ---- */

/* A tag that names a creature: {@creature Battle Familiar|AU}. The parts
   are the name, the book the block is in, and sometimes a third part that
   is a plural or a note. */
export function references(node) {
  const out = [];
  const re = /\{@creature\s+([^|}]*?)(?:\|([^|}]*?))?(?:\|([^}]*?))?\}/g;
  const walk = (value) => {
    if (typeof value === 'string') {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(value))) {
        const name = String(m[1] || '').trim();
        if (name) out.push({ name: name, source: String(m[2] || '').trim(), note: String(m[3] || '').trim() });
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    Object.keys(value).forEach((k) => walk(value[k]));
  };
  walk(node);
  return out;
}

/* The range of an attack: the tags m, mw, r, rw, ms and rs. */
const RANGES = { m: 'Melee', mw: 'Melee', ms: 'Melee', r: 'Ranged', rw: 'Ranged', rs: 'Ranged' };

/* The text of a creature, with its tags read. */
export function creatureText(text) {
  if (typeof text !== 'string') return '';
  let out = text;
  out = out.replace(/\{@filter ([^}]*)}/g, '');
  out = out.replace(/\{@atk (m|r|mw|rw|ms|rs)\b\}?/g, (m, kind) => RANGES[kind] || kind);
  out = out.replace(/\{@atkr (m|r|mw|rw|ms|rs)\b\}?/g, (m, kind) => RANGES[kind] || kind);
  out = out.replace(/\{@hit (-?\d+)\}/g, '$1 to hit');
  out = out.replace(/\{@hitYourSpellAttack\}/g, 'your spell attack modifier');
  out = out.replace(/\{@h\}/g, '');
  out = out.replace(/\{@damage ([^}]+)\}(\s+([A-Z][a-z]+)( damage)?)?/g, (m, dice, gap, type, dmg) =>
    '[[d:' + dice + (gap ? ' ' + type + (dmg || '') : '') + ']]');
  out = out.replace(/\{@scaledamage ([^}|]+)(?:\|[^}]*)?\}/g, '[[d:$1]]');
  out = out.replace(/\{@condition ([^}|]+)(?:\|[^}]*)?\}/g, (m, name) => '[[c:' + name.trim() + ']]');
  out = out.replace(/\{@actSave ([^}]*)\}/g, (m, body2) => {
    const abil = body2.split(',').map((a) => ABILITIES[a.trim()] || a.trim()).join(' or ');
    return abil + ' saving throw';
  });
  out = out.replace(/\{@dc ([^}]*)\}/g, 'DC $1');
  out = out.replace(/\{@dice ([^}]*)\}/g, '$1');
  out = out.replace(/\{@variantrule ([^}|]*)(?:\|[^}]*)?\}/g, '$1');
  out = out.replace(/\{@book ([^}|]*)(?:\|[^}]*)?\}/g, '$1');
  out = out.replace(/\{@recharge ([^}]*)\}/g, 'recharges on a $1');
  out = out.replace(/\{@note ([^}]*)\}/g, 'Note: $1');
  out = out.replace(/\{@([a-zA-Z]+)\s+([^}|]*)(?:\|[^}]*)?\}/g, (m, tag, body2) => {
    const b = body2.trim();
    if (tag === 'i' || tag === 'b' || tag === 'highlight') return b;
    return b;
  });
  out = out.replace(/\{@[a-zA-Z]+\s*}/g, '');
  out = out.replace(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/g, '[[s:$1 saving throw]]');
  return out.replace(/\s+/g, ' ').trim();
}

/* The attack of a creature: what it hits with and what it does. The bonus
   is the number of the hit tag, the damage the dice of the damage tag, and
   the type the word that follows it. */
export function attackOf(text) {
  const out = { bonus: '', damage: '', type: '' };
  if (typeof text !== 'string') return out;
  const hit = text.match(/\{@hit (-?\d+)\}/);
  if (hit) out.bonus = hit[1];
  const dmg = text.match(/\{@(?:scaledamage|damage)\s+([^}|]+)/);
  if (dmg) out.damage = dmg[1].trim();
  const typed = text.match(/\{@(?:scaledamage|damage)\s+[^}]+\}\s*([A-Za-z]+)\s+damage/);
  if (typed) out.type = typed[1].toLowerCase();
  else {
    const after = text.match(/\)\s*([A-Za-z]+)\s+damage/);
    if (after) out.type = after[1].toLowerCase();
  }
  return out;
}
