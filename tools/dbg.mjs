import { readFileSync } from 'node:fs';
const html = readFileSync('C:/agentic/bulle/workspace/surge.html', 'utf8');
console.log('bytes', html.length);
const tables = html.split(/<table class="wiki-content-table">/);
console.log('segments', tables.length);
let table = null;
for (const t of tables) { if (t.includes('Wild Magic Surge')) { table = t; break; } }
console.log('found table', !!table, table ? table.length : 0);
if (table) {
  const parts = table.split(/<tr>/);
  console.log('tr segments', parts.length);
  console.log('segment1 head:', JSON.stringify(parts[1].slice(0, 200)));
  const cells = parts[1].split(/<\/tr>/)[0].match(/<td[^>]*>([\s\S]*?)<\/td>/g);
  console.log('cells', cells ? cells.length : 0);
}
