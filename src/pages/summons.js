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

  /* The die the hit roll sits in. */
  var D20 = '<svg class="sd20g" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
    '<path class="sd20hex" d="M24 3.4 41.8 13.7 41.8 34.3 24 44.6 6.2 34.3 6.2 13.7Z"/>' +
    '<path class="sd20tri" d="M24 3.4 41.8 34.3 6.2 34.3Z"/>' +
    '</svg>';

  /* The rolls an attack holds: one for an attack, as many as the
     multiattack says for a creature that makes several. */
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

  /* The damage: the total, the type it wears, and the dice that made it. */
  function damageBlock(res, type, damage) {
    var col = colourOf(type);
    var groups, flat, total;
    if (res) {
      groups = res.groups;
      flat = res.flat;
      total = res.damage;
    } else {
      groups = (C.R && C.R.diceIn ? C.R.diceIn(damage || '') : []).map(function (g) {
        return { label: g.label, rolls: [] };
      });
      flat = C.R && C.R.flatIn ? C.R.flatIn(damage || '') : 0;
      total = null;
    }
    var out = '<div class="sdmg">';
    out += '<div class="sdtop"><span class="sdt' + (total === null ? ' sghost' : '') + '"' +
      (col && total !== null ? ' style="color:' + col + '"' : '') + '>' + (total === null ? '--' : total) + '</span>';
    if (type) out += '<em class="stype" style="color:' + col + '">' + C.esc(type) + '</em>';
    out += '</div>';
    if (groups.length || flat) {
      out += '<div class="sdice">';
      groups.forEach(function (g) {
        out += '<span class="sg"><span class="slbl"' + (col ? ' style="color:' + col + '"' : '') + '>' + C.esc(g.label) + '</span>' +
          '<span class="sgroll' + (res ? '' : ' sghost') + '">' + (res ? g.rolls.join(', ') : '--') + '</span></span>';
      });
      if (flat) {
        out += '<span class="sg flat"><span class="slbl"' + (col ? ' style="color:' + col + '"' : '') + '>' +
          (flat > 0 ? '+' + flat : String(flat)) + '</span></span>';
      }
      out += '</div>';
    } else if (!res && damage) {
      out += '<div class="sdice"><span class="sg"><span class="slbl sghost">' + C.esc(damage) + '</span></span></div>';
    }
    out += '</div>';
    return out;
  }

  /* One roll of one attack: the hit roll in its die, then the damage. */
  function rollBlock(res, type, damage, bonus) {
    var out = '<div class="srblock">';
    out += '<div class="srb">';
    out += '<div class="sd20' + (res && res.crit ? ' crit' : '') + (res ? '' : ' ghost') + '">' + D20 +
      '<span class="sd20num' + (res ? '' : ' sghost') + '">' + (res ? res.total : '--') + '</span></div>';
    out += '<div class="srbmeta"><span class="srbline' + (res ? '' : ' sghost') + '">d20 ' + (res ? res.roll : '--') + '</span>';
    if (res && bonus !== null) {
      out += '<span class="srbmod">' + (bonus > 0 ? '+' + bonus : String(bonus)) + '</span>';
    }
    if (res && res.crit) out += '<span class="srbcrit">crit</span>';
    out += '</div></div>';
    out += '<div class="sbeam"></div>';
    out += damageBlock(res, type, damage);
    out += '</div>';
    return out;
  }

  /* An attack: its name, its bonus, and the rolls it holds. */
  function attackCell(a, edit, rolls) {
    var bonus = edit && edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : a.bonus;
    var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
    var type = damageType(a);
    var trio = trioOf(type);
    var out = '<div class="scell" data-name="' + C.esc(a.name) + '"' + (trio ? ' style="--beam:' + trio + '"' : '') + '>';
    out += '<div class="schead"><span class="satkname" title="' + C.esc(a.text || '') + '">' + C.esc(a.name) + '</span>';
    if (editing) {
      out += '<input class="scin satkbonus" data-role="atkbonus" type="text" value="' + C.esc(bonus) + '" aria-label="Attack bonus">';
    } else {
      out += '<span class="satkatk">' + C.esc(bonus) + '</span>';
    }
    out += '</div>';
    if (editing) {
      out += '<div class="sline"><span class="sk">Damage</span>' +
        '<input class="scin satkdamage" data-role="atkdamage" type="text" value="' + C.esc(damage) + '" aria-label="Damage of the attack">' +
        (type ? '<em class="stype" style="color:' + colourOf(type) + '">' + C.esc(type) + '</em>' : '') +
        '</div>';
    } else {
      var num = bonusOf(bonus);
      var blocks = rolls.length
        ? rolls.map(function (r) { return rollBlock(r, type, damage, num); })
        : [rollBlock(null, type, damage, num)];
      out += '<div class="srbs">' + blocks.join('') + '</div>';
    }
    out += '</div>';
    return out;
  }

  /* The multiattack: how many attacks the creature makes. */
  function multiRow(a) {
    return '<div class="smulti"><span class="sk">' + C.esc(a.name) + '</span>' +
      '<span class="smultin">&times;' + a.count + '</span></div>';
  }

  /* An action that is not an attack: a healing, a touch. It shows its dice
     and it does not roll. */
  function noteRow(a, edit) {
    var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
    var type = damageType(a);
    var out = '<div class="snote" data-name="' + C.esc(a.name) + '"><span class="satkname">' + C.esc(a.name) + '</span>';
    if (editing) {
      out += '<input class="scin satkdamage" data-role="atkdamage" type="text" value="' + C.esc(damage) + '" aria-label="Damage of the action">';
    } else if (damage) {
      out += '<span class="snotedmg">' + C.esc(damage) + '</span>';
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
        '<input class="sname" data-role="name" value="' + C.esc(s.name) + '" aria-label="Name of the summon">' +
        '<span class="ssrc">' + C.esc(block ? block.name : (s.spell || '')) + '</span>' +
        '<button type="button" class="sdel" data-role="dismiss" aria-label="Dismiss the summon">&times;</button>' +
      '</div>';
    if (editing && forms) {
      html += '<div class="sline"><span class="sk">Form</span>' +
        '<button type="button" class="spick on" data-role="form" aria-label="The form of the summon">' +
        C.esc(formName(block, s.form)) + '</button></div>';
    }
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
    html += '</span></div>';
    if (editing) {
      html += '<div class="sline"><span class="sk">Slot</span>' +
        '<button type="button" class="spick on" data-role="slot" aria-label="The slot that paid for it">' +
        (s.slot < 0 ? 'none' : String(s.slot)) + '</button>' +
        (s.concentration ? '<span class="sconc">Concentration</span>' : '') +
        '</div>';
    }
    if (actions.length) {
      html += '<div class="sline"><span class="sk">Attacks</span></div>';
      html += '<div class="satk">' + actions.map(function (a) {
        if (a.count) return multiRow(a);
        if (!a.attack) return noteRow(a, edit[a.name]);
        return attackCell(a, edit[a.name], rollsOf(s, a.name));
      }).join('') + '</div>';
    }
    return html + '</div>';
  }

  function buildCards() {
    E.list.innerHTML = summons().map(cardHtml).join('');
    E.empty.hidden = summons().length > 0;
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
      concentration: !!source.concentration,
      edit: { ac: '', hpMax: '', attacks: {} },
      rolls: {}
    };
    summons().push(s);
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
        card.form = row.dataset.form;
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

  function roll(card, name) {
    var out = derive(card);
    if (!out) return;
    var action = null;
    out.actions.forEach(function (a) { if (a.name === name) action = a; });
    if (!action || !action.attack) return;
    var edit = (card.edit && card.edit.attacks && card.edit.attacks[name]) || {};
    var bonus = edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : action.bonus;
    var damage = edit.damage !== undefined && edit.damage !== '' ? edit.damage : action.damage;
    var result = C.R.rollAttack(bonus, damage);
    if (!card.rolls) card.rolls = {};
    var list = rollsOf(card, name);
    list.push(result);
    /* A multiattack is made as many times as it says, so the cell keeps
       that many rolls and no more. */
    var cap = action.multi && action.multi > 0 ? action.multi : 1;
    while (list.length > cap) list.shift();
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
      '.ssrc{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%}',
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
      '.scell{border:1px solid var(--edge);border-radius:5px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.012));padding:7px 8px;display:flex;flex-direction:column;gap:6px;cursor:pointer}',
      '.scell:active{border-color:rgba(var(--arcane-rgb),.45)}',
      '.schead{display:flex;align-items:baseline;gap:8px}',
      '.satkname{flex:1 1 auto;min-width:0;font-size:12.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.satkatk{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;flex:0 0 auto}',
      '.srbs{display:flex;flex-direction:column;gap:6px}',
      '.srblock{display:flex;flex-direction:column;gap:5px}',
      '.srblock+.srblock{border-top:1px dashed var(--edge);padding-top:6px}',
      '.srb{display:flex;align-items:center;justify-content:center;gap:12px}',
      '.sd20{position:relative;width:52px;height:52px;flex:0 0 auto;display:flex;align-items:center;justify-content:center}',
      '.sd20g{position:absolute;left:0;top:0;width:100%;height:100%;fill:none;stroke-linejoin:round;stroke-linecap:round}',
      '.sd20hex{stroke:rgba(var(--arcane-rgb),.55);stroke-width:1.7}',
      '.sd20tri{stroke:rgba(var(--arcane-rgb),.22);stroke-width:1}',
      '.sd20num{position:relative;font-family:var(--display);font-weight:700;font-size:21px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}',
      '.sd20.crit .sd20hex{stroke:rgba(var(--gold-rgb),.9)}',
      '.sd20.crit .sd20tri{stroke:rgba(var(--gold-rgb),.28)}',
      '.sd20.crit .sd20num{color:var(--gold)}',
      '.srbmeta{display:flex;flex-direction:column;gap:1px;align-items:flex-start}',
      '.srbline{font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums}',
      '.srbmod{font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums}',
      '.srbcrit{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}',
      '.sbeam{height:16px;display:flex;justify-content:center}',
      '.sbeam::before{content:"";width:3px;border-radius:2px;background:linear-gradient(180deg,rgba(var(--beam,var(--arcane-rgb)),.55),rgba(var(--beam,var(--arcane-rgb)),.12));box-shadow:0 0 10px rgba(var(--beam,var(--arcane-rgb)),.35)}',
      '.sdmg{padding-top:6px;border-top:1px solid var(--edge);display:flex;flex-direction:column;gap:5px}',
      '.sdtop{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}',
      '.sdt{font-family:var(--display);font-weight:700;font-size:22px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}',
      '.stype{font-style:normal;font-size:9.5px;letter-spacing:.04em}',
      '.sdice{display:flex;gap:8px;flex-wrap:wrap}',
      '.sg{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0}',
      '.slbl{font-size:10px;line-height:1.1;color:var(--muted);font-variant-numeric:tabular-nums}',
      '.sgroll{font-size:11.5px;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums}',
      '.sghost{color:#6f6a8d}',
      '.smulti{display:flex;align-items:center;gap:6px;padding:1px 0}',
      '.smultin{font-size:11px;color:var(--gold);font-variant-numeric:tabular-nums}',
      '.snote{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}',
      '.snotedmg{font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums}',
      '.scard .satkbonus{width:58px;text-align:right}',
      '.scard .satkdamage{flex:1 1 auto;min-width:0}',
      '.scin{font-family:var(--sans);font-size:12.5px;color:var(--ink);background:rgba(255,255,255,.04);border:1px solid var(--edge);border-radius:4px;padding:2px 4px;min-width:0}',
      '.snum{width:44px;text-align:center}',
      '.scard .spick{font-size:11px;padding:4px 9px}'
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
            commit();
            return;
          }
        }
        /* An attack is rolled when it is tapped, the way the volley rolls a
           beam. */
        if (editing) return;
        var row = ev.target.closest('.scell');
        if (!row || !row.dataset.name) return;
        if (ev.target.closest('input, button')) return;
        roll(s, row.dataset.name);
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
