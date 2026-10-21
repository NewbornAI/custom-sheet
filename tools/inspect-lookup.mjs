import { readFileSync } from 'node:fs';
const lookup = JSON.parse(readFileSync('C:/agentic/eldritch-blast/tools/.5e-cache/gendata-spell-source-lookup.json', 'utf8'));
const x = lookup.xphb;
for (const name of ['eldritch blast', 'fire bolt', 'hex', 'scorching ray', 'acid splash']) {
  const e = x[name];
  console.log(name + ':', e ? JSON.stringify(e.class && e.class.XPHB) : 'MISSING');
}
console.log('--- how many xphb spells have a Sorcerer class ---');
let withSorc = 0, cantrips = [];
for (const k of Object.keys(x)) {
  const c = x[k].class && x[k].class.XPHB;
  if (c && c.Sorcerer) { withSorc++; if (c.Sorcerer) cantrips.push(k); }
}
console.log('count:', withSorc);
