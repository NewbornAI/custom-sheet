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


console.log('the flat bonus');
{
  const v = R.rollVolley({ power: 'eb' }, minRoll);
  check('the flat is force damage', v.flatType, 'force');
  check('the primary type of eldritch blast', R.primaryType(R.powerOf('eb')), 'force');
  const t = R.tally(v, null);
  check('the flat sits in the force pile', t.byType.force, 18);
  check('and it is not a pile of its own', t.order, ['force']);
  check('the total is the same', t.total, 18);
  const c = R.tally(R.rollVolley({ power: 'eb', curse: true }, minRoll), null);
  check('the curse flat is force too', c.byType.force, 30);
  const s = R.tally(R.rollVolley({ power: 'sr2', curse: true }, minRoll), null);
  check('on a scorching ray the flat is fire', s.byType.fire, 18);
  check('and no force there', s.byType.force, undefined);
  const crit = R.tally(R.rollVolley({ power: 'eb' }, maxRoll), null);
  check('a critical doubles the dice, not the flat', crit.byType.force, 75);
}

console.log('the numbers of the caster');
{
  check('the spell keeps its own attack', R.attackMod({ power: 'eb' }), 9);
  check('the character can give the attack', R.attackMod({ power: 'eb', attackMod: 7 }), 7);
  const v = R.rollVolley({ power: 'eb', attackMod: 7 }, minRoll);
  check('the attack uses it', v.beams[0].total, 8);
  check('the spell keeps its own flat', R.flatMod({ power: 'eb' }, R.powerOf('eb')), 5);
  check('the character can give the flat', R.flatMod({ power: 'eb', flatMod: 3 }, R.powerOf('eb')), 3);
  const f = R.rollVolley({ power: 'eb', flatMod: 3 }, minRoll);
  check('the damage carries it', f.beams[0].damage, 4);
  check('a scorching ray has no flat', R.flatMod({ power: 'sr2', flatMod: 3 }, R.powerOf('sr2')), 0);
}

console.log('quicken');
{
  check('off by default', R.quickened({ power: 'eb' }), false);
  check('on for eldritch blast', R.quickened({ power: 'eb', quicken: true }), true);
  check('not for a scorching ray', R.quickened({ power: 'sr3', quicken: true }), false);
  check('the board shows three beams', R.beamCount({ power: 'eb' }), 3);
  check('and six when quickened', R.beamCount({ power: 'eb', quicken: true }), 6);
  check('a scorching ray keeps its own count', R.beamCount({ power: 'sr3', quicken: true }), 4);
  const v = R.rollVolley({ power: 'eb', quicken: true }, minRoll);
  check('six beams are rolled', v.beams.length, 6);
  check('the second row is marked', v.beams.slice(3).every((b) => b.quick), true);
  check('the first row is not', v.beams.slice(0, 3).some((b) => b.quick), false);
  check('every beam rolls its own attack', v.beams[3].total, 10);
  const t = R.tally(v, null);
  check('the tally counts both rows', t.total, 36);
  check('and the force pile holds all of it', t.byType.force, 36);
  const h = R.rollVolley({ power: 'eb', quicken: true, hex: true }, minRoll);
  check('the quickened row carries the hex too', h.beams[3].groups.length, 2);
  const q = R.rollVolley({ power: 'sr3', quicken: true }, minRoll);
  check('a quickened scorching ray stays at four beams', q.beams.length, 4);
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
  check("the library and the character's own table", data.features.length, 1017);
  const active = data.features.filter((f) => f.active);
  const passive = data.features.filter((f) => !f.active);
  check('the active ones', active.length, 12);
  check('the passive ones', passive.length, 1005);
  check('every feature says where it comes from', data.features.every((f) => !!f.source), true);
  check('the curated ones have a summary', data.features.filter((f) => f.seed || f.preset).every((f) => !!f.desc), true);
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
  const library = data.features.filter((f) => !f.seed && !f.preset);
  const perClass = {};
  library.forEach((f) => { perClass[f.class] = (perClass[f.class] || 0) + 1; });
  check('the library holds all twelve classes', Object.keys(perClass).length, 12);
  check('every feature of the library names its class and its level', library.every((f) => !!f.class && f.level >= 1), true);
  check('and carries its text', library.every((f) => f.blocks.length > 0), true);
  check('the wizard of level two has its features', library.filter((f) => f.class === 'Wizard' && f.level <= 2).length >= 4, true);
  check('the lore of the bard arrives at three', library.filter((f) => f.subclass === 'Lore' && f.level === 3).length >= 2, true);
}

console.log('the classes and the multiclass rules');
{
  const data = JSON.parse(readFileSync(resolve(root, 'data', 'classes.json'), 'utf8')).classes;
  const byName = (n) => data.filter((c) => c.name === n)[0];
  check('twelve classes', data.length, 12);
  check('every class gives its hit die', data.every((c) => c.hd >= 6 && c.hd <= 12), true);
  check('the classes that cast name their ability', data.filter((c) => !!c.ability).map((c) => c.name).join(','), 'Bard,Cleric,Druid,Paladin,Ranger,Sorcerer,Warlock,Wizard');
  check('the bard is a full caster', byName('Bard').caster, 'full');
  check('the warlock is pact magic', byName('Warlock').caster, 'pact');
  check('the paladin of 2024 counts as half', C.casterLevel([{ level: 5, caster: byName('Paladin').caster }]), 2);
  check('the bard has the creation and the lore', ['College of Creation', 'College of Lore'].every((n) => byName('Bard').subclasses.some((s) => s.name === n)), true);
  check('and the lore is printed once, the 2024 way', byName('Bard').subclasses.filter((s) => s.name === 'College of Lore')[0].source, 'XPHB');

  check('a full caster counts its level', C.casterLevel([{ level: 8, caster: 'full' }, { level: 3, caster: 'pact' }]), 8);
  check('a half caster counts half', C.casterLevel([{ level: 5, caster: 'full' }, { level: 4, caster: 'half' }]), 7);
  check('the pact magic adds nothing', C.casterLevel([{ level: 3, caster: 'pact' }]), 0);
  check('the slots of a caster of eight', [C.slotsFor(8)[1], C.slotsFor(8)[2], C.slotsFor(8)[3], C.slotsFor(8)[4], C.slotsFor(8)[5]].join(''), '43320');
  check('the slots of a caster of eleven', [C.slotsFor(11)[5], C.slotsFor(11)[6], C.slotsFor(11)[7]].join(''), '210');
  check('a caster of twenty', C.slotsFor(20)[9], 1);
  check('the pact slots of a warlock three', JSON.stringify(C.pactFor(3)), '{"max":2,"level":2}');
  check('and of a warlock eleven', JSON.stringify(C.pactFor(11)), '{"max":3,"level":5}');
  check('the warlock level of a character', C.warlockLevel([{ name: 'Sorcerer', level: 8 }, { name: 'Warlock', level: 3 }]), 3);
  check('no warlock, no pact slot', C.pactFor(C.warlockLevel([{ name: 'Bard', level: 11 }])).max, 0);
  check('the spell attack of a charisma caster', C.spellAttack({ abilities: { cha: 20, int: 18 }, level: 11 }), 9);
  check('and of a wizard', C.spellAttack({ abilities: { cha: 20, int: 18 }, level: 11 }, 'int'), 8);
  check('the DC of a wizard of eleven', C.spellDC({ abilities: { int: 18 }, level: 11 }, 'int'), 16);
}

console.log('initiative');
{
  check('it follows the dexterity', C.initMod({ abilities: { dex: 14 } }), 2);
  check('a score of eight gives a minus one', C.initMod({ abilities: { dex: 8 } }), -1);
  check('a score of ten gives nothing', C.initMod({ abilities: { dex: 10 } }), 0);
  check('a set initiative wins', C.initMod({ abilities: { dex: 14 }, init: 5, initTouched: true }), 5);
  check('and a set zero keeps its zero', C.initMod({ abilities: { dex: 14 }, init: 0, initTouched: true }), 0);
}

console.log('seeding a character from the data');
{
  const features = JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8'));
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(resolve(root, 'characters', 'yngwie.json'), 'utf8'));
  const classes = JSON.parse(readFileSync(resolve(root, 'data', 'classes.json'), 'utf8')).classes;
  const bard = { id: 'bardCreation', name: pkg.name, rec: pkg.record };
  const levelOf = {};
  book.spells.forEach((s) => { levelOf[s.name] = s.level; });

  check('the example travels as a package', pkg.kind + '/' + pkg.version, 'custom-sheet-character/1');
  check('the bard of the sheet', bard.id, 'bardCreation');
  const known = features.features.map((f) => f.key);
  check('every feature it holds is known', bard.rec.char.features.every((f) => known.indexOf(f.key) >= 0), true);
  check('the twelve it brings are its own', features.features.filter((f) => f.preset === 'bard').length, 12);
  check('the eighteen of the app wait for a new character', features.features.filter((f) => f.seed).length, 18);
  check('the level of the sheet', bard.rec.char.level, 11);
  check('the class of the sheet', JSON.stringify(bard.rec.char.classes), '[{"name":"Bard","level":11,"subclass":"College of Creation"}]');
  check('the name of the sheet', bard.name + '/' + bard.rec.char.name, 'Yngwie/Yngwie');
  check('the six scores of the sheet', ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => bard.rec.char.abilities[k]).join('/'), '8/14/14/10/12/19');
  check('it comes with its own colours and icon', bard.rec.theme + '/' + bard.rec.icon, 'blueRed/guitar');
  check('it sets no initiative, the dexterity gives it', bard.rec.char.initTouched === undefined, true);
  check('eleven hit dice, all d8', bard.rec.char.dice.length + 'd' + bard.rec.char.dice[0].type, '11d8');
  check('proficient in the two bard saves', bard.rec.char.saves.dex + '/' + bard.rec.char.saves.cha, '1/1');
  const slots = bard.rec.spells.max;
  check('the slots of a level 11 bard', [slots[1], slots[2], slots[3], slots[4], slots[5], slots[6]].join(''), '433321');
  check('no pact slot and no sorcery point', bard.rec.spells.warlockMax + '/' + bard.rec.spells.spMax, '0/0');
  check('no volley page', bard.rec.pages.indexOf('volley'), -1);
  const listed = [];
  Object.keys(bard.rec.spells.lists).forEach((lv) => bard.rec.spells.lists[lv].forEach((n) => listed.push(lv + ':' + n)));
  check('every spell it holds is in the book', listed.every((x) => levelOf[x.split(':')[1]] !== undefined), true);
  check('every spell sits at its own level', listed.every((x) => levelOf[x.split(':')[1]] === Number(x.split(':')[0])), true);
  check('the twenty one spells of the character', listed.length, 21);
  const declared = bard.rec.spells.sources;
  check('every spell of the preset names its source', Object.keys(declared).length, 21);
  check('five come from the conjuration adept', Object.keys(declared).filter((n) => declared[n] === 'Conjuration adept').length, 5);
  check('shield comes from the abjuration adept', declared.Shield, 'Abjuration adept');
  /* The five the class and the elf bring name a class and a race, and no
     feature of the library carries that name, so the check of the feat
     reaches the ten that come from one. */
  const fromFeat = Object.keys(declared).filter((n) => features.features.some((f) => f.name === declared[n]));
  check('the ten of the feats name a feature', fromFeat.length, 10);
  check('and each one is the feature that grants it', fromFeat.every((n) => {
    const feat = features.features.filter((f) => f.name === declared[n])[0];
    return JSON.stringify(feat.blocks).indexOf('"' + n + '"') >= 0;
  }), true);
  check('the grimoire opens with every filter off', JSON.stringify(bard.rec.spells.classes), '{"Bard":false,"Wizard":false,"Druid":false}');

  /* The two pages that hold a character read their own slice, so the way
     from the ready-made record to the sheet is checked here. */
  const taken = {};
  const core = {
    R: R, SR: C, ABILITIES: C.ABILITIES, SKILLS: C.SKILLS,
    LEVELS: R.LEVELS, WARLOCK_LEVEL: R.WARLOCK_LEVEL,
    features: features, book: book, bookByName: {},
    featureByKey: {},
    seeds: {
      features: features.features.filter((f) => f.seed),
      spells: (book.seed || []).map((s) => ({ name: s.name, level: s.level }))
    },
    data: () => Promise.resolve(true),
    classInfo: (name) => classes.filter((c) => c.name === name)[0] || null,
    classRows: (ch) => (ch.classes || []).map((k) => {
      const info = classes.filter((c) => c.name === k.name)[0] || {};
      return { name: k.name, level: k.level, subclass: k.subclass || '', ability: info.ability, caster: info.caster, hd: info.hd };
    }),
    canonSource: (s) => s
  };
  book.spells.forEach((s) => { core.bookByName[s.name] = s; });
  features.features.forEach((f) => { core.featureByKey[f.key] = f; });
  const ctx = vm.createContext({ Sheet: { core: core, page: (spec) => { taken[spec.id] = spec; } } });
  ['character', 'spells'].forEach((f) => {
    vm.runInContext(readFileSync(resolve(root, 'src', 'pages', f + '.js'), 'utf8'), ctx);
  });

  const char = taken.character.seed(bard.rec.char, true);
  check('the ready-made features arrive whole', char.features.length, bard.rec.char.features.length);
  check('and they are its own', char.features.map((f) => f.key).indexOf('musician') >= 0, true);
  check('a feature keeps its uses', char.features.filter((f) => f.key === 'bardicInspiration')[0].max, bard.rec.char.features.filter((f) => f.key === 'bardicInspiration')[0].max);
  check('the level survives the seeding', char.level, 11);
  check('the class survives it too', char.classes.length + ' ' + char.classes[0].name, '1 Bard');
  check('charisma 19 and level 11 give a spell attack of +8', C.spellAttack(char), 8);
  check('and a save DC of 16', C.spellDC(char), 16);
  check('the bard rolls eleven d8', char.dice.filter((d) => d.type === 8).length + 'd8', '11d8');
  check('and no other die', char.dice.filter((d) => d.type !== 8).length, 0);
  check('and an initiative of +2', C.initMod(char), 2);
  const own = taken.character.seed({}, false);
  check('the app\'s own character keeps its features', own.features.length, 19);
  check('the dice of the app\'s own character come from the classes', own.dice.filter((d) => d.type === 6).length + 'd6 and ' + own.dice.filter((d) => d.type === 8).length + 'd8', '8d6 and 3d8');
  check('and its own numbers', own.level + '/' + own.abilities.cha, '11/20');
  const blank = taken.character.seed({}, true);
  check('a character from nothing has no feature', blank.features.length, 0);
  check('and the scores of the floor', blank.abilities.cha, 10);
  const spell = taken.spells.seed(bard.rec.spells, true);
  check('the ready-made spells travel', spell.lists[1].join(','), 'Entangle,Shield');
  check('a level it left empty stays empty', spell.lists[7].length, 0);
  check('the slots travel too', [spell.max[1], spell.max[5]].join('/'), '4/2');
  check('the source of a spell is the character\'s own', spell.sources.Shield, 'Abjuration adept');
  const old = taken.spells.seed({ lists: { 1: ['Shield'] } }, false);
  check('a record saved before this takes the sources of the book', old.sources.Shield, 'Hexblade');
  const mine = taken.spells.seed({ lists: { 1: ['Shield'] }, sources: { Shield: 'Warlock' } }, false);
  check('a record that names its own keeps exactly them', JSON.stringify(mine.sources), '{"Shield":"Warlock"}');
  const silent = taken.spells.seed({ lists: { 1: ['Shield'] }, sources: {} }, false);
  check('a record that names none keeps none', JSON.stringify(silent.sources), '{}');
  const kept = taken.spells.seed({ lists: { 1: [] } }, false);
  check('a level the player emptied stays empty', kept.lists[1].length, 0);
  check('and the rest keeps the app\'s spells', kept.lists[0].length, 10);
}

console.log('the page the phone opens at launch');
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
  /* The library, the book and the classes are files beside the page, read
     when a page asks for one, so a launch only pays for the character. */
  const seedBlock = built.match(/<script id="seed-data" type="application\/json">([\s\S]*?)<\/script>/);
  check('the seeds travel with the page', !!seedBlock, true);
  if (seedBlock) {
    const seeds = JSON.parse(seedBlock[1]);
    check('the eighteen features a fresh character starts with', seeds.features.length, 18);
    check('and the spells of the sheet', seeds.spells.length > 20, true);
    check('each with the level it sits at', seeds.spells.every((s) => s.name && s.level >= 0), true);
  }
  check('the page carries no library', built.indexOf('"key": "wizard-1-arcane-recovery"') < 0, true);
  const distFeatures = JSON.parse(readFileSync(resolve(root, 'dist', 'data', 'features.json'), 'utf8'));
  check('the library sits beside the page', distFeatures.features.length, 1017);
  check('and matches the data file', distFeatures.features.length, JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8')).features.length);
  const distClasses = JSON.parse(readFileSync(resolve(root, 'dist', 'data', 'classes.json'), 'utf8'));
  check('the classes sit beside it too', distClasses.classes.length, 12);
  check('the page is small without them', built.length < 400000, true);
  check('no character travels inside the page', /<script id="character-data"/.test(built), false);
  const distBook = JSON.parse(readFileSync(resolve(root, 'dist', 'data', 'spellbook.json'), 'utf8'));
  check('the book sits beside the page', distBook.spells.length > 100, true);
  check('and matches the data file', distBook.spells[0].name, JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8')).spells[0].name);
}


console.log('the bestiary');
{
  const bestiary = JSON.parse(readFileSync(resolve(root, 'data', 'bestiary.json'), 'utf8'));
  const creatures = bestiary.creatures || {};
  const keys = Object.keys(creatures);
  check('the bestiary travels with the app', keys.length > 20, true);
  check('the battle familiar is one of them', !!creatures['battle familiar'], true);
  check('and the dancing item of the bard', !!creatures['dancing item'], true);
  check('a block whose armour class is a formula says so', creatures['battle familiar'].acText, "11 + the spell's level + 2 (Brute only)");
  check('and holds no number for it', creatures['battle familiar'].ac, 0);
  check('a block with numbers holds them', creatures['skeleton'].ac, 14);
  check('and its hit points', creatures['skeleton'].hp, 13);
  check('an attack carries its bonus', creatures['skeleton'].actions[0].bonus, '5');
  check('and its damage', creatures['skeleton'].actions[0].damage, '1d6 + 3');
  check('the type of a creature is its kind', creatures['skeleton'].type, 'undead');

  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  const summoning = book.spells.filter((s) => s.summons);
  check('the spells that call a creature are marked', summoning.length, 19);
  check('the find familiar is one of them', summoning.some((s) => s.name === 'Find Familiar'), true);
  check('the conjure animals is not one, it is an effect', summoning.some((s) => s.name === 'Conjure Animals'), false);
  check('nor the conjure elemental', summoning.some((s) => s.name === 'Conjure Elemental'), false);
  check('nor the conjure minor elementals', summoning.some((s) => s.name === 'Conjure Minor Elementals'), false);
  check('nor the unseen servant, it has no block', summoning.some((s) => s.name === 'Unseen Servant'), false);
  check('a spell that calls nothing is not marked', summoning.some((s) => s.name === "Bigby's Hand"), false);
  check('nor a conjure of weapons', summoning.some((s) => s.name === 'Conjure Volley'), false);
  check('nor a polymorph', summoning.some((s) => s.name === 'True Polymorph'), false);
  check('the familiar names the beasts it brings', (book.spells.filter((s) => s.name === 'Find Familiar')[0].creatures || []).length, 11);
  check('a conjure names no creature at all', (book.spells.filter((s) => s.name === 'Conjure Animals')[0].creatures || []).length, 0);
  check('and the summon fey names the spirit it brings', (book.spells.filter((s) => s.name === 'Summon Fey')[0].creatures || []).join(', '), 'Fey Spirit');

  const features = JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8')).features;
  const classes = JSON.parse(readFileSync(resolve(root, 'data', 'classes.json'), 'utf8')).classes;
  check('a feature that brings a creature names it', (features.filter((f) => f.key === 'animatingPerformance')[0].creatures || []).join(', '), 'Dancing Item');
  check('and it says it summons', features.filter((f) => f.key === 'animatingPerformance')[0].summons, true);
  check('a feature that brings nothing does not', features.filter((f) => f.key === 'countercharm')[0].summons, false);

  /* What the character holds is the seed of the tab: the summons it can
     already call, the three of the bard and the five of the sorcerer. */
  const libraryOf = (rec) => {
    const out = [];
    const lists = rec.spells.lists || {};
    Object.keys(lists).forEach((lv) => (lists[lv] || []).forEach((n) => {
      const spell = book.spells.filter((x) => x.name === n)[0];
      if (spell && spell.summons) out.push(spell.name);
    }));
    (rec.char.features || []).forEach((f) => {
      const data = features.filter((x) => x.key === f.key)[0];
      if (data && data.creatures && data.creatures.length) out.push(data.name);
    });
    return out;
  };
  const bardRec = JSON.parse(readFileSync(resolve(root, 'characters', 'yngwie.json'), 'utf8')).record;
  const wendyRec = JSON.parse(readFileSync(resolve(root, 'characters', 'wendy.json'), 'utf8')).record;
  check('the bard calls three', libraryOf(bardRec).length, 3);
  check('the two spirits and the dancing item', libraryOf(bardRec).join(', '), 'Summon Fey, Summon Celestial, Animating performance');
  check('the sorcerer calls two', libraryOf(wendyRec).length, 2);
  check('the familiar and the objects', libraryOf(wendyRec).join(', '), 'Battle Familiar, Animate Objects');

  /* The page reads the same things, so it is run here with a character and
     a shell that answer, and what it offers is what the data says. */
  const core = {
    R: R, SR: C, ABILITIES: C.ABILITIES, SKILLS: C.SKILLS,
    LEVELS: R.LEVELS, WARLOCK_LEVEL: R.WARLOCK_LEVEL,
    features: features, book: book, bookByName: {},
    featureByKey: {},
    bestiary: { creatures: creatures },
    server: () => 'http://127.0.0.1:8123',
    readUrl: () => Promise.reject(new Error('no machine')),
    esc: (t) => String(t === undefined || t === null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    markup: (t) => String(t === undefined || t === null ? '' : t),
    field: () => '',
    renderBlocks: () => '',
    sourceTag: () => '',
    primaryAbility: () => 'cha',
    data: () => Promise.resolve(true),
    classInfo: (name) => classes.filter((c) => c.name === name)[0] || null,
    classRows: (ch) => (ch.classes || []).map((k) => {
      const info = classes.filter((c) => c.name === k.name)[0] || {};
      return { name: k.name, level: k.level, subclass: k.subclass || '', ability: info.ability, caster: info.caster, hd: info.hd };
    }),
    canonSource: (s) => s
  };
  book.spells.forEach((s) => { core.bookByName[s.name] = s; });
  features.forEach((f) => { core.featureByKey[f.key] = f; });
  const taken = {};
  const ctx = vm.createContext({ Sheet: { core: core, page: (spec) => { taken[spec.id] = spec; } } });
  vm.runInContext(readFileSync(resolve(root, 'src', 'pages', 'summons.js'), 'utf8'), ctx);

  const fakeEl = () => {
    const el = {
      innerHTML: '', textContent: '', value: '', hidden: false, dataset: {},
      listeners: {}, children: [],
      addEventListener: (kind, fn) => { el.listeners[kind] = fn; },
      querySelector: () => fakeEl(),
      querySelectorAll: () => [],
      closest: () => null,
      appendChild: (c) => { el.children.push(c); },
      click: () => { if (el.listeners.click) el.listeners.click({ target: el }); }
    };
    return el;
  };
  const page = fakeEl();
  const opened = [];
  const api = {
    character: () => bardRec,
    characters: () => ({ c1: bardRec }),
    state: { current: 'c1', ui: {} },
    save: () => {}, refresh: () => {}, toast: () => {},
    sheet: { open: (layer) => { opened.push(layer); }, search: () => '', close: () => {}, closeAll: () => {} },
    core: core
  };
  page.querySelector = (sel) => (sel === '#callSummon' ? page.call : fakeEl());
  page.call = fakeEl();
  taken.summons.mount(page, api);
  page.call.click();
  const rows = (opened[0] && opened[0].list ? opened[0].list.match(/data-src=/g) || [] : []).length;
  check('the page offers the three of the bard', rows, 3);
  check('and they are the same three', (opened[0].list.match(/data-src="([^"]+)"/g) || []).join(','), 'data-src="spell:Summon Fey",data-src="spell:Summon Celestial",data-src="feature:animatingPerformance"');
  const seeded = taken.summons.seed({}, true);
  check('a new character holds no creature', seeded.list.length, 0);

  /* The numbers the book writes as words, and the forms a creature comes
     in. */
  const celestial = creatures['celestial spirit'];
  check('the celestial spirit comes in two forms', (celestial.forms || []).length, 2);
  const avenger = (celestial.forms || []).filter((f) => f.id === 'avenger')[0];
  const defender = (celestial.forms || []).filter((f) => f.id === 'defender')[0];
  check('the avenger has its own armour class', avenger.acTerms.branches[0].terms[0].const, 11);
  check('and the defender another', defender.acTerms.branches[0].terms[0].const, 13);
  check('the avenger shoots a bow', avenger.actions.map((a) => a.name).indexOf('Radiant Bow') >= 0, true);
  check('and the defender has no bow', defender.actions.map((a) => a.name).indexOf('Radiant Bow'), -1);
  check('the defender has a mace', defender.actions.map((a) => a.name).indexOf('Radiant Mace') >= 0, true);
  check('the multiattack is counted by the level', avenger.actions[0].count.half, true);
  check('the hit points grow with the slot', celestial.hpTerms.branches[0].terms[1].perLevelAbove, 10);
  check('and only above the fifth level', celestial.hpTerms.branches[0].terms[1].above, 5);
  check('the armour class grows with the slot too', avenger.acTerms.branches[0].terms[1].level, 1);
  check('the damage of the bow is two dice of six', avenger.actions[1].damageParts.dice.count, 2);
  check('and the slot is added to it', avenger.actions[1].damageParts.flat[1].level, 1);
  check('the dancing item takes the proficiency of the caster', creatures['dancing item'].actions[0].damageParts.flat[0].prof, 1);
}
console.log(failures === 0 ? '\nall rules checks pass' : '\n' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
