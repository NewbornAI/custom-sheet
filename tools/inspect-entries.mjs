import { readFileSync } from 'node:fs';
const raw = JSON.parse(readFileSync('C:/agentic/eldritch-blast/tools/.5e-cache/spells-xphb.json', 'utf8')).spell;
const fireball = raw.find((s) => s.name === 'Fireball');
console.log('--- Fireball entries ---');
console.log(JSON.stringify(fireball.entries, null, 1).slice(0, 2600));
console.log('--- entriesHigherLevel ---');
console.log(JSON.stringify(fireball.entriesHigherLevel, null, 1).slice(0, 1200));
