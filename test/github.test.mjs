/* The GitHub module: the sign in, the calls, the answers. */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function check(what, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log('  no   ' + what + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
    process.exitCode = 1;
    return;
  }
  console.log('  ok   ' + what);
  passed += 1;
}

/* The module answers to a window, and asks the network through it. */
const calls = [];
const answers = {};
const window = {
  SheetNet: null,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  TextEncoder: TextEncoder
};
global.window = window;
global.btoa = window.btoa;
global.TextEncoder = TextEncoder;
global.fetch = function (url, opts) {
  calls.push({ url: url, method: opts.method, body: opts.body, headers: opts.headers });
  const key = url + ' ' + (opts.method || 'GET');
  const answer = answers[key] || { status: 200, body: '{}' };
  return Promise.resolve({
    status: answer.status,
    text: function () { return Promise.resolve(answer.body); }
  });
};

const code = readFileSync(resolve(root, 'src', 'github.js'), 'utf8');
new Function('window', 'fetch', 'btoa', 'TextEncoder', code)(window, global.fetch, global.btoa, TextEncoder);
const G = window.SheetGit;

console.log('the module answers');
check('it is there', typeof G, 'object');
check('the client id is public and in the source', G.clientId.length > 10, true);
check('it asks for no secret', /client_secret/.test(code), false);

console.log('the sign in');
await G.deviceStart('public_repo');
const start = calls[calls.length - 1];
check('it asks for a device code', start.url, 'https://github.com/login/device/code');
check('it says what it wants', start.method, 'POST');
check('it names the app', JSON.parse(start.body).client_id, G.clientId);
check('it asks for the public shelf only', JSON.parse(start.body).scope, 'public_repo');

console.log('the calls');
await G.whoAmI('tok');
const who = calls[calls.length - 1];
check('it asks who the player is', who.url, 'https://api.github.com/user');
check('it carries the token', who.headers.Authorization, 'Bearer tok');

await G.listCharacters('NewbornAI/custom-sheet', 'main', '');
const list = calls[calls.length - 1];
check('it asks for the folder of the shelf', list.url, 'https://api.github.com/repos/NewbornAI/custom-sheet/contents/characters?ref=main');

answers['https://api.github.com/repos/NewbornAI/custom-sheet/contents/characters GET'] = {
  status: 200,
  body: JSON.stringify([{ name: 'a.json', type: 'file' }, { name: 'README.md', type: 'file' }])
};
const rows = await G.listCharacters('NewbornAI/custom-sheet', '', '');
check('it keeps the packages and drops the rest', rows.map(function (r) { return r.name; }), ['a.json']);

answers['https://api.github.com/repos/NewbornAI/custom-sheet/contents/characters/x.json?ref=main GET'] = { status: 200, body: JSON.stringify({ sha: 'abc' }) };
answers['https://api.github.com/repos/NewbornAI/custom-sheet/contents/characters/x.json PUT'] = { status: 201, body: '{}' };
await G.putFile('NewbornAI/custom-sheet', 'characters/x.json', 'hello', 'a character', 'main', 'tok');
const put = calls[calls.length - 1];
check('it writes the file', put.method, 'PUT');
const body = JSON.parse(put.body);
check('it carries the text', Buffer.from(body.content, 'base64').toString('utf8'), 'hello');
check('it names the branch', body.branch, 'main');
check('it carries the old hash', body.sha, 'abc');

console.log('the shape of a shelf');
await G.createRepo('custom-sheet-NewbornAI', 'tok', false);
const repo = calls[calls.length - 1];
check('it makes a repository', repo.url, 'https://api.github.com/user/repos');
check('it makes it public and ready', JSON.stringify([JSON.parse(repo.body).auto_init, JSON.parse(repo.body).private]), '[true,false]');

console.log('');
if (process.exitCode) {
  console.log('a check failed');
} else {
  console.log('all github checks pass');
}
