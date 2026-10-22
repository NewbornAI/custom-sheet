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

/* The book, the library of features and the classes travel beside the page
   and are read when a page asks for them, so the page the phone opens at
   launch carries only the character. */
const bookJson = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
const featuresJson = JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8'));
mkdirSync(resolve(out, 'data'), { recursive: true });
writeFileSync(resolve(out, 'data', 'spellbook.json'), JSON.stringify(bookJson) + '\n', 'utf8');
writeFileSync(resolve(out, 'data', 'features.json'), JSON.stringify(featuresJson) + '\n', 'utf8');
writeFileSync(resolve(out, 'data', 'classes.json'), readFileSync(resolve(root, 'data', 'classes.json'), 'utf8'), 'utf8');

/* What a character needs at the start: the features it is seeded with, and
   the spells of the app's own sheet. */
const seeds = {
  features: (featuresJson.features || []).filter((f) => f.seed),
  spells: ((bookJson.seed || [])).map((s) => ({ name: s.name, level: s.level }))
};
built = built.replace(/(<script id="seed-data" type="application\/json">)[\s\S]*?(<\/script>)/, (m, open, close) => open + JSON.stringify(seeds) + close);

const characters = readFileSync(resolve(root, 'data', 'characters.json'), 'utf8').trim();
const characterTag = /(<script id="character-data" type="application\/json">)[\s\S]*?(<\/script>)/;
if (!characterTag.test(html)) throw new Error('character data tag not found in src/index.html');
built = built.replace(characterTag, (m, open, close) => open + characters + close);


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
