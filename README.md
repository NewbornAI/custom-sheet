# Volley

*Eldritch blast and scorching ray roller for one sorcerer, built to fit a phone screen.*

## What it rolls

Default: attack d20+9, critical on a natural 20, which doubles every damage die. Damage is 1d10+5 force. One tap rolls the whole volley and every die lands on screen.

| Control | Effect |
|---|---|
| Adv | the attack rolls 3d20 and keeps the highest |
| Hex | adds 1d6 necrotic |
| Curse | adds 4 flat damage, critical on 19 or 20 |
| Elem | adds 2d8 lightning, and brings the +3d8 chip out |
| +3d8 | upgrades the lightning from 2d8 to 3d8 |

The power slider swaps the spell. Eldritch blast fires 3 beams of 1d10+5 force. Scorching ray at levels 2 to 5 fires 3 to 6 beams of 2d6 fire.

The AC field is optional. Leave it empty and the app shows the damage of every beam. Set the target armor class and each beam is marked hit or miss, a miss shows no damage, and the total counts only the hits.

![A critical roll with hex and elementals](shots/final-crit.png)

## The spell tab

A tracker for the character's slots and spell list, built for one hand at the table.

- **The top bar** holds the DC and the sorcery points, each with its own minus and plus, and two toggles: Cunning restores one warlock slot, and a sorcerer rest restores half your sorcerer level in sorcery points.
- **The slot strip** runs across the top: the levels left to right, and under each one its slots stacked as pips. Filled means you still have it, and tapping a pip sets that level to that count. The arrow beside a level shows the spells of that level.
- **The spell list** shows one card per spell with its casting time, range, duration and components. Tap a card for the full description, and hold and drag a card to reorder the list. The plus at the head of the list opens the grimoire for that level.
- **The wrench** in the top right turns on the edit mode, where each level grows minus and plus buttons for the maximum number of slots, and the sorcerer level can be changed. A level with no slots is dimmed, which is how level 5 starts out until you unlock it.

The spell list is seeded with the cantrips and the spells the character is known to have, and everything else comes from the grimoire.

## The wild magic surge page

The second tab rolls on the Wild Magic Surge table from the 2024 Player's Handbook, the same one 5e.tools serves under its XPHB source. It rolls d100, shows the range it landed on and the effect text, and rolls any dice the effect names: eight of the fifty rows ask for dice, so the app rolls them and shows the values and the total.

The table is never typed by hand. `tools/fetch-5e-data.mjs` pulls it out of the 5e.tools class data, parses it into `data/wild-magic-surge-xphb.json`, and refuses to write a table that does not cover 1 to 100 exactly once. The build inlines that JSON into the page, and the test suite checks the inlined copy against the file.

The same script pulls the spell book: every sorcerer and warlock spell of the 2024 Player's Handbook, with its casting time, range, duration, components and text, into `data/spells-sorcerer-xphb.json`.

```
node tools/fetch-5e-data.mjs
```

The 2014 table is a different file with the same shape, so swapping editions means pointing the build at it.

## Run it

`dist/index.html` is the whole app: one file, no server, no network, 60 KB with the font inlined. Copy it to the phone, open it in Chrome, then Add to home screen for a full screen launcher.

To serve it to a phone on the same wifi:

```
python -m http.server 8123 --directory dist
```

## The Android app

The same page ships as an installed app, with no browser and no server. The APK lives at `dist/volley.apk` and carries the page in its assets, so it works offline and keeps its state between launches.

```
tools\install-android-sdk.ps1   # once: command line tools, android-34, build-tools
tools\build-apk.ps1             # resources, dex, sign
```

`app/` holds the shell: one activity, a WebView on `file:///android_asset/index.html`, portrait locked, dark background, vibration allowed so the roll still buzzes.

The signing key is `keys/volley.keystore` and it is in git on purpose: the phone only accepts an update signed with the same key, so losing it means reinstalling from scratch.

To put it on the phone, serve the folder and open the file there:

```
python -m http.server 8123 --directory dist
```

Then on the phone open `http://<this machine>:8123/volley.apk`. Chrome says the file can harm the device, tap Download anyway, and allow installs from that source when it asks. The Volley icon lands on the home screen and opens full screen, offline.

## Build

`src/index.html` is the source. The only difference from `dist/index.html` is that the display font is inlined as base64.

```
node build.mjs
node test/rules.test.mjs
```

The rules engine lives in a `<script id="rules">` block that touches no DOM. The test suite extracts that block and checks the maths: crit thresholds, doubled dice, each toggle, each power, and the tally against an AC.

## Choices worth knowing

- Minor element and its plus chip are one choice, not two layers: 2d8 lightning, or 3d8 once the chip is on. The `EXTRAS` table in the rules block is the single place to change that.
- Scorching ray carries no flat bonus, only Eldritch blast does. The `flat` field of each power says so.
- Advantage rolls 3d20 and keeps the highest, as specified, where the rules book rolls 2.
- A critical doubles the dice of every damage group, of any type, and never the flat bonuses.
