import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'src', 'index.html'), 'utf8');
const block = html.match(/<script id="rules">([\s\S]*?)<\/script>/);
if (!block) throw new Error('rules block not found');

const ctx = vm.createContext({});
vm.runInContext(block[1], ctx);
const R = ctx.Rules;

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + '\n        got      ' + a + '\n        expected ' + e);
}

const maxRoll = () => 0.999999;
const minRoll = () => 0;
const nearNineteen = () => 0.9;

console.log('default eldritch blast');
{
  const v = R.rollVolley({ power: 'eb' }, minRoll);
  check('three beams', v.beams.length, 3);
  check('attack total is d20 + 9', v.beams[0].total, 10);
  check('damage is 1d10 + 5', v.beams[0].damage, 6);
  check('one damage group', v.beams[0].groups.length, 1);
  check('group label', v.beams[0].groups[0].label, '1d10');
  check('group type', v.beams[0].groups[0].type, 'force');
  check('no badge without an AC', v.beams[0].hit, null);
}

console.log('natural 20 doubles the damage dice');
{
  const v = R.rollVolley({ power: 'eb' }, maxRoll);
  check('crit', v.beams[0].crit, true);
  check('two d10 instead of one', v.beams[0].groups[0].label, '2d10');
  check('damage is 2d10 + 5, flat not doubled', v.beams[0].damage, 25);
  check('attack total', v.beams[0].total, 29);
}

console.log('curse');
{
  const v = R.rollVolley({ power: 'eb' }, nearNineteen);
  check('19 is not a crit without curse', v.beams[0].crit, false);
  const c = R.rollVolley({ power: 'eb', curse: true }, nearNineteen);
  check('19 is a crit with curse', c.beams[0].crit, true);
  check('curse adds 4 flat', c.beams[0].flat, 9);
  check('crit damage is 2d10 + 9', c.beams[0].damage, 29);
}

console.log('advantage');
{
  const v = R.rollVolley({ power: 'eb', advantage: true }, nearNineteen);
  check('three d20', v.beams[0].rolls.length, 3);
  check('keeps the highest', v.beams[0].kept, 19);
  check('total uses the kept die', v.beams[0].total, 28);
}

console.log('hex');
{
  const v = R.rollVolley({ power: 'eb', hex: true }, minRoll);
  check('adds a d6', v.beams[0].groups.length, 2);
  check('necrotic', v.beams[0].groups[1].type, 'necrotic');
  check('1d6 label', v.beams[0].groups[1].label, '1d6');
  check('damage is 1d10 + 1d6 + 5', v.beams[0].damage, 7);
  const c = R.rollVolley({ power: 'eb', hex: true }, maxRoll);
  check('crit doubles the hex dice too', c.beams[0].groups[1].label, '2d6');
}

console.log('minor elementals');
{
  const v = R.rollVolley({ power: 'eb', elem: true }, minRoll);
  check('adds 2d8 lightning', v.beams[0].groups[1].label, '2d8');
  check('lightning type', v.beams[0].groups[1].type, 'lightning');
  const p = R.rollVolley({ power: 'eb', elem: true, elemPlus: true }, minRoll);
  check('elem plus upgrades rather than stacks', p.beams[0].groups.length, 2);
  check('the lightning is 3d8', p.beams[0].groups[1].label, '3d8');
  check('damage is 1d10 + 3d8 + 5', p.beams[0].damage, 9);
  const c = R.rollVolley({ power: 'eb', elem: true, elemPlus: true }, maxRoll);
  check('a critical doubles it to 6d8', c.beams[0].groups[1].label, '6d8');
}

console.log('scorching ray');
{
  check('SR2 has three beams', R.rollVolley({ power: 'sr2' }, minRoll).beams.length, 3);
  check('SR3 has four beams', R.rollVolley({ power: 'sr3' }, minRoll).beams.length, 4);
  check('SR4 has five beams', R.rollVolley({ power: 'sr4' }, minRoll).beams.length, 5);
  check('SR5 has six beams', R.rollVolley({ power: 'sr5' }, minRoll).beams.length, 6);
  const v = R.rollVolley({ power: 'sr2' }, minRoll);
  check('2d6 fire', [v.beams[0].groups[0].label, v.beams[0].groups[0].type], ['2d6', 'fire']);
  check('no flat bonus', v.beams[0].flat, 0);
  check('damage is 2d6', v.beams[0].damage, 2);
}

console.log('target AC');
{
  const v = R.rollVolley({ power: 'eb', ac: 15 }, minRoll);
  check('10 against AC 15 misses', v.beams[0].hit, false);
  const h = R.rollVolley({ power: 'eb', ac: 5 }, minRoll);
  check('10 against AC 5 hits', h.beams[0].hit, true);
  const t = R.tally(R.rollVolley({ power: 'eb', ac: 15 }, minRoll), 15);
  check('a miss adds no damage', t.total, 0);
  const t2 = R.tally(R.rollVolley({ power: 'eb', ac: 5 }, minRoll), 5);
  check('three hits add up', [t2.hits, t2.total], [3, 18]);
}


console.log('wild magic surge');
{
  const surge = JSON.parse(readFileSync(resolve(root, 'data', 'wild-magic-surge-xphb.json'), 'utf8'));
  check('twenty five rows', surge.rows.length, 25);

  const seen = new Array(101).fill(0);
  surge.rows.forEach((r) => { for (let v = r.from; v <= r.to; v++) seen[v]++; });
  check('every value from 1 to 100 is covered once', seen.slice(1).every((n) => n === 1), true);

  const first = (v) => { let used = false; return () => { if (!used) { used = true; return (v - 0.5) / 100; } return 0.5; }; };
  let maps = true;
  for (let v = 1; v <= 100; v++) {
    const r = R.rollSurge(surge.rows, first(v));
    if (r.roll !== v || r.from > v || r.to < v) { maps = false; break; }
  }
  check('the d100 lands on the row that covers it', maps, true);

  check('finds 2d10 in a sentence', R.diceIn('You regain 2d10 hit points.').map((d) => d.label), ['2d10']);
  check('reads a d10 as one die', R.diceIn('Roll a d10. Your height changes.').map((d) => d.label), ['1d10']);
  check('ignores a spell level', R.diceIn('You cast Fireball as a 3rd-level spell centered on yourself.').length, 0);
  check('ignores feet and minutes', R.diceIn('A creature within 30 feet of you is poisoned for 1 minute.').length, 0);

  const hitRow = surge.rows.find((r) => /2d10 Hit Points/.test(r.text));
  check('a row that asks for dice exists', !!hitRow, true);
  const hit = R.rollSurge(surge.rows, first(hitRow.from));
  check('lands on that row', [hit.from, hit.to], [hitRow.from, hitRow.to]);
  check('rolls the dice the row asks for', hit.dice.map((d) => d.label).indexOf('2d10') >= 0, true);
  check('keeps the row text', hit.text, hitRow.text);

  const plainRow = surge.rows.find((r) => !/\dd\d+/.test(r.text));
  const plain = R.rollSurge(surge.rows, first(plainRow.from));
  check('a row without dice rolls nothing', plain.dice.length, 0);
}

console.log('the spell book');
{
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  check('the book has spells', book.spells.length > 150, true);
  check('the sheet seeded the list', book.seed.length > 40, true);
  check('every seeded spell is in the book', book.seed.filter((s) => !book.spells.some((x) => x.name === s.name)).length, 0);
  check('every seeded spell names its source', book.seed.every((s) => !!s.source), true);
  const seedLevels = {};
  for (const s of book.seed) seedLevels[s.level] = (seedLevels[s.level] || 0) + 1;
  check('the sheet has cantrips', seedLevels[0] > 5, true);
  check('the sheet has level 5 spells', seedLevels[5] > 0, true);
  const eb = book.spells.find((s) => s.name === 'Eldritch Blast');
  check('eldritch blast is a cantrip', eb.level, 0);
  check('it has a casting time', eb.time.length > 0, true);
  check('it has a range', eb.range.length > 0, true);
  check('it has components', eb.components.length > 0, true);
  check('it has blocks', eb.blocks.length > 0, true);
  const fb = book.spells.find((s) => s.name === 'Fireball');
  check('fireball has the higher level section', fb.blocks.some((b) => b.t === 'h' && /Using a Higher-Level Spell Slot/.test(b.text)), true);
  check('a spell carries a table', book.spells.some((s) => s.blocks.some((b) => b.t === 'table')), true);
  const hex = book.spells.find((s) => s.name === 'Hex');
  check('hex is a level 1 spell', hex.level, 1);
  const shield = book.spells.find((s) => s.name === 'Shield');
  check('shield reaches self', shield.range, 'Self');
  const fog = book.spells.find((s) => s.name === 'Fog Cloud');
  check('fog cloud holds concentration', fog.concentration, true);
  check('magic missile does not', book.spells.find((s) => s.name === 'Magic Missile').concentration, false);
  check('durations read in the plural', book.spells.find((s) => s.name === 'Detect Magic').duration, '10 minutes');
  check('the sheet seeded the level 2 spells', book.seed.filter((s) => s.level === 2).length, 11);
}

console.log('turning a spell slot into sorcery points');
{
  const spell = { sp: 3, spMax: 8, left: { 1: 4, 2: 3, 3: 3 } };
  check('a level 2 slot gives 2 points', R.convertSlot(spell, 2), { left: 2, sp: 5, gained: 2 });
  check('a level 1 slot gives 1 point', R.convertSlot({ sp: 0, spMax: 8, left: { 1: 2 } }, 1), { left: 1, sp: 1, gained: 1 });
  check('a level 3 slot gives 3 points', R.convertSlot({ sp: 0, spMax: 8, left: { 3: 1 } }, 3), { left: 0, sp: 3, gained: 3 });
  check('no slot, no points', R.convertSlot({ sp: 0, spMax: 8, left: { 2: 0 } }, 2), null);
  check('cantrips are not slots', R.convertSlot({ sp: 0, spMax: 8, left: { 0: 9 } }, 0), null);
  check('full points take no slot', R.convertSlot({ sp: 8, spMax: 8, left: { 2: 3 } }, 2), null);
  check('the points stop at the maximum', R.convertSlot({ sp: 7, spMax: 8, left: { 3: 1 } }, 3), { left: 0, sp: 8, gained: 1 });
}

console.log('the built page carries the data');
{
  const built = readFileSync(resolve(root, 'dist', 'index.html'), 'utf8');
  const block = built.match(/<script id="surge-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!block) { check('the table is inlined', false, true); }
  else {
    const parsed = JSON.parse(block[1]);
    check('the table is inlined with twenty five rows', parsed.rows.length, 25);
    check('the inlined table matches the data file', parsed.rows[0].text, JSON.parse(readFileSync(resolve(root, 'data', 'wild-magic-surge-xphb.json'), 'utf8')).rows[0].text);
  }
  const bookBlock = built.match(/<script id="spell-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!bookBlock) { check('the spell book is inlined', false, true); }
  else {
    const parsedBook = JSON.parse(bookBlock[1]);
    check('the spell book is inlined', parsedBook.spells.length > 100, true);
    check('the inlined book matches the data file', parsedBook.spells[0].name, JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8')).spells[0].name);
  }
}

console.log(failures === 0 ? '\nall rules checks pass' : '\n' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
