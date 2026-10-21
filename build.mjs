import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const src = resolve(root, 'src');
const out = resolve(root, 'dist');

const html = readFileSync(resolve(src, 'index.html'), 'utf8');
const font = readFileSync(resolve(src, 'cinzel.woff2')).toString('base64');

const marker = "url('cinzel.woff2')";
if (!html.includes(marker)) throw new Error('font reference not found in src/index.html');

const built = html.replace(marker, `url('data:font/woff2;base64,${font}')`);
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'index.html'), built, 'utf8');

const kb = (Buffer.byteLength(built) / 1024).toFixed(1);
console.log(`dist/index.html written: ${kb} KB (font ${(font.length / 1024).toFixed(1)} KB base64)`);
