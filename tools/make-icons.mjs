import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require('C:/Users/efilo/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const svg = readFileSync(resolve(root, 'tools', 'icon.svg'), 'utf8');

const browser = await chromium.launch({ channel: 'chrome' });
for (const [density, size] of Object.entries(sizes)) {
  const dir = resolve(root, 'app', 'res', 'mipmap-' + density);
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent('<style>html,body{margin:0;padding:0;background:transparent}</style>' +
    '<div style="width:' + size + 'px;height:' + size + 'px">' + svg + '</div>');
  await page.screenshot({ path: resolve(dir, 'ic_launcher.png'), omitBackground: true });
  await page.close();
  console.log('ic_launcher.png ' + density + ' ' + size + 'px');
}
await browser.close();
