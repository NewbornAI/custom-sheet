/* The summons page: the creatures a character has called to the table.
   A summon carries a name the player may rename, an armour class, the hit
   points, the attacks with their bonus and their damage, and the slot that
   paid for it. What the block of the creature says is worked out with the
   level of that slot, so a spirit that is called at a higher level carries
   the numbers of that level.

   The stats are edited with the wrench, the way the rest of the app edits
   a character. What is left when the wrench is off is the table: the hit
   points to move and the attacks to roll. */
(function () {
  'use strict';

  var C = Sheet.core;

  var api = null;       /* the shell gives it at mount */
  var E = {};           /* the elements of the page */
  var built = null;     /* what the cards were built for */
  var machine = null;   /* the creatures the machine holds, once it answered */
  var editing = false;  /* the wrench turns the stats editable */

  /* ---- the slice of the character ---- */

  function slice() {
    var rec = api.character();
    if (!rec.summons) rec.summons = { list: [] };
    if (!rec.summons.list) rec.summons.list = [];
    return rec.summons;
  }

  function summons() { return slice().list; }

  function commit() { api.save(); api.refresh(); }

  function byId(id) {
    var found = null;
    summons().forEach(function (s) { if (s.id === id) found = s; });
    return found;
  }

  /* ---- the creatures the app knows ---- */

  function library() { return (C.bestiary && C.bestiary.creatures) || {}; }

  /* A creature is found by the name the data carries, which is the lowercased
     name. The name of a creature may carry its size, as the animated objects
     do, so a name that is not there is looked for without it. */
  function creatureByName(name) {
    if (!name) return null;
    var all = library();
    var key = String(name).toLowerCase();
    if (all[key]) return all[key];
    var bare = key.replace(/\s*\([^)]*\)\s*$/, '');
    if (all[bare]) return all[bare];
    var keys = Object.keys(all);
    for (var i = 0; i < keys.length; i++) {
      if (String(all[keys[i]].name || '').toLowerCase() === key) return all[keys[i]];
    }
    return null;
  }

  function keyOf(block) {
    var all = library();
    var keys = Object.keys(all);
    for (var i = 0; i < keys.length; i++) {
      if (all[keys[i]] === block) return keys[i];
    }
    return '';
  }

  /* ---- the summons the character can call ---- */

  /* A spell summons when the book says so, and a feature brings a creature
     when its text names one. What the character already has is the seed. */
  function sources() {
    var rec = api.character();
    var out = [];
    var S = rec.spells || {};
    var lists = S.lists || {};
    Object.keys(lists).forEach(function (lv) {
      (lists[lv] || []).forEach(function (name) {
        var spell = C.bookByName[name];
        if (!spell || !spell.summons) return;
        out.push({
          id: 'spell:' + name,
          kind: 'spell',
          name: spell.name,
          level: spell.level,
          concentration: !!spell.concentration,
          creatures: spell.creatures || []
        });
      });
    });
    var feats = (rec.char && rec.char.features) || [];
    feats.forEach(function (f) {
      var data = C.featureByKey[f.key];
      if (!data || !data.creatures || !data.creatures.length) return;
      out.push({
        id: 'feature:' + f.key,
        kind: 'feature',
        name: data.name,
        level: null,
        concentration: false,
        creatures: data.creatures
      });
    });
    return out;
  }

  function sourceById(id) {
    var found = null;
    sources().forEach(function (s) { if (s.id === id) found = s; });
    return found;
  }

  /* ---- the numbers of a summon ---- */

  /* What the block of a creature says, worked out with the level of the
     calling spell, the proficiency of the caster and the levels of the
     classes the block names. */
  function context(card) {
    var ch = (api.character().char) || {};
    return {
      level: card.slot >= 0 ? card.slot : null,
      prof: (C.SR && C.SR.profBonus && ch.level) ? C.SR.profBonus(ch.level) : null,
      classLevel: function (name) {
        var found = null;
        (ch.classes || []).forEach(function (k) {
          if (found === null && String(k.name || '').toLowerCase() === name) found = Number(k.level) || 0;
        });
        return found;
      },
      mod: function (ability) {
        var score = Number((ch.abilities || {})[ability]);
        if (!score) return null;
        return C.SR && C.SR.abilityMod ? C.SR.abilityMod(score) : 0;
      }
    };
  }

  /* The terms of a formula, added up. A number the book does not give is
     not a number the app can make up. */
  function evalTerms(terms, ctx) {
    if (!terms || !terms.length) return null;
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (t.const !== undefined) { total += t.const; continue; }
      if (t.level) { if (ctx.level === null) return null; total += ctx.level; continue; }
      if (t.perLevel) { if (ctx.level === null) return null; total += t.perLevel * ctx.level; continue; }
      if (t.perLevelAbove) {
        if (ctx.level === null) return null;
        total += t.perLevelAbove * Math.max(0, ctx.level - t.above);
        continue;
      }
      if (t.prof) { if (ctx.prof === null) return null; total += ctx.prof; continue; }
      if (t.ability) {
        var mod = ctx.mod(t.ability);
        if (mod === null) return null;
        total += mod;
        continue;
      }
      if (t.class) {
        var lv = ctx.classLevel(t.class);
        if (lv === null) return null;
        total += (t.per || 1) * lv;
        continue;
      }
      return null;
    }
    return total;
  }

  /* The branch of a formula that belongs to a form: the block of the battle
     familiar says "30 (Brute only) or 20 (Flyer or Stalker only)". */
  function branchFor(formula, formName) {
    if (!formula || !formula.branches || !formula.branches.length) return null;
    if (formula.branches.length === 1) return formula.branches[0];
    var needle = String(formName || '').toLowerCase();
    for (var i = 0; i < formula.branches.length; i++) {
      var words = String(formula.branches[i].qualifier || '').toLowerCase()
        .replace(/only/g, '').split(/[^a-z0-9]+/).filter(Boolean);
      for (var j = 0; j < words.length; j++) {
        if (words[j] === needle) return formula.branches[i];
      }
    }
    return formula.branches[0];
  }

  /* The damage of an attack, with the level of the slot in it. */
  function deriveDamage(parts, ctx) {
    if (!parts || !parts.dice) return null;
    var count = parts.dice.count;
    if (parts.dice.levelCount !== undefined) {
      if (ctx.level === null) return null;
      count = Math.max(1, ctx.level + parts.dice.levelCount);
    }
    if (count === undefined || count === null) return null;
    var flat = evalTerms(parts.flat || [], ctx);
    if (flat === null) return null;
    var text = count + 'd' + parts.dice.size;
    if (flat) text += ' + ' + flat;
    return text;
  }

  /* The attack of a spell, which carries the attack of the caster. */
  function deriveBonus(a, ctx) {
    if (a.bonus) return a.bonus;
    if (!/spell attack modifier/i.test(a.text || '')) return '';
    var ch = api.character().char || {};
    if (!ch.level || !C.SR || !C.SR.spellAttack) return '';
    var bonus = C.SR.spellAttack(ch, C.primaryAbility ? C.primaryAbility(ch) : 'cha');
    return (bonus >= 0 ? '+' : '') + bonus;
  }

  /* How many attacks a multiattack makes at this level. */
  function deriveCount(count, ctx) {
    if (!count) return null;
    if (count.half) {
      if (ctx.level === null) return null;
      return Math.floor(ctx.level / 2);
    }
    return null;
  }

  /* Everything the card of a summon shows, worked out of its block, the form
     it took and the slot that paid for it. */
  function derive(card) {
    var block = library()[card.key];
    if (!block) return null;
    var form = null;
    if (block.forms) {
      block.forms.forEach(function (f) { if (f.id === card.form) form = f; });
      if (!form) form = block.forms[0];
    }
    var ctx = context(card);
    var name = form ? form.name : '';
    var ac = evalTerms((branchFor(form ? form.acTerms : block.acTerms, name) || {}).terms, ctx);
    var hp = evalTerms((branchFor(form ? form.hpTerms : block.hpTerms, name) || {}).terms, ctx);
    var raw = form ? form.actions : block.actions;
    /* The multiattack says how many attacks the creature makes, so every
       attack of that creature is made that many times. */
    var multi = null;
    raw.forEach(function (a) { if (a.count) multi = deriveCount(a.count, ctx); });
    var actions = raw.map(function (a) {
      return {
        name: a.name,
        text: a.text,
        bonus: deriveBonus(a, ctx),
        damage: deriveDamage(a.damageParts, ctx) || a.damage || '',
        count: deriveCount(a.count, ctx),
        type: a.type || '',
        attack: /^(Melee|Ranged) (weapon |spell )?attack:/i.test(a.text || ''),
        multi: a.count ? null : multi
      };
    });
    return { ac: ac, hpMax: hp, actions: actions, form: form, block: block };
  }

  /* The form the card carries, and the one it would fall back to. */
  function formName(block, id) {
    if (!block || !block.forms || !block.forms.length) return '';
    var found = null;
    block.forms.forEach(function (f) { if (f.id === id) found = f; });
    if (!found) found = block.forms[0];
    return found ? found.name : '';
  }

  /* ---- the stat block of the creature ---- */

  /* A list the book writes, as a line of text. */
  function listText(list) {
    if (!list || !list.length) return '';
    return list.map(function (x) {
      return x.note ? x.text + ' (' + x.note + ')' : x.text;
    }).join(', ');
  }

  /* The proficiency of the caster, which the creatures of a summon are
     bound to. */
  function profOf() {
    var rec = api.character() || {};
    var ch = rec.char || {};
    return (C.SR && C.SR.profBonus && ch.level) ? C.SR.profBonus(ch.level) : 0;
  }

  /* A number with its sign, the way the app writes them. */
  function sign(n) {
    n = Number(n) || 0;
    return (n > 0 ? '+' : '') + n;
  }

  /* The key of an ability, from the name the book writes. */
  function shortKey(name) {
    var key = String(name || '').toLowerCase();
    var found = '';
    (C.ABILITIES || []).forEach(function (a) { if (a.long.toLowerCase() === key) found = a.key; });
    return found || key;
  }

  /* The saving throw the book writes, with the words of the caster put
     right: a bonus that rides on the proficiency of the caster. */
  function saveValue(text) {
    var raw = String(text || '').replace(/PB/i, String(profOf()));
    var bits = raw.match(/[+-]?\d+/g);
    if (!bits) return null;
    var total = 0;
    bits.forEach(function (x) { total += Number(x); });
    return total;
  }

  /* The saving throw of an ability: the modifier of the ability, and
     whether the creature is proficient in it. The book decides to begin
     with, and the player can say otherwise. */
  function saveState(card, block, key, mod) {
    var book = null;
    (block.saves || []).forEach(function (s) { if (s.key === key) book = s; });
    var on = card.saves && card.saves[key] !== undefined ? !!card.saves[key] : !!book;
    var value = mod;
    if (on) {
      value = book ? saveValue(book.value) : mod + profOf();
    }
    if (value === null || !isFinite(value)) value = mod;
    return { on: on, value: value };
  }

  /* The abilities, at the top of the block: the names above the scores and
     the saving throws under them, the way a stat block writes them. The
     dot is a proficiency, the way it is on the sheet of a character. */
  function abilityRow(card, block) {
    var scores = {};
    (block.ability || []).forEach(function (a) { scores[shortKey(a.name)] = a.score; });
    var names = '', values = '', saves = '';
    (C.ABILITIES || []).forEach(function (a) {
      var score = scores[a.key];
      if (score === undefined) return;
      var mod = C.SR && C.SR.abilityMod ? C.SR.abilityMod(score) : Math.floor((score - 10) / 2);
      var save = saveState(card, block, a.key, mod);
      names += '<span>' + C.esc(a.name) + '</span>';
      values += '<span>' + score + '<em>' + sign(mod) + '</em></span>';
      saves += '<span class="sabsave' + (save.on ? ' on' : '') + '"><button type="button" class="savetog' + (save.on ? ' on' : '') + '" ' +
        'data-save="' + a.key + '" aria-label="Proficient in the ' + a.long + ' saving throw"></button>' +
        sign(save.value) + '</span>';
    });
    if (!names) return '';
    return '<div class="sabil">' +
      '<div class="sabrow sab-h">' + names + '</div>' +
      '<div class="sabrow sab-v">' + values + '</div>' +
      '<div class="sabrow sab-s">' + saves + '</div></div>';
  }

  /* One named thing of the block: its name and what it says. */
  function statLine(name, text) {
    if (!text) return '';
    return '<p><b>' + C.esc(name) + '.</b> ' + C.markup(text) + '</p>';
  }

  /* The fields of the block: the numbers and the words around them. */
  function statFields(block, out, card) {
    var form = out ? out.form : null;
    /* The numbers of the card are the numbers of the block at the slot it
       was called with. */
    var ac = out && out.ac !== null && out.ac !== undefined ? out.ac : (form && form.ac ? form.ac : block.ac);
    var hp = out && out.hpMax !== null && out.hpMax !== undefined ? out.hpMax : (form && form.hp ? form.hp : block.hp);
    var acText = form && form.acText ? form.acText : block.acText;
    var hpText = form && form.hpText ? form.hpText : block.hpText;
    /* The initiative of a creature is its dexterity. */
    var dex = 0;
    (block.ability || []).forEach(function (a) {
      if (shortKey(a.name) === 'dex') dex = C.SR && C.SR.abilityMod ? C.SR.abilityMod(a.score) : Math.floor((a.score - 10) / 2);
    });
    var cr = block.cr ? block.cr + ' (' + (block.xp || 0) + ' XP)' : 'None (XP 0)';
    return abilityRow(card, block) +
      C.field('Speed', block.speed) +
      C.field('Resist', listText(block.resist)) +
      C.field('Immune', listText(block.immune)) +
      C.field('Senses', listText(block.senses)) +
      '<div class="sspace"></div>' +
      C.field('AC', acText ? ac + ' (' + acText + ')' : String(ac || '')) +
      C.field('HP', hpText ? hp + ' (' + hpText + ')' : String(hp || '')) +
      C.field('Initiative', sign(dex)) +
      '<div class="sspace"></div>' +
      C.field('Lang.', block.languages) +
      C.field('CR', cr) +
      C.field('Type', (block.size ? block.size + ' ' : '') + block.type) +
      C.field('Align', block.alignment) +
      C.field('Skills', listText(block.skills)) +
      C.field('Vuln.', listText(block.vulnerable)) +
      C.field('Cond.Imm', listText(block.conditionImmune));
  }

  /* The text of the block: the traits, the actions and the rest. */
  function statText(block, out, card) {
    var form = out ? out.form : null;
    var actions = form ? form.actions : block.actions;
    var traits = form ? form.traits : block.traits;
    var html = '';
    function section(title, list) {
      if (!list || !list.length) return;
      html += '<h3>' + C.esc(title) + '</h3>';
      list.forEach(function (x) { html += statLine(x.name, spoken(x.text, card)); });
    }
    section('Traits', traits);
    section('Actions', actions);
    section('Bonus Actions', block.bonusActions);
    section('Reactions', block.reactions);
    section('Legendary Actions', block.legendary);
    if (block.spellcasting && block.spellcasting.length) {
      html += '<h3>Spellcasting</h3>';
      block.spellcasting.forEach(function (x) {
        html += '<p><b>' + C.esc(x.name) + '.</b> ' + C.markup(spoken(x.header, card)) + '</p>';
        if (x.text) html += '<p>' + C.markup(spoken(x.text, card)) + '</p>';
      });
    }
    return html;
  }

  /* The words the book uses for the numbers of the caster are put right. */
  function spoken(text, card) {
    var out = String(text || '');
    if (card && card.slot >= 0) out = out.replace(/summonSpellLevel/gi, String(card.slot));
    var ch = (api.character() && api.character().char) || {};
    var pb = (C.SR && C.SR.profBonus && ch.level) ? C.SR.profBonus(ch.level) : null;
    if (pb !== null && pb !== undefined) out = out.replace(/\bPB\b/g, String(pb));
    return out;
  }

  /* The stat block of the creature, in the overlay of the app. */
  function openStat(card) {
    var block = library()[card.key];
    if (!block) { api.toast('the app does not carry its block'); return; }
    var out = derive(card);
    api.sheet.open({
      id: 'stat:' + card.key,
      title: block.name,
      meta: statFields(block, out, card),
      text: statText(block, out, card),
      onPaint: function (root) {
        /* The dot of a saving throw says the creature is proficient in it, and
           the book decides to begin with. */
        var dots = root.querySelectorAll('[data-save]');
        Array.prototype.forEach.call(dots, function (dot) {
          dot.addEventListener('click', function () {
            var key = dot.dataset.save;
            var on = saveState(card, block, key, 0).on;
            if (!card.saves) card.saves = {};
            card.saves[key] = !on;
            api.save();
            openStat(card);
          });
        });
      }
    });
  }
  /* ---- the cards ---- */

  /* The type of a damage, and the colour it wears. The book says it, and an
     action that gives hit points back is a healing whatever it does not say. */
  var TYPES = {
    radiant: [255, 217, 138],
    fire: [255, 132, 70],
    lightning: [255, 212, 71],
    cold: [127, 216, 255],
    acid: [185, 227, 74],
    necrotic: [95, 208, 160],
    poison: [154, 216, 79],
    psychic: [255, 122, 217],
    force: [110, 155, 255],
    thunder: [183, 155, 255],
    bludgeoning: [201, 195, 221],
    piercing: [201, 195, 221],
    slashing: [201, 195, 221],
    healing: [122, 216, 111]
  };

  function damageType(a) {
    if (a.type) return a.type;
    if (/regain|restore|heal/i.test(a.text || '')) return 'healing';
    return '';
  }

  function colourOf(type) {
    var c = TYPES[type];
    return c ? 'rgb(' + c.join(',') + ')' : '';
  }

  function trioOf(type) {
    var c = TYPES[type];
    return c ? c.join(',') : '';
  }

  /* The shape of a die, the way the app draws them. */
  function diePoints(sides) {
    var pts = C.SR && C.SR.DIE_SHAPES ? C.SR.DIE_SHAPES[sides] : '';
    if (pts) return pts;
    var built = [], i, a;
    for (i = 0; i < sides; i++) {
      a = -Math.PI / 2 + i * 2 * Math.PI / sides;
      built.push((12 + 9.2 * Math.cos(a)).toFixed(2) + ',' + (12 + 9.2 * Math.sin(a)).toFixed(2));
    }
    return built.join(' ');
  }

  /* The die, with nothing in it. */
  function dieIcon(sides) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<polygon points="' + diePoints(sides) + '" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  }

  /* The die, with a number in it. */
  function dieBig(sides, number) {
    var out = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<polygon points="' + diePoints(sides) + '" fill="none" stroke="currentColor" stroke-width="1.5"/>';
    if (number !== '' && number !== null && number !== undefined) {
      out += '<text x="12" y="15.4" text-anchor="middle" font-size="9" fill="currentColor" ' +
        'font-family="Cinzel, Georgia, serif">' + number + '</text>';
    }
    return out + '</svg>';
  }

  /* The rolls an attack holds: one per swing of the attack. */
  function rollsOf(card, name) {
    var v = card.rolls ? card.rolls[name] : null;
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }

  /* The number of the bonus, when the book writes one. */
  function bonusOf(text) {
    if (text === undefined || text === null || text === '') return null;
    var n = Number(String(text).replace(/[^0-9.+-]/g, ''));
    return isFinite(n) ? n : null;
  }

  /* The kind of an attack and how far it reaches. */
  function attackKind(a) {
    var m = String(a.text || '').match(/^((?:Melee|Ranged)\s+(?:weapon\s+|spell\s+)?attack)/i);
    return m ? m[1] : '';
  }

  function attackRange(a) {
    var t = String(a.text || '');
    var m = t.match(/\brange\s+([^.;,]+)/i);
    if (m) return m[1].trim();
    m = t.match(/\breach\s+([^.;,]+)/i);
    if (m) return 'reach ' + m[1].trim();
    return '';
  }

  /* A formula without the spaces around the plus. */
  function compact(text) {
    return String(text || '').replace(/\s*\+\s*/g, '+').trim();
  }

  /* The kind of die a group of dice is. */
  function sidesOf(label) {
    var m = String(label || '').match(/d(\d+)/i);
    return m ? Number(m[1]) : 6;
  }

  /* The dice of a damage: the shape of the die, then the results beside it. */
  function diceShapes(groups, res, col) {
    var out = '';
    groups.forEach(function (g) {
      out += '<span class="sgres"><span class="sdmini">' + dieIcon(sidesOf(g.label)) + '</span>' +
        '<span class="snum2"' + (col ? ' style="color:' + col + '"' : '') + '>' +
        (res ? g.rolls.join(',') : '--') + '</span></span>';
    });
    if (!groups.length) out += '<span class="snum2 sghost">--</span>';
    return out;
  }

  /* One swing of an attack: a block of its own, with a die of its own to tap.
     The big die holds the hit total, the small dice hold the arithmetic. */
  function swingBlock(a, edit, res, ix) {
    var bonus = edit && edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : a.bonus;
    var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
    var type = damageType(a);
    var col = colourOf(type);
    var num = bonusOf(bonus);
    var range = attackRange(a);
    var groups = res ? res.groups : (C.R && C.R.diceIn ? C.R.diceIn(damage || '') : []);
    var flat = res ? res.flat : (C.R && C.R.flatIn ? C.R.flatIn(damage || '') : 0);
    var trio = trioOf(type);
    var out = '<div class="sblock' + (res && res.crit ? ' crit' : '') + '" data-name="' + C.esc(a.name) + '"' +
      (trio ? ' style="--beam:' + trio + '"' : '') + '>';
    out += '<div class="satkgrid">';
    out += '<div class="scell-atk"><span class="sk">Attack</span>' +
      '<span class="snum2">' + C.esc(bonus) + '</span>' +
      (range ? '<span class="ssep">-</span><span class="srng">' + C.esc(range) + '</span>' : '') + '</div>';
    out += '<div class="scell-dmg"><span class="sk">Damage</span>' +
      '<span class="sformula"' + (col ? ' style="color:' + col + '"' : '') + '>' + C.esc(compact(damage)) + '</span></div>';
    out += '<div class="scell-die"><button type="button" class="sdie" data-role="roll" data-ix="' + ix + '" ' +
      'aria-label="Roll the ' + C.esc(a.name) + '">' + dieBig(20, res ? res.total : '') + '</button></div>';
    out += '<div class="scell-hit"><span class="sdmini">' + dieIcon(20) + '</span>' +
      '<span class="snum2">' + (res ? res.roll : '--') + '</span>' +
      (otherRolls(res) ? '<span class="sother">' + otherRolls(res) + '</span>' : '') +
      (num !== null ? '<span class="smod">' + (num > 0 ? '+' + num : String(num)) + '</span>' : '') + '</div>';
    out += '<div class="scell-dmgres">' + diceShapes(groups, res, col) +
      (flat ? '<span class="smod">' + (flat > 0 ? '+' + flat : String(flat)) + '</span>' : '') + '</div>';
    out += '<div class="scell-dmgtot"><span class="snum2"' + (col ? ' style="color:' + col + '"' : '') + '>' +
      (res ? res.damage : '--') + '</span>' +
      (type ? '<em class="stype" style="color:' + col + '">' + C.esc(type) + '</em>' : '') + '</div>';
    out += '</div></div>';
    return out;
  }

  /* The same block with the wrench on: the numbers are fields. */
  function editBlock(a, edit) {
    var bonus = edit && edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : a.bonus;
    var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
    var type = damageType(a);
    var col = colourOf(type);
    var range = attackRange(a);
    var out = '<div class="sblock" data-name="' + C.esc(a.name) + '">';
    out += '<div class="satkgrid">';
    out += '<div class="scell-atk"><span class="sk">Attack</span>' +
      '<input class="scin satkbonus" data-role="atkbonus" type="text" value="' + C.esc(bonus) + '" aria-label="Attack bonus">' +
      (range ? '<span class="ssep">-</span><span class="srng">' + C.esc(range) + '</span>' : '') + '</div>';
    out += '<div class="scell-dmg"><span class="sk">Damage</span>' +
      '<input class="scin satkdamage" data-role="atkdamage" type="text" value="' + C.esc(damage) + '" aria-label="Damage of the attack">' +
      (type ? '<em class="stype" style="color:' + col + '">' + C.esc(type) + '</em>' : '') + '</div>';
    out += '</div></div>';
    return out;
  }

  /* All the swings of an attack, under the one name of the attack. */
  function attackGroup(a, edit, rolls) {
    var out = '<div class="sgroup">';
    out += '<div class="satkhead"><span class="satkname">' + C.esc(a.name) + '</span>' +
      '<span class="skind">' + C.esc(attackKind(a)) + '</span></div>';
    if (editing) {
      out += editBlock(a, edit);
    } else {
      var swings = a.multi && a.multi > 0 ? a.multi : 1;
      for (var i = 0; i < swings; i++) out += swingBlock(a, edit, rolls[i] || null, i);
    }
    out += '</div>';
    return out;
  }
  /* An action that can be used a number of times a day, like the healing
     touch of a spirit. The book says so in the name of the action. */
  function limitedOf(a) {
    var m = String(a.name || '').match(/\((\d+)\s*\/\s*Day\)/i);
    if (!m) return null;
    return { max: Number(m[1]) || 1, name: String(a.name || '').replace(/\s*\([^)]*\)\s*$/, '') };
  }
  /* The die that was thrown away, when the roll had the advantage. */
  function otherRolls(res) {
    if (!res || !res.rolls || res.rolls.length < 2) return '';
    var kept = res.rolls.indexOf(res.roll);
    var out = [], i;
    for (i = 0; i < res.rolls.length; i++) if (i !== kept) out.push(res.rolls[i]);
    return out.join(' ');
  }


  /* An action that is not an attack: a healing, a touch. It shows its dice
     and it does not roll. */
  function noteRow(a, edit, uses) {
    var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
    var type = damageType(a);
    var limit = limitedOf(a);
    var label = limit ? limit.name : a.name;
    var out = '<div class="snoteblock" data-name="' + C.esc(a.name) + '">' +
      '<span class="satkname">' + C.esc(label) + '</span>';
    if (limit) {
      var u = uses ? uses[a.name] : null;
      var left = u ? Number(u.left) || 0 : limit.max;
      out += '<button type="button" class="suses' + (left ? '' : ' out') + '" data-role="use" ' +
        'aria-label="Use the ' + C.esc(label) + '">' + left + '/' + limit.max + '</button>';
    }
    if (editing) {
      out += '<input class="scin satkdamage" data-role="atkdamage" type="text" value="' + C.esc(damage) + '" aria-label="Damage of the action">';
    } else if (damage) {
      out += '<span class="sformula">' + C.esc(compact(damage)) + '</span>';
    }
    if (type) out += '<em class="stype" style="color:' + colourOf(type) + '">' + C.esc(type) + '</em>';
    out += '</div>';
    return out;
  }

  function cardHtml(s) {
    var block = library()[s.key];
    var out = derive(s);
    var forms = block && block.forms && block.forms.length ? block.forms : null;
    var actions = out ? out.actions : [];
    var edit = (s.edit && s.edit.attacks) || {};
    var ac = s.edit && s.edit.ac !== undefined && s.edit.ac !== ''
      ? s.edit.ac
      : (out && out.ac !== null && out.ac !== undefined ? String(out.ac) : '');
    var max = s.edit && s.edit.hpMax !== undefined && s.edit.hpMax !== ''
      ? s.edit.hpMax
      : (out && out.hpMax !== null && out.hpMax !== undefined ? String(out.hpMax) : '');
    var html = '<div class="scard" data-id="' + C.esc(s.id) + '">' +
      '<div class="sstop">' +
        (editing
          ? '<input class="sname" data-role="name" value="' + C.esc(s.name) + '" aria-label="Name of the summon">'
          : '<button type="button" class="sname snamebtn" data-role="stat" aria-label="The stat block of the summon">' + C.esc(s.name) + '</button>') +
        '<button type="button" class="ssrc" data-role="source" title="' + C.esc(block ? block.name : (s.spell || '')) + '" aria-label="Open what called it">' + C.esc(s.spell || '') + '</button>' +
        '<button type="button" class="sdel" data-role="dismiss" aria-label="Dismiss the summon">&times;</button>' +
      '</div>';

    html += '<div class="sline">' +
      '<span class="sk">AC</span>';
    if (editing) {
      html += '<input class="scin snum" data-role="ac" type="number" inputmode="numeric" value="' + C.esc(ac) + '" aria-label="Armour class of the summon">';
    } else {
      html += '<span class="sval">' + C.esc(ac) + '</span>';
    }
    html += '<span class="sk">HP</span>' +
      '<button type="button" class="sstep" data-role="hpdown" aria-label="One hit point less">&minus;</button>' +
      '<input class="scin snum" data-role="hp" type="number" inputmode="numeric" value="' + (s.hp || 0) + '" aria-label="Hit points of the summon">' +
      '<button type="button" class="sstep" data-role="hpup" aria-label="One hit point more">+</button>' +
      '<span class="sof">of ';
    if (editing) {
      html += '<input class="scin snum" data-role="hpmax" type="number" inputmode="numeric" value="' + C.esc(max) + '" aria-label="Maximum hit points of the summon">';
    } else {
      html += '<span class="sval">' + C.esc(max) + '</span>';
    }
    html += '</span>' +
      '<button type="button" class="schip' + (s.adv ? ' on' : '') + '" data-role="adv" aria-pressed="' +
      (s.adv ? 'true' : 'false') + '" aria-label="Roll with advantage">Adv</button>' +
      '</div>';
    if (editing) {
      /* The slot comes first, then the form, then the concentration. */
      html += '<div class="sline"><span class="sk">Slot</span>' +
        '<button type="button" class="sfpick on" data-role="slot" aria-label="The slot that paid for it">' +
        (s.slot < 0 ? 'none' : String(s.slot)) + '</button>' +
        (forms ? '<span class="sk">Form</span>' +
          '<button type="button" class="sfpick on" data-role="form" aria-label="The form of the summon">' +
          C.esc(formName(block, s.form)) + '</button>' : '') +
        (s.concentration ? '<span class="sconc">Concentration</span>' : '') +
        '</div>';
    }
    if (actions.length) {
      /* The multiattack rides the label of the attacks: how many of them
         the creature makes. */
      var multi = null;
      actions.forEach(function (a) { if (a.count) multi = a; });
      html += '<div class="sline"><span class="sk">Attacks</span>' +
        (multi ? '<span class="ssep">-</span><span class="sk">' + C.esc(multi.name) + '</span>' +
          '<span class="smultin">&times;' + multi.count + '</span>' : '') + '</div>';
      html += '<div class="satk">' + actions.map(function (a) {
        if (a.count) return '';
        if (!a.attack) return noteRow(a, edit[a.name], s.uses);
        return attackGroup(a, edit[a.name], rollsOf(s, a.name));
      }).join('') + '</div>';
    }
    return html + '</div>';
  }

  function buildCards() {
    E.list.innerHTML = summons().map(cardHtml).join('');
    E.empty.hidden = summons().length > 0;
  }

  /* The spell or the feature the creature came from, opened in the
     overlay of the app. */
  function openSource(card) {
    if (!card.source) return;
    if (card.source.indexOf('spell:') === 0) {
      var name = card.source.slice(6);
      var spell = C.bookByName[name];
      if (!spell) { api.toast('the book does not have it'); return; }
      api.sheet.open({
        id: 'summonspell:' + name,
        title: spell.name,
        meta: C.field('Level', spell.level) + C.field('Range', spell.range) +
          C.field('Duration', spell.duration) +
          C.field('Conc', spell.concentration ? 'Yes' : 'No', spell.concentration ? 'yes' : ''),
        text: C.renderBlocks(spell.blocks)
      });
      return;
    }
    if (card.source.indexOf('feature:') === 0) {
      var key = card.source.slice(8);
      var f = C.featureByKey[key];
      if (!f) { api.toast('the library does not have it'); return; }
      api.sheet.open({
        id: 'summonfeature:' + key,
        title: f.name,
        meta: C.field('Action', f.action) + C.field('Duration', f.duration),
        text: C.renderBlocks(f.blocks)
      });
    }
  }
  /* ---- the creature that comes to the table ---- */

  function addSummon(source, block, key) {
    var s = {
      id: 's' + Date.now() + Math.floor(Math.random() * 1000),
      name: block ? block.name : source.name,
      key: key || '',
      form: '',
      slot: source.level === null || source.level === undefined ? -1 : source.level,
      hp: 0,
      spell: source.name,
      source: source.id,
      concentration: !!source.concentration,
      adv: false,
      edit: { ac: '', hpMax: '', attacks: {} },
      uses: {},
      rolls: {}
    };
    summons().push(s);
    /* The creature comes to the table with its hit points full. */
    var full = derive(s);
    if (full && full.hpMax !== null && full.hpMax !== undefined) s.hp = full.hpMax;
    /* The actions that can be used a number of times a day come with their
       uses, and they are spent one by one. */
    (full ? full.actions : []).forEach(function (a) {
      var limit = limitedOf(a);
      if (!limit) return;
      s.uses[a.name] = { left: limit.max, max: limit.max };
    });
    commit();
    api.toast(s.name + ' comes to the table');
  }

  /* ---- the form and the slot, picked the way the app picks a class ---- */

  function openFormPicker(card) {
    var block = library()[card.key];
    if (!block || !block.forms || !block.forms.length) return;
    var list = block.forms.map(function (f) {
      return '<div class="crow" data-form="' + C.esc(f.id) + '"><span class="cn">' + C.esc(f.name) + '</span>' +
        '<span class="cl">' + C.esc(f.acText || '') + '</span></div>';
    }).join('');
    api.sheet.open({
      id: 'pickform',
      title: 'The form',
      metaClass: 'sheet-meta one',
      meta: '<span>Tap a form. It decides the armour class and the attacks.</span>',
      list: list,
      onList: function (ev) {
        var row = ev.target.closest('[data-form]');
        if (!row) return;
        var before = derive(card);
        card.form = row.dataset.form;
        /* The hit points follow the new maximum when the creature is not
           hurt yet. */
        var after = derive(card);
        if (after && after.hpMax !== null && after.hpMax !== undefined) {
          if (!before || card.hp === before.hpMax) card.hp = after.hpMax;
        }
        api.sheet.close();
        buildCards();
        commit();
      }
    });
  }

  function openSlotPicker(card) {
    var list = '';
    for (var i = 0; i <= 9; i++) {
      list += '<div class="crow" data-slot="' + i + '"><span class="cn">Slot ' + i + '</span></div>';
    }
    list += '<div class="crow" data-slot="-1"><span class="cn">No slot</span></div>';
    api.sheet.open({
      id: 'pickslot',
      title: 'The slot',
      metaClass: 'sheet-meta one',
      meta: '<span>The slot that paid for it. The numbers of the creature follow it.</span>',
      list: list,
      onList: function (ev) {
        var row = ev.target.closest('[data-slot]');
        if (!row) return;
        card.slot = Number(row.dataset.slot);
        if (!card.edit) card.edit = { ac: '', hpMax: '', attacks: {} };
        card.edit.ac = '';
        card.edit.hpMax = '';
        api.sheet.close();
        buildCards();
        commit();
      }
    });
  }

  /* ---- the overlay: what the character can call ---- */

  function sourceRows() {
    var rows = sources();
    if (!rows.length) {
      return '<div class="empty">Nothing of this character calls a creature yet. A spell that summons, or a feature that brings one, would sit here.</div>';
    }
    return rows.map(function (s) {
      var what = s.creatures.length
        ? s.creatures.join(', ')
        : 'the creature is yours to choose';
      return '<div class="row">' +
        '<div class="g1">' +
          '<span class="gn tappable" data-src="' + C.esc(s.id) + '" aria-label="Call with ' + C.esc(s.name) + '">' + C.esc(s.name) + '</span>' +
        '</div>' +
        '<div class="g2"><span class="gs">' + C.esc(s.level === null ? 'feature' : 'level ' + s.level) + ' \u00b7 ' + C.esc(what) + '</span></div>' +
        '</div>';
    }).join('');
  }

  function openSources() {
    api.sheet.open({
      id: 'summonsource',
      title: 'Call a creature',
      metaClass: 'sheet-meta one',
      meta: '<span>What brings it</span>',
      list: sourceRows(),
      onList: function (ev) {
        var row = ev.target.closest('[data-src]');
        if (!row) return;
        openCreatures(row.dataset.src);
      }
    });
  }

  /* ---- the overlay: the creature itself ---- */

  function creatureRows(source, q) {
    var needle = String(q || '').toLowerCase();
    var html = '';

    /* What the source names comes first: the Battle Familiar, the Dancing
       Item, the animals of the Find Familiar. */
    var rows = (source.creatures || []).map(function (name) {
      var block = creatureByName(name);
      return { key: keyOf(block), name: block ? block.name : name, cr: block ? block.cr : '' };
    });
    if (!rows.length) {
      /* A source that names nothing leaves the choice to the player, so the
         whole library is offered. */
      rows = Object.keys(library()).map(function (key) {
        var block = library()[key];
        return { key: key, name: block.name, cr: block.cr };
      });
    }
    rows = rows.filter(function (r) {
      if (!needle) return true;
      return String(r.name).toLowerCase().indexOf(needle) >= 0;
    });
    rows.slice(0, 60).forEach(function (r) {
      html += '<div class="row">' +
        '<div class="g1"><span class="gn tappable" data-key="' + C.esc(r.key) + '" aria-label="Call a ' + C.esc(r.name) + '">' + C.esc(r.name) + '</span></div>' +
        '<div class="g2"><span class="gs">' + C.esc(r.cr ? 'CR ' + r.cr : '') + '</span></div>' +
        '</div>';
    });
    if (rows.length > 60) {
      html += '<div class="empty">And ' + (rows.length - 60) + ' more. Type to narrow the list.</div>';
    }

    /* The machine keeps the creatures the app does not carry. */
    if (machine) {
      machine.filter(function (m) {
        if (!needle) return false;
        return String(m.name).toLowerCase().indexOf(needle) >= 0;
      }).slice(0, 40).forEach(function (m) {
        html += '<div class="row">' +
          '<div class="g1"><span class="gn tappable" data-far="' + C.esc(m.key) + '" aria-label="Call a ' + C.esc(m.name) + '">' + C.esc(m.name) + '</span></div>' +
          '<div class="g2"><span class="gs">' + C.esc(m.cr ? 'CR ' + m.cr : '') + '</span></div>' +
          '</div>';
      });
    }
    html += '<div class="row"><div class="g1">' +
      '<span class="gn tappable" data-machine="1" aria-label="Look for another creature on the machine">Look on the machine</span>' +
      '</div><div class="g2"><span class="gs">every creature it holds</span></div></div>';
    if (!html) html = '<div class="empty">Nothing matches.</div>';
    return html;
  }

  function openCreatures(src) {
    var source = sourceById(src);
    if (!source) return;
    var q = api.sheet.search() || '';
    api.sheet.open({
      id: 'summoncreature',
      title: source.name,
      metaClass: 'sheet-meta one',
      meta: '<span>' + C.esc(source.level === null ? 'a feature of the character' : 'level ' + source.level + ' spell') + '</span>',
      list: creatureRows(source, q),
      search: true,
      onSearch: function () { openCreatures(src); },
      onList: function (ev) {
        var far = ev.target.closest('[data-far]');
        if (far) { fetchCreature(far.dataset.far, source); return; }
        var machineRow = ev.target.closest('[data-machine]');
        if (machineRow) { fetchIndex(source); return; }
        var row = ev.target.closest('[data-key]');
        if (!row) return;
        var block = library()[row.dataset.key];
        if (!block) return;
        addSummon(source, block, row.dataset.key);
        api.sheet.closeAll();
      }
    });
  }

  /* The machine that serves the app holds the creatures the app does not
     carry. It answers with the list of them, then with one at a time. */
  function address() {
    var a = C.server ? C.server() : '';
    return String(a || '').replace(/\/$/, '');
  }

  function fetchIndex(source) {
    var where = address();
    if (!where) { api.toast('The machine that serves the app has no address.'); return; }
    api.toast('asking the machine');
    C.readUrl(where + '/bestiary/index.json')
      .then(function (text) {
        var answer = JSON.parse(text);
        machine = answer.creatures || [];
        openCreatures(source.id);
      })
      .catch(function () { api.toast('the machine did not answer'); });
  }

  function fetchCreature(key, source) {
    var where = address();
    if (!where) { api.toast('The machine that serves the app has no address.'); return; }
    C.readUrl(where + '/bestiary/' + encodeURIComponent(key) + '.json')
      .then(function (text) {
        var block = JSON.parse(text);
        addSummon(source, block, key);
        api.sheet.closeAll();
      })
      .catch(function () { api.toast('the machine did not answer'); });
  }

  /* ---- the roll of an attack ---- */

  function roll(card, name, ix) {
    var out = derive(card);
    if (!out) return;
    var action = null;
    out.actions.forEach(function (a) { if (a.name === name) action = a; });
    if (!action || !action.attack) return;
    var edit = (card.edit && card.edit.attacks && card.edit.attacks[name]) || {};
    var bonus = edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : action.bonus;
    var damage = edit.damage !== undefined && edit.damage !== '' ? edit.damage : action.damage;
    var result = C.R.rollAttack(bonus, damage, !!card.adv);
    if (!card.rolls) card.rolls = {};
    var list = rollsOf(card, name);
    while (list.length <= ix) list.push(null);
    list[ix] = result;
    card.rolls[name] = list;
    buildCards();
    commit();
    if (navigator.vibrate) navigator.vibrate(result.crit ? [14, 45, 14] : 16);
  }

  /* ---- the page ---- */

  Sheet.page({
    id: 'summons',
    title: 'Summons',
    tab: 'Summons',
    order: 4,
    blurb: 'The creatures at the table.',
    slice: 'summons',
    seed: function (saved) {
      if (saved && saved.list) return saved;
      return { list: [] };
    },
    html: [
      '<div class="charbody" id="summonBody">',
      '  <div class="cshead"><span>At the table</span><span class="rule"></span><button class="mini" id="callSummon" type="button" aria-label="Call a creature">+</button></div>',
      '  <div class="fcards" id="summonList"></div>',
      '  <div class="empty" id="summonEmpty" hidden>No creature at the table. The plus calls one.</div>',
      '</div>'
    ].join('\n'),

    css: [
      '.scard{border:1px solid var(--edge);border-radius:5px;background:rgba(255,255,255,.03);padding:7px 8px;display:flex;flex-direction:column;gap:6px}',
      '.sstop{display:flex;align-items:center;gap:6px}',
      '.sname{flex:1 1 auto;min-width:0;font:inherit;font-size:15px;color:var(--ink);background:none;border:none;border-bottom:1px solid var(--edge);padding:2px 0}',
      '.snamebtn{text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ssrc{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%;background:none;border:none;padding:0;font:inherit;font-size:10px;cursor:pointer;text-align:right}',
      '.ssrc:active{color:var(--arcane)}',
      '.sdel{background:none;border:none;color:var(--muted);font:inherit;font-size:18px;line-height:1;padding:0 3px;cursor:pointer;flex:0 0 auto}',
      '.sdel:active{color:var(--gold)}',
      '.sline{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:12px;color:var(--muted)}',
      '.sk{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#6f6a8d;display:inline-flex;align-items:center;gap:3px}',
      '.sval{font-size:12.5px;color:var(--ink);min-width:20px}',
      '.sof{display:inline-flex;align-items:center;gap:3px}',
      '.sstep{width:22px;height:22px;border-radius:5px;border:1px solid var(--edge);background:none;color:var(--ink);font:inherit;font-size:14px;line-height:1;cursor:pointer;flex:0 0 auto;padding:0}',
      '.sstep:active{border-color:var(--arcane);color:var(--arcane)}',
      '.sconc{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)}',
      '.satk{display:flex;flex-direction:column;gap:6px}',
      '.sgroup{display:flex;flex-direction:column;gap:4px}',
      '.sblock{border:1px solid var(--edge);border-radius:5px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.012));padding:6px 8px 7px;display:flex;flex-direction:column;gap:3px}',
      '.sblock.crit{border-color:rgba(var(--gold-rgb),.6);box-shadow:0 0 0 1px rgba(var(--gold-rgb),.16),0 8px 18px rgba(var(--gold-rgb),.12)}',
      '.satkhead{display:flex;align-items:baseline;gap:8px}',
      '.sfpick{font:inherit;font-size:10px;line-height:1;padding:4px 7px;border-radius:4px;border:1px solid var(--edge);background:none;color:var(--muted);cursor:pointer}',
      '.sfpick.on{border-color:rgba(var(--arcane-rgb),.55);color:var(--arcane);background:rgba(var(--arcane-rgb),.12)}',
      '.satkname{flex:1 1 auto;min-width:0;font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.skind{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#6f6a8d;flex:0 0 auto;white-space:nowrap}',
      '.satkgrid{display:grid;grid-template-columns:auto 40px auto minmax(0,1fr);column-gap:8px;row-gap:2px;align-items:center}',
      '.scell-atk{grid-column:1;grid-row:1;display:flex;align-items:baseline;gap:5px;white-space:nowrap}',
      '.scell-dmg{grid-column:1;grid-row:2;display:flex;align-items:baseline;gap:5px;white-space:nowrap}',
      '.scell-die{grid-column:2;grid-row:1/3;display:flex;align-items:center;justify-content:center}',

      '.scell-hit{grid-column:3;grid-row:1/3;display:flex;align-items:center;gap:3px;justify-content:flex-start}',
      '.scell-dmgres{grid-column:4;grid-row:1;display:flex;align-items:center;gap:4px;justify-content:flex-end}',
      '.scell-dmgtot{grid-column:4;grid-row:2;display:flex;align-items:baseline;gap:5px;justify-content:flex-end;white-space:nowrap}',
      '.sdie{width:38px;height:38px;background:none;border:none;padding:0;cursor:pointer;color:var(--arcane);display:flex;align-items:center;justify-content:center}',
      '.sdie svg{width:100%;height:100%;display:block}',
      '.sdie:active{color:var(--gold)}',
      '.sdmini{width:14px;height:14px;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;color:var(--muted)}',
      '.sdmini svg{width:13px;height:13px;display:block}',
      '.snum2{font-family:var(--display);font-size:13.5px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}',
      ".sgres{display:inline-flex;align-items:center;gap:3px;min-width:38px}",
      '.sformula{font-family:var(--sans);font-size:12.5px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.srng{font-size:10.5px;color:var(--muted);white-space:nowrap}',
      '.ssep{font-size:10.5px;color:#6f6a8d;white-space:nowrap}',
      '.smod{font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.sghost{color:#6f6a8d}',
      '.sabil{grid-column:1 / -1;display:flex;flex-direction:column;gap:2px;margin:0 0 3px}',
      '.sabrow{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}',
      '.sab-h span{font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#635e7e;text-align:center}',
      '.sab-v span{font-family:var(--display);font-size:15px;line-height:1.1;color:var(--ink);text-align:center;font-variant-numeric:tabular-nums}',
      '.sab-v em{font-style:normal;font-family:var(--sans);font-size:9px;color:var(--muted);margin-left:2px}',
      '.sab-s span{display:flex;align-items:center;justify-content:center;gap:4px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}',
      '.sabsave.on{color:var(--gold)}',
      '.savetog{width:7px;height:7px;flex:0 0 auto;border-radius:50%;border:1px solid #453f63;background:none;padding:0;cursor:pointer}',
      '.savetog.on{background:var(--gold);border-color:var(--gold);box-shadow:0 0 6px rgba(var(--gold-rgb),.45)}',
      '.sspace{grid-column:1 / -1;height:3px}',
      '.sother{font-size:10.5px;color:#6f6a8d;font-variant-numeric:tabular-nums}',
      '.suses{border:1px solid var(--edge);border-radius:999px;background:none;color:var(--ink);font:inherit;font-size:10.5px;line-height:1.4;padding:1px 9px;cursor:pointer;font-variant-numeric:tabular-nums}',
      '.suses.out{color:#6f6a8d}',
      '.schip{border:1px solid var(--edge);border-radius:999px;background:none;color:var(--muted);font:inherit;font-size:10px;letter-spacing:.08em;line-height:1.4;padding:2px 9px;margin-left:auto;cursor:pointer;white-space:nowrap}',
      '.schip.on{border-color:rgba(var(--arcane-rgb),.55);color:var(--arcane);background:rgba(var(--arcane-rgb),.12)}',
      '.snoteblock{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;font-size:12px}',
      '.smulti{display:flex;align-items:center;gap:6px;padding:1px 0}',
      '.smultin{font-size:11px;color:var(--gold);font-variant-numeric:tabular-nums}',
      '.stype{font-style:normal;font-size:9.5px;letter-spacing:.04em}',
      '.scard .satkbonus{width:58px;text-align:right}',
      '.scard .satkdamage{flex:1 1 auto;min-width:0}',
      '.scin{font-family:var(--sans);font-size:12.5px;color:var(--ink);background:rgba(255,255,255,.04);border:1px solid var(--edge);border-radius:4px;padding:2px 4px;min-width:0}',
      '.snum{width:44px;text-align:center}',

    ].join('\n'),

    mount: function (root, a) {
      /* The book and the library of features are what tell the page what the
         character can call, so both are asked for. */
      C.data('bestiary');
      C.data('spellbook');
      C.data('features');
      api = a;
      E = {
        body: root.querySelector('#summonBody'),
        list: root.querySelector('#summonList'),
        empty: root.querySelector('#summonEmpty'),
        call: root.querySelector('#callSummon')
      };

      buildCards();
      built = signature();

      E.call.addEventListener('click', function () { openSources(); });

      /* Every field of a card is the character's own, and it is written
         down as it is typed. */
      E.body.addEventListener('input', function (ev) {
        var roleEl = ev.target.closest ? ev.target.closest('[data-role]') : null;
        if (!roleEl) return;
        var card = roleEl.closest('.scard');
        if (!card) return;
        var s = byId(card.dataset.id);
        if (!s) return;
        var role = roleEl.dataset.role;
        if (role === 'name') s.name = roleEl.value;
        else if (role === 'hp') s.hp = Math.max(0, Math.min(999, Number(roleEl.value) || 0));
        else if (role === 'ac' || role === 'hpmax') {
          if (!s.edit) s.edit = { ac: '', hpMax: '', attacks: {} };
          s.edit[role] = roleEl.value;
        } else if (role === 'atkbonus' || role === 'atkdamage') {
          var row = roleEl.closest('[data-name]');
          if (!row) return;
          if (!s.edit) s.edit = { ac: '', hpMax: '', attacks: {} };
          if (!s.edit.attacks) s.edit.attacks = {};
          var name = row.dataset.name;
          if (!s.edit.attacks[name]) s.edit.attacks[name] = { bonus: '', damage: '' };
          s.edit.attacks[name][role === 'atkbonus' ? 'bonus' : 'damage'] = roleEl.value;
        } else return;
        api.save();
      });

      E.body.addEventListener('click', function (ev) {
        var roleEl = ev.target.closest ? ev.target.closest('[data-role]') : null;
        var card = ev.target.closest ? ev.target.closest('.scard') : null;
        if (!card) return;
        var s = byId(card.dataset.id);
        if (!s) return;
        if (roleEl) {
          var role = roleEl.dataset.role;
          if (role === 'form') { openFormPicker(s); return; }
          if (role === 'slot') { openSlotPicker(s); return; }
          if (role === 'dismiss') {
            slice().list = summons().filter(function (x) { return x.id !== s.id; });
            buildCards();
            commit();
            api.toast(s.name + ' is dismissed');
            return;
          }
          if (role === 'hpup' || role === 'hpdown') {
            var step = role === 'hpup' ? 1 : -1;
            s.hp = Math.max(0, Math.min(999, (Number(s.hp) || 0) + step));
            buildCards();
            commit();
            return;
          }
          /* The die of a swing is the tap that rolls it. */
          if (role === 'roll') {
            var block = roleEl.closest('[data-name]');
            if (block) roll(s, block.dataset.name, Number(roleEl.dataset.ix) || 0);
            return;
          }
          /* The advantage of the card: the die is rolled twice. */
          if (role === 'adv') {
            s.adv = !s.adv;
            buildCards();
            commit();
            return;
          }
          /* A use of a limited action is spent. */
          if (role === 'use') {
            var useBlock = roleEl.closest('[data-name]');
            var u = useBlock && s.uses ? s.uses[useBlock.dataset.name] : null;
            if (!u) return;
            u.left = Math.max(0, (Number(u.left) || 0) - 1);
            buildCards();
            commit();
            return;
          }
          /* The spell or the feature the creature came from. */
          if (role === 'source') { openSource(s); return; }
          /* The stat block of the creature. */
          if (role === 'stat') { openStat(s); return; }
        }
        /* An attack is rolled when its die is tapped, the way the volley
           rolls a beam. */
        if (editing) return;
      });
    },

    /* The wrench edits the stats, the way it edits a character. */
    head: function (root, a) {
      api = a;
      var b = C.wrenchButton('Edit the summons', function () {
        editing = !editing;
        buildCards();
        api.save();
        api.refresh();
      });
      root.appendChild(b);
      E.wrench = b;
    },

    render: function (a) {
      api = a;
      /* The cards belong to one character, so playing another one builds
         its own list. */
      var sig = signature();
      if (built !== sig) {
        built = sig;
        buildCards();
      }
      if (E.wrench) E.wrench.setAttribute('aria-pressed', editing ? 'true' : 'false');
    }
  });

  /* What the cards were built for: the character and the creatures it has. */
  function signature() {
    return api.state.current + '|' + summons().map(function (s) { return s.id; }).join(',') +
      '|' + Object.keys(library()).length + '|' + (editing ? 'edit' : 'read');
  }
})();
