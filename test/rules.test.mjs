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

const sheetBlock = html.match(/<script id="sheet-rules">([\s\S]*?)<\/script>/);
if (!sheetBlock) throw new Error('sheet rules block not found');
const sheetCtx = vm.createContext({});
vm.runInContext(sheetBlock[1], sheetCtx);
const C = sheetCtx.SheetRules;

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
  const fireball = book.spells.find((s) => s.name === 'Fireball');
  check('the damage is marked', fireball.blocks[0].text.indexOf('[[d:8d6 Fire damage]]') >= 0, true);
  check('the saving throw is marked', fireball.blocks[0].text.indexOf('[[s:Dexterity saving throw]]') >= 0, true);
  const hold = book.spells.find((s) => s.name === 'Hold Person');
  check('the condition is marked', hold.blocks[0].text.indexOf('[[c:Paralyzed]]') >= 0, true);
}

console.log('the classes of the book');
{
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  check('the book holds every spell of the classes', book.spells.length > 350, true);
  check('every spell names a class', book.spells.every((s) => s.classes && s.classes.length > 0), true);

  const shield = book.spells.find((s) => s.name === 'Shield');
  check('shield keeps the sorcerer', shield.classes.indexOf('Sorcerer') >= 0, true);
  check('shield keeps the wizard', shield.classes.indexOf('Wizard') >= 0, true);
  check('shield keeps the hexblade', shield.classes.indexOf('Hexblade') >= 0, true);
  check('the card shows the short casting time', shield.time, 'Reaction');
  check('the full page keeps the trigger', shield.timeFull, '1 reaction, which you take when you are hit by an attack roll or targeted by the Magic Missile spell');

  const smite = book.spells.find((s) => s.name === 'Searing Smite');
  check('a smite keeps its trigger', /^1 bonus action, which you take/.test(smite.timeFull), true);

  const eb = book.spells.find((s) => s.name === 'Eldritch Blast');
  check('a spell without a trigger has no clause', !/which/.test(eb.timeFull), true);
  check('the whole time still reads', eb.timeFull, '1 action');

  const sorcerer = book.spells.filter((s) => s.classes.indexOf('Sorcerer') >= 0);
  check('the sorcerer has spells in the book', sorcerer.length > 100, true);
  const hexblade = book.spells.filter((s) => s.classes.indexOf('Hexblade') >= 0);
  check('the hexblade brings his expanded list', hexblade.length >= 10, true);
  check('the hexblade brings blur', hexblade.some((s) => s.name === 'Blur'), true);
  check('the hex spelling of a source becomes the hexblade', book.spells.find((s) => s.name === 'Blur').classes.indexOf('Hexblade') >= 0, true);
  check('the sheet sources are in the classes', book.spells.find((s) => s.name === 'Produce Flame').classes.indexOf('Izzet engineer') >= 0, true);
}

console.log('the spell levels');
{
  check('cantrip to ninth', R.LEVELS.join(','), '0,1,2,3,4,5,6,7,8,9');
  check('the warlock slots sit at level 2', R.WARLOCK_LEVEL, 2);
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  check('the book has spells for every level shown', R.LEVELS.every((lv) => book.spells.some((s) => s.level === lv)), true);
}

console.log('turning a spell slot into sorcery points');
{
  const spell = { sp: 3, spMax: 8, left: { 1: 4, 2: 3, 3: 3 } };
  check('a level 2 slot gives 2 points', R.convertSlot(spell, 2), { left: 2, warlockLeft: 0, usedWarlock: false, sp: 5, gained: 2 });
  check('a level 1 slot gives 1 point', R.convertSlot({ sp: 0, spMax: 8, left: { 1: 2 } }, 1), { left: 1, warlockLeft: 0, usedWarlock: false, sp: 1, gained: 1 });
  check('a level 3 slot gives 3 points', R.convertSlot({ sp: 0, spMax: 8, left: { 3: 1 } }, 3), { left: 0, warlockLeft: 0, usedWarlock: false, sp: 3, gained: 3 });
  check('no slot, no points', R.convertSlot({ sp: 0, spMax: 8, left: { 2: 0 } }, 2), null);
  check('cantrips are not slots', R.convertSlot({ sp: 0, spMax: 8, left: { 0: 9 } }, 0), null);
  check('full points take no slot', R.convertSlot({ sp: 8, spMax: 8, left: { 2: 3 } }, 2), null);
  check('the points stop at the maximum', R.convertSlot({ sp: 7, spMax: 8, left: { 3: 1 } }, 3), { left: 0, warlockLeft: 0, usedWarlock: false, sp: 8, gained: 1 });
  check('the warlock slots go first', R.convertSlot({ sp: 0, spMax: 8, left: { 2: 3 }, warlockLeft: 2 }, 2), { left: 3, warlockLeft: 1, usedWarlock: true, sp: 2, gained: 2 });
  check('the sorcerer slot is next', R.convertSlot({ sp: 0, spMax: 8, left: { 2: 3 }, warlockLeft: 0 }, 2), { left: 2, warlockLeft: 0, usedWarlock: false, sp: 2, gained: 2 });
  check('the warlock slots are only at level 2', R.convertSlot({ sp: 0, spMax: 8, left: { 3: 1 }, warlockLeft: 2 }, 3), { left: 0, warlockLeft: 2, usedWarlock: false, sp: 3, gained: 3 });
}

console.log('the character sheet');
{
    check('six abilities', C.ABILITIES.length, 6);
    check('eighteen skills', C.SKILLS.length, 18);
    check('twenty is a plus five', C.abilityMod(20), 5);
    check('ten is a zero', C.abilityMod(10), 0);
    check('nine is a minus one', C.abilityMod(9), -1);
    check('eight is a minus one', C.abilityMod(8), -1);
    check('seven is a minus two', C.abilityMod(7), -2);
    check('level one gives a plus two', C.profBonus(1), 2);
    check('level eight gives a plus three', C.profBonus(8), 3);
    check('level nine gives a plus four', C.profBonus(9), 4);
    check('level seventeen gives a plus six', C.profBonus(17), 6);

    const hero = {
      level: 9,
      abilities: { str: 10, dex: 14, con: 16, int: 8, wis: 12, cha: 20 },
      saves: { str: 0, dex: 0, con: 1, int: 0, wis: 0, cha: 1 },
      skills: { athletics: 1, perception: 1 }
    };
    check('a proficient save takes the proficiency', C.saveMod(hero, 'cha'), 9);
    check('a plain save does not', C.saveMod(hero, 'str'), 0);
    check('a proficient skill takes the proficiency', C.skillMod(hero, 'athletics'), 4);
    check('a plain skill does not', C.skillMod(hero, 'stealth'), 2);
    check('the spell attack is charisma and proficiency', C.spellAttack(hero), 9);
    check('the save DC is eight plus both', C.spellDC(hero), 17);
    check('the attack agrees with the volley', C.spellAttack(hero), R.ATTACK_MOD);
    check('the DC agrees with the spell tab', C.spellDC(hero), 17);

    check('the proficiency cycles to proficient', C.nextProf(0), 1);
    check('the proficiency cycles to expertise', C.nextProf(1), 2);
    check('the proficiency cycles back to none', C.nextProf(2), 0);
    check('a row starts without proficiency', C.profLabel(0), 'not proficient');
    check('one is proficient', C.profLabel(1), 'proficient');
    check('two is expertise', C.profLabel(2), 'expertise');
    check('expertise takes the saving throw proficiency twice', C.saveMod({ level: hero.level, abilities: hero.abilities, saves: { cha: 2 } }, 'cha'), 13);
    check('expertise takes the skill proficiency twice', C.skillMod({ level: hero.level, abilities: hero.abilities, skills: { athletics: 2 } }, 'athletics'), 8);
    check('no proficiency leaves the ability alone', C.skillMod({ level: hero.level, abilities: hero.abilities, skills: { athletics: 0 } }, 'athletics'), 0);

    check('hit points stop at zero', C.hpApply(3, 10, -5), 0);
    check('hit points stop at the maximum', C.hpApply(9, 10, 4), 10);
    check('hit points move by one', C.hpApply(9, 10, -1), 8);
    check('a rewind with nothing to undo does nothing', C.rewind([]).current, null);
}

console.log('the rests');
{
  const hero = {
    level: 9,
    hp: { current: 12, max: 38 },
    features: [
      { key: 'warlockSlots', name: 'Warlock spell slots', recovery: 'short', bind: 'warlock', max: 0, left: 0, short: null },
      { key: 'hexCurse', name: 'Hexblade curse', recovery: 'short', bind: null, max: 2, left: 0, short: 1 },
      { key: 'invuln', name: 'Invulnerability', recovery: 'long', bind: null, max: 1, left: 0, short: null }
    ]
  };
  const spell = {
    left: { 1: 4, 2: 3, 3: 3, 4: 2 },
    max: { 1: 4, 2: 3, 3: 3, 4: 2 },
    warlockMax: 2,
    warlockLeft: 0,
    sp: 3,
    spMax: 8,
    cunning: true,
    sorcRest: false
  };

  const short = C.shortRest(hero, spell);
  check('a short rest leaves the hit points alone', short.hp, 12);
  check('a short rest leaves the spell slots alone', short.left, { 1: 4, 2: 3, 3: 3, 4: 2 });
  check('a short rest leaves the sorcery points alone', short.sp, 3);
  check('a short rest gives the warlock slots back', short.warlockLeft, 2);
  check('a short rest gives one use of the hexblade curse', short.features[1].left, 1);
  check('a short rest leaves a long rest feature alone', short.features[2].left, 0);
  check('a short rest keeps the cunning', short.cunning, true);

  const withCost = {
    hp: { current: 12, max: 38 },
    features: [
      { key: 'bendLuck', name: 'Bend luck', source: 'Wild Magic', active: true, recovery: 'special', cost: 'sp', max: 0, left: 0, short: null, hidden: false },
      { key: 'trance', name: 'Trance', source: 'Elf', active: false, recovery: 'passive', max: 0, left: 0, short: null, hidden: false }
    ]
  };
  const rested = C.longRest(withCost, spell);
  check('a rest keeps the cost of a use', rested.features[0].cost, 'sp');
  check('a rest keeps the kind of recovery', rested.features[0].recovery, 'special');
  check('a rest keeps the source', rested.features[0].source, 'Wild Magic');
  check('a rest keeps a passive feature passive', rested.features[1].active, false);
  check('a rest keeps the recovery of a passive feature', rested.features[1].recovery, 'passive');

  const long = C.longRest(hero, spell);
  check('a long rest fills the hit points', long.hp, 38);
  check('a long rest fills the spell slots', long.left, { 1: 4, 2: 3, 3: 3, 4: 2 });
  check('a long rest fills the warlock slots', long.warlockLeft, 2);
  check('a long rest fills the sorcery points', long.sp, 8);
  check('a long rest gives every feature back', long.features[1].left, 2);
  check('a long rest gives a long rest feature back', long.features[2].left, 1);
  check('a long rest makes the cunning available again', long.cunning, false);

  const spent = { left: { 1: 0, 2: 1 }, max: { 1: 4, 2: 3 } };
  const spentSpell = Object.assign({}, spell, { left: spent.left });
  check('a long rest fills a spent level', C.longRest(hero, spentSpell).left, { 1: 4, 2: 3, 3: 3, 4: 2 });

  const snap = C.snapshot(hero, spell);
  check('a snapshot holds the hit points', snap.hp, 12);
  check('a snapshot holds the features', snap.features[1].left, 0);
  check('a snapshot holds the slots', snap.left, { 1: 4, 2: 3, 3: 3, 4: 2 });
  check('a snapshot holds the warlock slots', snap.warlockLeft, 0);
  const back = C.rewind([snap, { hp: 20 }]);
  check('a rewind brings the last snapshot back', back.current.hp, 20);
  check('a rewind keeps the rest of the history', back.history.length, 1);
  check('a rewind of one snapshot brings that one back', C.rewind([snap]).current.hp, 12);
}

console.log('the hit dice');
{
  const hero = {
    hp: { current: 12, max: 38 },
    dice: [{ type: 6, spent: true }, { type: 6, spent: false }, { type: 10, spent: true }],
    features: []
  };
  const spell = { left: {}, max: {}, warlockMax: 0, warlockLeft: 0, sp: 0, spMax: 8, cunning: false, sorcRest: false };
  const long = C.longRest(hero, spell);
  check('a long rest gives every die back', long.dice.map((d) => d.spent), [false, false, false]);
  const short = C.shortRest(hero, spell);
  check('a short rest leaves the dice alone', short.dice.map((d) => d.spent), [true, false, true]);
  const snap = C.snapshot(hero, spell);
  check('a snapshot holds the dice', snap.dice.map((d) => d.spent), [true, false, true]);
}

console.log('the shapes of the dice');
{
  const points = (k) => C.DIE_SHAPES[k].split(' ').length;
  check('the d6 is a square', points(6), 4);
  check('the d8 is a diamond', points(8), 4);
  check('the d10 is a kite', points(10), 5);
  check('the d12 is a pentagon', points(12), 5);
  check('every die has a shape', [4, 6, 8, 10, 12].every((k) => !!C.DIE_SHAPES[k]), true);
  check('every die has a place for its number', [4, 6, 8, 10, 12].every((k) => !!C.DIE_LABEL[k]), true);
  check('the d6 is square, not round', C.DIE_SHAPES[6].indexOf('19,19') >= 0, true);
  check('the d10 has a point at the bottom', C.DIE_SHAPES[10].indexOf('12,21') >= 0, true);
}

console.log('the features');
{
  const data = JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8'));
  check('the list of features', data.features.length, 18);
  const active = data.features.filter((f) => f.active);
  const passive = data.features.filter((f) => !f.active);
  check('the active ones', active.length, 9);
  check('the passive ones', passive.length, 9);
  check('every feature says where it comes from', data.features.every((f) => !!f.source), true);
  check('every feature has a summary', data.features.every((f) => !!f.desc), true);
  check('every feature has the long text', data.features.every((f) => f.blocks && f.blocks.length > 0), true);
  const innate = data.features.find((f) => f.key === 'innateSorcery');
  check('innate sorcery has two uses', innate.uses, 2);
  check('innate sorcery comes back on a long rest', innate.recovery, 'long');
  const curse = data.features.find((f) => f.key === 'hexCurse');
  check('the hexblade curse has one use', curse.uses, 1);
  check('the hexblade curse comes back on a short rest', curse.recovery, 'short');
  const luck = data.features.find((f) => f.key === 'bendLuck');
  check('bend luck is a special feature', luck.recovery, 'special');
  check('bend luck costs a sorcery point', luck.cost, 'sp');
  check('the passive features say so', data.features.find((f) => f.key === 'trance').recovery, 'passive');
  check('the hexblade curse is the 2014 one', curse.blocks[0].text.indexOf('baleful curse') >= 0, true);
  check('the features the spell tab tracks start hidden', data.features.filter((f) => f.hidden).map((f) => f.key).join(','), 'metamagic,sorcerousRest,magicalCunning');
  check('the wild surge is the 2024 one', data.features.find((f) => f.key === 'wildSurge').blocks[0].text.indexOf('1d20') >= 0, true);
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
  const sheetBlock = built.match(/<script id="sheet-rules">([\s\S]*?)<\/script>/);
  check('the sheet rules travel with the page', !!sheetBlock, true);
  const featureBlock = built.match(/<script id="feature-data" type="application\/json">([\s\S]*?)<\/script>/);
  check('the features travel with the page', !!featureBlock, true);
  if (featureBlock) {
    const parsedFeatures = JSON.parse(featureBlock[1]);
    check('the features are inlined', parsedFeatures.features.length, 18);
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
