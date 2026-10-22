import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const src = resolve(root, 'src');
const out = resolve(root, 'dist');

const html = readFileSync(resolve(src, 'index.html'), 'utf8');
const font = readFileSync(resolve(src, 'cinzel.woff2')).toString('base64');

const marker = "url('cinzel.woff2')";
if (!html.includes(marker)) throw new Error('font reference not found in src/index.html');

const surge = readFileSync(resolve(root, 'data', 'wild-magic-surge-xphb.json'), 'utf8').trim();
const surgeTag = /(<script id="surge-data" type="application\/json">)[\s\S]*?(<\/script>)/;
if (!surgeTag.test(html)) throw new Error('surge data tag not found in src/index.html');

let built = html.replace(marker, `url('data:font/woff2;base64,${font}')`);
built = built.replace(surgeTag, (m, open, close) => open + surge + close);

const spells = readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8').trim();
const spellTag = /(<script id="spell-data" type="application\/json">)[\s\S]*?(<\/script>)/;
if (!spellTag.test(html)) throw new Error('spell data tag not found in src/index.html');
built = built.replace(spellTag, (m, open, close) => open + spells + close);

const features = readFileSync(resolve(root, 'data', 'features.json'), 'utf8').trim();
const featureTag = /(<script id="feature-data" type="application\/json">)[\s\S]*?(<\/script>)/;
if (!featureTag.test(html)) throw new Error('feature data tag not found in src/index.html');
built = built.replace(featureTag, (m, open, close) => open + features + close);
/* The pages and the shell are separate files, and the built page holds
   them inside, so the phone needs one file and nothing else. */
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)];
for (const m of scripts) {
  const file = resolve(src, m[1]);
  if (!existsSync(file)) throw new Error('the script ' + m[1] + ' is missing');
  const code = readFileSync(file, 'utf8');
  built = built.replace(m[0], () => '<script>\n' + code + '\n</script>');
}
if (/<script src=/.test(built)) throw new Error('a script was not inlined');

mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'index.html'), built, 'utf8');

const kb = (Buffer.byteLength(built) / 1024).toFixed(1);
console.log(`dist/index.html written: ${kb} KB (font ${(font.length / 1024).toFixed(1)} KB base64)`);
