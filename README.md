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
| +3d8 | adds 3d8 lightning on top of Elem |

The power slider swaps the spell. Eldritch blast fires 3 beams of 1d10+5 force. Scorching ray at levels 2 to 5 fires 3 to 6 beams of 2d6 fire.

The AC field is optional. Leave it empty and the app shows the damage of every beam. Set the target armor class and each beam is marked hit or miss, a miss shows no damage, and the total counts only the hits.

![A critical roll with hex and elementals](shots/final-crit.png)

## Run it

`dist/index.html` is the whole app: one file, no server, no network, 60 KB with the font inlined. Copy it to the phone, open it in Chrome, then Add to home screen for a full screen launcher.

To serve it to a phone on the same wifi:

```
python -m http.server 8123 --directory dist
```

## Build

`src/index.html` is the source. The only difference from `dist/index.html` is that the display font is inlined as base64.

```
node build.mjs
node test/rules.test.mjs
```

The rules engine lives in a `<script id="rules">` block that touches no DOM. The test suite extracts that block and checks the maths: crit thresholds, doubled dice, each toggle, each power, and the tally against an AC.

## Choices worth knowing

- The `+3d8` chip adds 3d8 lightning on top of the 2d8 from Elem, so both on means 5d8 lightning. The `EXTRAS` table in the rules block is the single place to change that.
- Scorching ray carries no flat bonus, only Eldritch blast does. The `flat` field of each power says so.
- Advantage rolls 3d20 and keeps the highest, as specified, where the rules book rolls 2.
- A critical doubles the dice of every damage group, of any type, and never the flat bonuses.
