import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/efilo/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const tries = [
  'https://5e.tools/spells.html?filter=class%3DSorcerer',
  'https://5e.tools/spells.html?filter=class%3DSorcerer%20level%3D1',
  'https://5e.tools/spells.html?filter=level%3D1%20class%3DSorcerer'
];
for (const url of tries) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  const res = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#listtable tr, table tr')].filter((tr) => tr.querySelector('a[href*="#"]'));
    const names = rows.map((tr) => tr.children[0] ? tr.children[0].textContent.trim() : '').filter(Boolean);
    return { rows: rows.length, sample: names.slice(0, 6), body: document.body.innerText.slice(0, 120) };
  });
  console.log(url);
  console.log('  rows:', res.rows, '| sample:', JSON.stringify(res.sample));
}
await browser.close();
