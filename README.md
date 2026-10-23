# custom-sheet

*Open source character sheet tracker designed for agents. The goal: character tracker fully customizable via natural language.*

A character sheet and a dice roller for one table, on a phone. The sheet is a single web page, and the same page ships as an Android app that works with no network at all.

The rules text comes from the SRD. The characters are yours. The shape of the app is a set of pages, and any of them can be added, taken away or rewritten, by hand or by an agent.

![The character sheet of Yngwie, the bard](shots/custom-sheet-character.png)

## The pages

| Page | What it does |
|---|---|
| character | The sheet of the character. It is always there. |
| spells | The spell slots, the sorcery points and the list of spells. |
| features | What the character has and what is left of it. |
| volley | The spell slider, the toggles and the beams. |
| summons | The creatures at the table. Off until the settings turn it on. |
| settings | The pages of the app, the shelf, the exchange and the update. |

Each page is one file in `src/pages/` and carries its own blurb. The seams, the package format and the house rules are in [`AGENTS.md`](AGENTS.md).

## Install it

### On a phone

The APK carries the page in its assets, so it works offline and keeps its characters between launches.

```
https://raw.githubusercontent.com/NewbornAI/custom-sheet/main/dist/custom-sheet.apk
```

Open that on the phone, allow the install, and the icon lands on the home screen. The signing key is deliberately not in this repository, so an APK you build yourself cannot update that one in place: uninstall the old one first.

### On a desktop

```
node tools/serve.mjs 8123
```

Then open `http://127.0.0.1:8123/index.html`. That server also holds the bestiary, and the summons page fetches a creature from it when the app does not carry the one you need.

## Build it

```
node build.mjs                                  # src to dist, the font and the data inlined
node test/rules.test.mjs                        # the rules engine and the data
node test/github.test.mjs                       # the sign in and the calls to GitHub
node test/address.test.mjs                      # the address of a file on GitHub
node tools/fetch-5e-data.mjs                    # refetch the data from 5e.tools
node tools/serve.mjs                            # serve the build and the whole bestiary
powershell -ExecutionPolicy Bypass -File tools/build-apk.ps1
```

The Android shell needs the command line tools, android-34 and build-tools; `tools/install-android-sdk.ps1` puts them in place.

## The data

The text of the rules is the System Reference Document, fetched into the files under `data/`.

| File | What it holds |
|---|---|
| `classes.json` | the twelve classes of the 2024 handbook and their 123 archetypes |
| `features.json` | 1017 features of those classes and archetypes, with their text |
| `spellbook.json` | 397 spells, with the classes that can learn each one |
| `bestiary.json` | the stat blocks the spells and the features name, with their actions |
| `wild-magic-surge-xphb.json` | the surge table of the 2024 handbook |
| `spell-sheet.csv` | the spells of the sheet of the table, one line each |

`tools/fetch-5e-data.mjs` pulls them from 5e.tools, and the build writes them beside the page so the page itself stays small.

## The characters

A device with no character opens on the ways in: a class, nothing, a file someone sent, a link, or a character from the shelf. Nothing ships inside the app.

**The shelf** is `characters/`, one package per file, read by every app with no secret at all. Drop a file in and commit it, or open a branch for a character that is not ready to share. The app can also write back to GitHub with a device flow, so nobody types a token. The format and the calls are in [`AGENTS.md`](AGENTS.md).

## For agents

The README is the human entry point. [`AGENTS.md`](AGENTS.md) is the agent one: the layout, the seams, the package format and the house rules.

## The licence

The code is under the MIT licence, in `LICENSE`.

The text of the rules in the data files is under the Creative Commons Attribution 4.0 International Licence, and `NOTICE` says where it came from, names the licence and links it. The data was taken from 5e.tools and laid out by this project.

Dungeons & Dragons, D&D and the D20 logo are trademarks of Wizards of the Coast LLC. This project is not affiliated with, endorsed by or sponsored by Wizards of the Coast. The font Cinzel is under the SIL Open Font Licence 1.1.

## The layout

```
src/          the shell and one file per page
data/         the rules data
app/          the Android shell that wraps the same page
tools/        the build, the data fetch, the server, the icon maker
test/         the test suites
characters/   the shelf: one package per file
shots/        the screenshots
```

One file per subject. The file-level map is in [`AGENTS.md`](AGENTS.md).
