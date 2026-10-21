import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('C:/agentic/bulle/workspace/class-sorcerer.json.json', 'utf8'));
const cls = c.class.find((x) => x.source === 'XPHB');
for (const [i, g] of cls.classTableGroups.entries()) {
  console.log('=== group ' + i + ' ===');
  console.log('labels:', JSON.stringify(g.colLabels));
  console.log('rows:', g.rows.length);
  console.log(JSON.stringify(g.rows.slice(0, 3), null, 1).slice(0, 2000));
}
