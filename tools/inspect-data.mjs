import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync('C:/agentic/eldritch-blast/data/spells-sorcerer-xphb.json', 'utf8'));
for (const lv of [0, 1, 2]) {
  const list = d.spells.filter((s) => s.level === lv);
  console.log('level ' + lv + ' (' + list.length + '): ' + list.map((s) => s.name).join(', '));
}
const s0 = d.spells.find((s) => s.name === 'Shield');
console.log('--- Shield ---');
console.log(JSON.stringify(s0, null, 1).slice(0, 1200));
const surge = JSON.parse(readFileSync('C:/agentic/eldritch-blast/data/wild-magic-surge-xphb.json', 'utf8'));
console.log('--- surge rows ---');
surge.rows.slice(0, 3).forEach((r) => console.log(r.from + '-' + r.to + ': ' + r.text.slice(0, 180)));
console.log('surge row with dice:');
surge.rows.filter((r) => /\dd\d+/.test(r.text)).forEach((r) => console.log(r.from + '-' + r.to + ': ' + r.text.slice(0, 150)));
