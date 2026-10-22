import { readFileSync } from 'node:fs';
const dir = 'C:/agentic/eldritch-blast/tools/.5e-cache/';
for (const f of ['spells-xphb', 'spells-phb', 'spells-xge', 'spells-au', 'spells-scc']) {
  let raw;
  try { raw = JSON.parse(readFileSync(dir + f + '.json', 'utf8')).spell; } catch (e) { continue; }
  const s = raw.find((x) => x.name === 'Chaos Bolt');
  if (!s) { console.log(f + ': no chaos bolt'); continue; }
  console.log('--- ' + f + ' ---');
  console.log('level', s.level, 'range', JSON.stringify(s.range), 'time', JSON.stringify(s.time));
  const walk = (arr, path) => {
    for (const e of arr || []) {
      if (!e || typeof e !== 'object') continue;
      if (e.type === 'table') { console.log('TABLE at', path, JSON.stringify(e.colLabels)); console.log(JSON.stringify(e.rows.slice(0, 2), null, 1)); return true; }
      if (e.entries && walk(e.entries, path + '/' + (e.name || e.type))) return true;
    }
    return false;
  };
  walk(s.entries, 'entries');
}
