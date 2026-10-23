/* The summons page: the creatures a character has called to the table.
   A summon carries a name the player may rename, an armour class, the hit
   points, the attacks with their bonus and their damage, and the slot that
   paid for it. What the block of the creature says is worked out with the
   level of that slot, so a spirit that is called at a higher level carries
   the numbers of that level. */
(function () {
  'use strict';

  var C = Sheet.core;

  var api = null;       /* the shell gives it at mount */
  var E = {};           /* the elements of the page */
  var built = null;     /* what the cards were built for */
  var machine = null;   /* the creatures the machine holds, once it answered */

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
    var actions = (form ? form.actions : block.actions).map(function (a) {
      return {
        name: a.name,
        text: a.text,
        bonus: deriveBonus(a, ctx),
        damage: deriveDamage(a.damageParts, ctx) || a.damage || '',
        count: deriveCount(a.count, ctx)
      };
    });
    return { ac: ac, hpMax: hp, actions: actions, form: form, block: block };
  }

  /* ---- the cards ---- */

  function attackRow(a, ix, edit) {
    var label = a.count ? a.name + ' (x' + a.count + ')' : a.name;
    var bonus = edit && edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : a.bonus;
    var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
    return '<div class="satkrow" data-ix="' + ix + '" data-name="' + C.esc(a.name) + '">' +
      '<span class="satkname" title="' + C.esc(a.text || '') + '">' + C.esc(label) + '</span>' +
      '<input class="scin satkbonus" data-role="atkbonus" type="text" value="' + C.esc(bonus) + '" aria-label="Attack bonus">' +
      '<input class="scin satkdamage" data-role="atkdamage" type="text" value="' + C.esc(damage) + '" aria-label="Damage of the attack">' +
      '</div>';
  }

  /* The form the card carries, and the one it would fall back to. */
  function formName(block, id) {
    if (!block || !block.forms || !block.forms.length) return '';
    var found = null;
    block.forms.forEach(function (f) { if (f.id === id) found = f; });
    if (!found) found = block.forms[0];
    return found ? found.name : '';
  }

  function cardHtml(s) {
    var block = library()[s.key];
    var out = derive(s);
    var forms = block && block.forms && block.forms.length ? block.forms : null;
    var actions = out ? out.actions : [];
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
    if (forms) {
      html += '<div class="sline"><span class="slab">Form</span>' +
        '<button type="button" class="spick on" data-role="form" aria-label="The form of the summon">' +
        C.esc(formName(block, s.form)) + '</button></div>';
    }
    html += '<div class="sline">' +
      '<span class="slab">AC</span>' +
      '<input class="scin snum" data-role="ac" type="number" inputmode="numeric" value="' + C.esc(ac) + '" aria-label="Armour class of the summon">' +
      '<span class="slab">HP</span>' +
      '<button type="button" class="sstep" data-role="hpdown" aria-label="One hit point less">&minus;</button>' +
      '<input class="scin snum" data-role="hp" type="number" inputmode="numeric" value="' + (s.hp || 0) + '" aria-label="Hit points of the summon">' +
      '<button type="button" class="sstep" data-role="hpup" aria-label="One hit point more">+</button>' +
      '<span class="sof">of <input class="scin snum" data-role="hpmax" type="number" inputmode="numeric" value="' + C.esc(max) + '" aria-label="Maximum hit points of the summon"></span>' +
      '</div>' +
      '<div class="sline">' +
        '<span class="slab">Slot</span>' +
        '<button type="button" class="spick on" data-role="slot" aria-label="The slot that paid for it">' +
        (s.slot < 0 ? 'none' : String(s.slot)) + '</button>' +
        (s.concentration ? '<span class="sconc">Concentration</span>' : '') +
      '</div>';
    if (actions.length) {
      var edits = (s.edit && s.edit.attacks) || {};
      html += '<div class="satk">' + actions.map(function (a, ix) {
        return attackRow(a, ix, edits[a.name]);
      }).join('') + '</div>';
    }
    return html + '</div>';
  }

  function buildCards() {
    E.list.innerHTML = summons().map(cardHtml).join('');
    E.empty.hidden = summons().length > 0;
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
      edit: { ac: '', hpMax: '', attacks: {} }
    };
    summons().push(s);
    commit();
    api.toast(s.name + ' comes to the table');
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
      '.slab{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#6f6a8d;display:inline-flex;align-items:center;gap:3px}',
      '.sof{display:inline-flex;align-items:center;gap:3px}',
      '.sstep{width:22px;height:22px;border-radius:5px;border:1px solid var(--edge);background:none;color:var(--ink);font:inherit;font-size:14px;line-height:1;cursor:pointer;flex:0 0 auto;padding:0}',
      '.sstep:active{border-color:var(--arcane);color:var(--arcane)}',
      '.sconc{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)}',
      '.satk{display:flex;flex-direction:column;gap:4px}',
      '.satkrow{display:grid;grid-template-columns:minmax(0,1fr) 42px 86px;gap:4px;align-items:center}',
      '.satkname{width:100%;min-width:0}',
      '.satkbonus{width:42px}',
      '.satkdamage{width:86px}',
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
          var row = roleEl.closest('.satkrow');
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
        if (!roleEl) return;
        var role = roleEl.dataset.role;
        if (role !== 'dismiss' && role !== 'hpup' && role !== 'hpdown' && role !== 'form' && role !== 'slot') return;
        var card = roleEl.closest('.scard');
        if (!card) return;
        var s = byId(card.dataset.id);
        if (!s) return;
        if (role === 'form') { openFormPicker(s); return; }
        if (role === 'slot') { openSlotPicker(s); return; }
        if (role === 'dismiss') {
          slice().list = summons().filter(function (x) { return x.id !== s.id; });
          buildCards();
          commit();
          api.toast(s.name + ' is dismissed');
          return;
        }
        var step = role === 'hpup' ? 1 : -1;
        s.hp = Math.max(0, Math.min(999, (Number(s.hp) || 0) + step));
        commit();
      });
    },

    /* The head of the app calls a creature. */
    head: function (root, a) {
      api = a;
      root.appendChild(C.headButton('Call a creature',
        '<path d="M12 5v14"/><path d="M5 12h14"/>',
        function () { openSources(); }));
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
    }
  });

  /* What the cards were built for: the character and the creatures it has. */
  function signature() {
    return api.state.current + '|' + summons().map(function (s) { return s.id; }).join(',') +
      '|' + Object.keys(library()).length;
  }
})();
