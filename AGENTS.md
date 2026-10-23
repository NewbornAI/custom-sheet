# custom-sheet, for an agent

*What this repository is, where the seams are, and how to change the sheet without breaking it.*

The app is a character sheet and a dice roller. The shell holds the pages, the
store and the overlay. Every page is a file of its own under `src/pages/`, and
a page can be added, taken away or rewritten. This file says where the seams
are, so an agent can change the app without reading all of it.

## The shape of the repository

| Path | What lives there |
|---|---|
| `src/index.html` | the shell, the styles, and the two rules blocks |
| `src/shell.js` | the registry, the store, the overlay, the packages, the repository, the library |
| `src/github.js` | the sign in and the calls to GitHub |
| `src/pages/*.js` | one file per page |
| `data/*.json` | the rules data, fetched by `tools/fetch-5e-data.mjs` |
| `app/` | the Android shell that wraps the same page |
| `tools/` | the build, the data fetch, the icon maker |
| `test/rules.test.mjs` | the rules engine and the data |
| `test/github.test.mjs` | the sign in and the calls to GitHub |
| `test/address.test.mjs` | the address of a file on GitHub |

The README is the human entry point. This file is the agent one.

## The commands

```
node build.mjs                                  # src to dist, the font and the data inlined
node test/rules.test.mjs                        # the rules engine and the data
node test/github.test.mjs                       # the sign in and the calls to GitHub
node test/address.test.mjs                      # the address of a file on GitHub
node tools/fetch-5e-data.mjs                    # refetch the data from 5e.tools
node tools/serve.mjs                              # serve the build and the whole bestiary
powershell -ExecutionPolicy Bypass -File tools/build-apk.ps1
```

The build writes `dist/index.html` and the three data files beside it. The
page is one file, and the data sits next to it and is read when a page asks
for it.

## The seams

**A page.** A page describes itself and the shell gives it a tab.

```js
Sheet.page({
  id: 'notes',
  title: 'Notes',
  order: 5,
  blurb: 'The notes of the character.',
  html: '<div class="charbody" id="notesBody"></div>',
  mount: function (root, a) { /* find the nodes */ },
  render: function (a) { /* paint them */ }
});
```

A page may also carry `hidden` (no tab of its own, the gear opens it), `home`
(the page the app opens on), `always` (a tab every character has, whatever the
character chose), `slice` (the key it owns in the record of a character),
`seed(saved, fresh, rec)` (what a new character starts from) and `css` (its own
styles).

The page gets `a` at mount and at render:

| On `a` | What it is |
|---|---|
| `a.character()` | the record of the character being played |
| `a.characters()` | every character, by id |
| `a.state` | the whole store |
| `a.save()` | write the store down |
| `a.refresh()` | paint the page again |
| `a.show(id)` | go to a page |
| `a.toast(text)` | say something for a moment |
| `a.sheet.open(layer)` | open the overlay |
| `a.core` | the shared helpers, below |
| `a.pages` | the pages that exist |

The helpers on `a.core` are the ones a page leans on: `esc` for text that
goes into markup, `markup` for the marked pieces of a spell, `featureByKey`
for the library, `data(name)` to read a file, `plugFeature(key)` to drop a
feature of the library into the character, `wrenchButton` for the edit mode,
`pushSnapshot` before a change a rest can take back, and `themes` and
`icons` for the gallery of the character.

**The overlay.** `a.sheet.open({ id, title, meta, list, onList })` opens a
layer of the sheet. `onList` gets the click, and `ev.target.closest(...)`
finds the row.

**The rules.** Two blocks in `src/index.html` hold the maths, and neither
touches the DOM: `window.Rules` for the rolls and `window.SheetRules` for
the character. The test suite pulls both out and checks them, so a change to
a rule is a change to the test.

**The data.** The loader reads `data/features.json`, `data/spellbook.json`,
`data/classes.json` and `data/bestiary.json` when a page asks, and fills the
live shapes in place: `C.featureByKey`, `C.bookByName`, `C.classData`,
`C.bestiary`. A page that took its reference at load still sees the data
arrive, because the shell repaints.

## The package

A character leaves the app as a package, and a package can carry pages of its
own.

```json
{
  "kind": "custom-sheet-character",
  "version": 1,
  "name": "Yngwie",
  "saved": "2026-10-22T18:00:00.000Z",
  "record": {
    "char": {}, "spells": {}, "volley": {},
    "pages": ["volley", "spells", "features"],
    "theme": "blueRed", "icon": "guitar"
  },
  "pages": [
    {
      "id": "notes",
      "title": "Notes",
      "order": 5,
      "blurb": "The notes of the character.",
      "html": "<div class=\"charbody\" id=\"notesBody\"></div>",
      "css": "#notesBody { color: var(--ink); }",
      "mount": "function (root, a) { ... }",
      "render": "function (a) { ... }"
    }
  ]
}
```

The `mount` and the `render` of a plugin page are the source of a function,
and they run with the rights of the app itself. A package is only as safe as
the person who sent it.

An import never replaces a character that is already there. A name that is
taken gets a number at the end.

## The exchange

A character travels as a package, and there are three ways for one to
arrive. None of them asks the player to type a secret.

- **A file.** `exportCharacter` writes the package and the phone offers it to
  send. `pickFile` opens the explorer of the phone.
- **A link.** `linkOf(pkg)` packs the package into a link, squeezed and
  encoded, and the character rides in the fragment of the link, which no
  server ever sees. `importAny(text)` reads a link back, and falls back to
  `importUrl` when the text is the address of a file that holds a package.
- **The shelf.** A folder in the public repository of the app, read with no
  secret: `shelfCharacters(ref)` and `shelfBranches()`. A branch is a shelf
  of a player, and anybody may open one. A row of the shelf carries the name,
  the raw address of the file and the address a browser shows.
- **The address of a file on GitHub is read as well as the raw one.**
  `rawAddress(url)` turns `github.com/o/r/blob/ref/path` and
  `github.com/o/r/raw/ref/path` into `raw.githubusercontent.com/o/r/ref/path`,
  because the page a browser shows answers no cross origin request and the
  raw file does. `importAny` and `importUrl` both go through it.

## The shelf writes back

`src/github.js` holds the sign in and the calls. It answers to two
transports: the shell of the phone (`SheetNet.request(url, method, body,
token)`, which answers with `{status, body}`) and the network of a browser
(`fetch`, which GitHub lets across origins for the API but not for a sign
in). The device flow is a POST to `https://github.com/login/device/code`
then a poll of `https://github.com/login/oauth/access_token`; the client id
is public and lives in that file, and no secret is needed.

The token is kept in `state.ui.token` and the login in `state.ui.login`.
The write path is one call: `putFile` PUTs a file into `characters/` on a
branch, through the contents API, so a branch that is not there yet is made
with `createBranch` first. `createRepo` makes a repository of the player and
`forkRepo` forks the one of the project.

The helpers the shell exposes: `shelfWrite(pkgText, fileName)`,
`shelfBranch(name)`, `shelfCreateRepo(name, isPrivate)`, `shelfFork()`,
`ghToken()`, `ghSetToken(t)`, `ghLogin()`, `ghSetLogin(l)`,
`ghBranch()`, `ghSetBranch(b)`.

## The house rules

- English, and the prose has no em dashes.
- The data files carry the text of the SRD and stay under Creative Commons
  Attribution 4.0. The code is under the MIT licence. The NOTICE file says
  where the text came from, and it travels with any change to the data.
- The signing key is not in the repository, on purpose. A published key would
  let anybody sign an update of the app. The build makes one when it is
  missing.
- One writer per file. Read before you write, and run the test after.
- The shelf holds one file per character on `main`, and a branch is for a
  character that is not ready to be shared yet.
