/**
 * Fetches the 2024 Player's Handbook Wild Magic Surge table and writes it as JSON.
 * The table is printed as a two column pair, so every markup row carries two entries.
 *
 *   node tools/fetch-surge-table.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://dnd5e.wikidot.com/sorcerer:wild-magic';

const ENTITIES = {
  '&rsquo;': "'", '&lsquo;': "'", '&apos;': "'", '&amp;': '&',
  '&ldquo;': '"', '&rdquo;': '"', '&mdash;': ' - ', '&ndash;': '-',
  '&hellip;': '...', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&times;': 'x', '&minus;': '-', '&plusmn;': '+/-'
};

function decode(text) {
  return text
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, (m) => (m.toLowerCase() in ENTITIES ? ENTITIES[m.toLowerCase()] : m));
}

function plain(cell) {
  return decode(cell.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

const html = await (await fetch(URL, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })).text();

const tables = html.split(/<table class="wiki-content-table">/);
let table = null;
for (const t of tables.slice(1)) {
  if (t.includes('Wild Magic Surge') && t.includes('<td')) { table = t; break; }
}
if (!table) throw new Error('Wild Magic Surge table not found');

const rows = [];
for (const tr of table.split(/<tr>/).slice(1)) {
  const cells = tr.split(/<\/tr>/)[0].match(/<td[^>]*>([\s\S]*?)<\/td>/g);
  if (!cells) continue;
  const values = cells.map((c) => plain(c));
  for (let i = 0; i + 1 < values.length; i += 2) {
    const range = values[i].match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (!range) continue;
    let from = Number(range[1]);
    let to = Number(range[2]);
    if (to < from) to = 100;   /* the last row reads 99-00 */
    rows.push({ from: from, to: to, text: values[i + 1] });
  }
}

rows.sort((a, b) => a.from - b.from);

let covered = 0;
for (const r of rows) {
  if (r.from !== covered + 1) throw new Error('gap in the table at ' + r.from);
  if (r.to < r.from) throw new Error('bad range at ' + r.from);
  covered = r.to;
}
if (covered !== 100) throw new Error('the table covers ' + covered + ' values, not 100');

const out = {
  name: 'Wild Magic Surge',
  edition: "2024 Player's Handbook, the Sorcerer's Wild Magic Surge table",
  source: URL,
  fetched: new Date().toISOString().slice(0, 10),
  rows
};

mkdirSync(resolve(root, 'data'), { recursive: true });
const file = resolve(root, 'data', 'wild-magic-surge-xphb.json');
writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('wrote ' + rows.length + ' rows covering 1-100 to data/wild-magic-surge-xphb.json');
