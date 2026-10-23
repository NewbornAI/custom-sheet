/* The summons page: the creatures a character has called to the table.
   A summon carries a name the player may rename, an armour class, the hit
   points, the attacks with their bonus and their damage, and the slot that
   paid for it. */
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
     when its text names one. What the character already has is the seed:
     the three of the bard, the five of the sorcerer. */
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

  /* ---- the cards ---- */

  function slotOptions(current) {
    var html = '<option value="-1"' + (current < 0 ? ' selected' : '') + '>none</option>';
    for (var i = 0; i <= 9; i++) {
      html += '<option value="' + i + '"' + (current === i ? ' selected' : '') + '>' + i + '</option>';
    }
    return html;
  }

  function attackRow(a, ix) {
    return '<div class="satkrow" data-ix="' + ix + '">' +
      '<input class="scin satkname" data-role="atkname" value="' + C.esc(a.name) + '" aria-label="Name of the attack">' +
      '<input class="scin satkbonus" data-role="atkbonus" type="text" value="' + C.esc(a.bonus) + '" aria-label="Attack bonus">' +
      '<input class="scin satkdamage" data-role="atkdamage" value="' + C.esc(a.damage) + '" aria-label="Damage of the attack">' +
      '</div>';
  }

  function cardHtml(s) {
    var block = s.key ? library()[s.key] : null;
    var attacks = (s.attacks || []).map(attackRow).join('');
    /* A block whose numbers are a formula says so under the name, since the
       field of the armour class can only hold a number. */
    var formulas = [];
    if (block && block.acText) formulas.push('AC ' + block.acText);
    if (block && block.hpText && !block.hp) formulas.push('HP ' + block.hpText);
    return '<div class="scard" data-id="' + C.esc(s.id) + '">' +
      '<div class="sstop">' +
        '<input class="sname" data-role="name" value="' + C.esc(s.name) + '" aria-label="Name of the summon">' +
        '<span class="ssrc">' + C.esc(block ? block.name : (s.spell || '')) + '</span>' +
        '<button type="button" class="sdel" data-role="dismiss" aria-label="Dismiss the summon">&times;</button>' +
      '</div>' +
      (formulas.length ? '<div class="sformula">' + C.esc(formulas.join(' \u00b7 ')) + '</div>' : '') +
      '<div class="sline">' +
        '<span class="slab">AC</span>' +
        '<input class="scin snum" data-role="ac" type="number" inputmode="numeric" value="' + (s.ac || '') + '" aria-label="Armour class of the summon">' +
        '<span class="slab">HP</span>' +
        '<button type="button" class="sstep" data-role="hpdown" aria-label="One hit point less">&minus;</button>' +
        '<input class="scin snum" data-role="hp" type="number" inputmode="numeric" value="' + (s.hp || 0) + '" aria-label="Hit points of the summon">' +
        '<button type="button" class="sstep" data-role="hpup" aria-label="One hit point more">+</button>' +
        '<span class="sof">of <input class="scin snum" data-role="hpmax" type="number" inputmode="numeric" value="' + (s.hpMax || 0) + '" aria-label="Maximum hit points of the summon"></span>' +
      '</div>' +
      '<div class="sline">' +
        '<label class="slab">Slot <select class="scin" data-role="slot" aria-label="The slot that paid for it">' + slotOptions(s.slot) + '</select></label>' +
        (s.concentration ? '<span class="sconc">Concentration</span>' : '') +
      '</div>' +
      (attacks ? '<div class="satk">' + attacks + '</div>' : '') +
      '</div>';
  }

  function buildCards() {
    E.list.innerHTML = summons().map(cardHtml).join('');
    E.empty.hidden = summons().length > 0;
  }

  function renderCards() {
    summons().forEach(function (s) {
      var card = E.list.querySelector('.scard[data-id="' + s.id + '"]');
      if (!card) return;
      var name = card.querySelector('[data-role="name"]');
      if (name && document.activeElement !== name) name.value = s.name;
      var hp = card.querySelector('[data-role="hp"]');
      if (hp && document.activeElement !== hp) hp.value = String(s.hp || 0);
      var max = card.querySelector('[data-role="hpmax"]');
      if (max && document.activeElement !== max) max.value = String(s.hpMax || 0);
      var ac = card.querySelector('[data-role="ac"]');
      if (ac && document.activeElement !== ac) ac.value = s.ac ? String(s.ac) : '';
      var slot = card.querySelector('[data-role="slot"]');
      if (slot) slot.value = String(s.slot < 0 ? -1 : s.slot);
    });
  }

  /* ---- the creature that comes to the table ---- */

  /* The 2024 blocks write the level of the calling spell and the
     proficiency of the caster as a name, so the card holds the numbers. */
  function resolveDamage(text, source) {
    if (!text) return text;
    var out = String(text);
    if (source.level !== null && source.level !== undefined) {
      out = out.replace(/summonSpellLevel/g, String(source.level));
    }
    var ch = api.character().char || {};
    if (C.SR && C.SR.profBonus && ch.level) {
      out = out.replace(/\bPB\b/g, String(C.SR.profBonus(ch.level)));
    }
    return out;
  }

  /* An attack of the caster, the spell attack of a summon, carries the
     bonus of the character that called it. */
  function resolveBonus(a) {
    if (a.bonus) return a.bonus;
    if (!/spell attack modifier/i.test(a.text || '')) return a.bonus;
    var ch = api.character().char || {};
    if (!ch.level || !C.SR || !C.SR.spellAttack) return a.bonus;
    var bonus = C.SR.spellAttack(ch, C.primaryAbility ? C.primaryAbility(ch) : 'cha');
    return (bonus >= 0 ? '+' : '') + bonus;
  }

  function addSummon(source, block, key) {
    var s = {
      id: 's' + Date.now() + Math.floor(Math.random() * 1000),
      name: block ? block.name : source.name,
      key: key || '',
      ac: block ? (Number(block.ac) || 0) : 0,
      acText: block ? (block.acText || '') : '',
      hp: block ? (Number(block.hp) || 0) : 0,
      hpText: block ? (block.hpText || '') : '',
      hpMax: block ? (Number(block.hp) || 0) : 0,
      slot: source.level === null || source.level === undefined ? -1 : source.level,
      spell: source.name,
      concentration: !!source.concentration,
      attacks: block && block.actions ? block.actions.map(function (a) {
        return { name: a.name, bonus: resolveBonus(a), damage: resolveDamage(a.damage, source) };
      }) : []
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
      /* A source that names nothing, the Conjure Animals, leaves the choice
         to the player, so the whole library is offered. */
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
    always: true,
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
      '.sformula{font-size:10px;color:var(--muted);line-height:1.4}',
      '.scin{font-family:var(--sans);font-size:12.5px;color:var(--ink);background:rgba(255,255,255,.04);border:1px solid var(--edge);border-radius:4px;padding:2px 4px;min-width:0}',
      '.snum{width:44px;text-align:center}',
      '.scard select.scin{width:54px}'
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
        else if (role === 'ac') s.ac = Math.max(0, Math.min(99, Number(roleEl.value) || 0));
        else if (role === 'hp') s.hp = Math.max(0, Math.min(999, Number(roleEl.value) || 0));
        else if (role === 'hpmax') {
          s.hpMax = Math.max(0, Math.min(999, Number(roleEl.value) || 0));
          if (s.hp > s.hpMax) s.hp = s.hpMax;
        } else if (role === 'slot') s.slot = Number(roleEl.value);
        else if (role === 'atkname' || role === 'atkbonus' || role === 'atkdamage') {
          var ix = Number(roleEl.closest('.satkrow').dataset.ix);
          var a = s.attacks[ix];
          if (!a) return;
          if (role === 'atkname') a.name = roleEl.value;
          else if (role === 'atkbonus') a.bonus = roleEl.value;
          else a.damage = roleEl.value;
        } else return;
        api.save();
      });

      E.body.addEventListener('click', function (ev) {
        var roleEl = ev.target.closest ? ev.target.closest('[data-role]') : null;
        if (!roleEl) return;
        var role = roleEl.dataset.role;
        if (role !== 'dismiss' && role !== 'hpup' && role !== 'hpdown') return;
        var card = roleEl.closest('.scard');
        if (!card) return;
        var s = byId(card.dataset.id);
        if (!s) return;
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
      renderCards();
    }
  });

  /* What the cards were built for: the character and the creatures it has. */
  function signature() {
    return api.state.current + '|' + summons().map(function (s) { return s.id; }).join(',') +
      '|' + Object.keys(library()).length;
  }
})();
