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
  check('fifty rows', surge.rows.length, 50);

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

  const hit = R.rollSurge(surge.rows, first(40));
  check('row 39 to 40', [hit.from, hit.to], [39, 40]);
  check('rolls the dice the row asks for', [hit.dice.length, hit.dice[0].label, hit.dice[0].values.length], [1, '2d10', 2]);
  check('keeps the row text', hit.text, 'You regain 2d10 hit points.');

  const plain = R.rollSurge(surge.rows, first(30));
  check('a row without dice rolls nothing', plain.dice.length, 0);
}

console.log('the built page carries the table');
{
  const built = readFileSync(resolve(root, 'dist', 'index.html'), 'utf8');
  const block = built.match(/<script id="surge-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!block) { check('the table is inlined', false, true); }
  else {
    const parsed = JSON.parse(block[1]);
    check('the table is inlined with fifty rows', parsed.rows.length, 50);
    check('the inlined table matches the data file', parsed.rows[0].text, JSON.parse(readFileSync(resolve(root, 'data', 'wild-magic-surge-xphb.json'), 'utf8')).rows[0].text);
  }
}

console.log(failures === 0 ? '\nall rules checks pass' : '\n' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
