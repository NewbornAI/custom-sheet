/**
 * The machine that serves the app.
 *
 *   node tools/serve.mjs [port]
 *
 * It answers two routes. The build route serves the page, the data beside it
 * and the package of the update, the way the update route expects. The
 * bestiary route serves every creature the cache holds, so a player who
 * needs a creature the app does not carry can fetch it from here.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBestiary, creatureRecord } from './bestiary.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const cache = resolve(root, 'tools', '.5e-cache');
const port = Number(process.argv[2] || process.env.PORT || 8123);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.apk': 'application/vnd.android.package-archive'
};

/* Every monster of the cache, by its name, and the list of them the app
   asks for. */
const bestiary = loadBestiary(cache);
const creatures = [];
Object.keys(bestiary).forEach((key) => {
  const item = bestiary[key][0];
  if (!item) return;
  creatures.push({ key: key, name: item.name, source: item.source, cr: item.cr });
});
creatures.sort((a, b) => a.name.localeCompare(b.name));

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  let path = '/';
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return send(res, 400, 'bad address');
  }

  if (path === '/bestiary/index.json') {
    return send(res, 200, JSON.stringify({ creatures: creatures }), TYPES['.json']);
  }
  if (path.indexOf('/bestiary/') === 0 && path.slice(-5) === '.json') {
    const key = path.slice('/bestiary/'.length, -5).toLowerCase();
    const list = bestiary[key];
    if (!list || !list.length) return send(res, 404, 'no such creature');
    return send(res, 200, JSON.stringify(creatureRecord(list[0])), TYPES['.json']);
  }

  /* The build, the data beside it and the package of the update. */
  const wanted = path === '/' ? '/index.html' : path;
  const full = resolve(dist, '.' + normalize(wanted));
  if (full.indexOf(dist) !== 0) return send(res, 403, 'no');
  try {
    const body = await readFile(full);
    return send(res, 200, body, TYPES[extname(full).toLowerCase()] || 'application/octet-stream');
  } catch (e) {
    return send(res, 404, 'not found');
  }
});

server.listen(port, () => {
  console.log('serving ' + dist + ' and ' + creatures.length + ' creatures on port ' + port);
});
