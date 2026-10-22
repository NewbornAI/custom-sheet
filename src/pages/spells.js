/* The spells page: the slots, the sorcery points and the list of spells. */
(function () {
  'use strict';

  var C = Volley.core;
  var R = C.R;
  var LEVELS = C.LEVELS;
  var WARLOCK_LEVEL = C.WARLOCK_LEVEL;

  var api = null;   /* the shell gives it at mount */
  var E = {};       /* the elements of the page */
  var S = {};       /* the state of the page */

  var editing = false;
  var dragged = false;

  var SPELL_DEFAULTS = {
    dc: 17,
    dcTouched: false,
    sp: 8,
    spMax: 8,
    cunning: false,
    sorcRest: false,
    sorcererLevel: 8,
    max: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
    left: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
    warlockMax: 2,
    warlockLeft: 2,
    selected: 1,
    lists: {},
    classes: {},
    levelFilter: true,
    surge: null
  };

  var SPELL_SEED = (C.book.seed || []).map(function (s) { return s.name; });

  function commit() { api.save(); api.refresh(); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---- the state ---- */

  function seed(saved, fresh) {
    var s = {};
    Object.keys(SPELL_DEFAULTS).forEach(function (k) { s[k] = SPELL_DEFAULTS[k]; });
    /* A character that is new holds nothing: no point, no slot, no spell.
       Its own record is read after, so one made from a ready-made
       character keeps everything that character was given. */
    if (fresh) {
      s.sp = 0;
      s.spMax = 0;
      s.max = {};
      s.left = {};
      s.warlockMax = 0;
      s.warlockLeft = 0;
      s.sorcererLevel = 1;
      s.classes = {};
      s.levelFilter = true;
      s.dcTouched = false;
    }
    if (saved && typeof saved === 'object') {
      Object.keys(SPELL_DEFAULTS).forEach(function (k) {
        if (saved[k] !== undefined && saved[k] !== null && typeof saved[k] === typeof SPELL_DEFAULTS[k]) s[k] = saved[k];
      });
      if (saved.classes) {
        s.classes = {};
        /* the class names were canonicalised, so an old key follows */
        Object.keys(saved.classes).forEach(function (k) { s.classes[C.canonSource(k)] = !!saved.classes[k]; });
      }
      if (saved.levelFilter !== undefined) s.levelFilter = !!saved.levelFilter;
      /* A save DC the player moved in an earlier version stays where it was
         put, and from now on it follows the character. */
      if (saved.dc !== undefined && Number(saved.dc) !== 17) s.dcTouched = true;
      if (saved.max) { s.max = {}; Object.keys(SPELL_DEFAULTS.max).forEach(function (k) { s.max[k] = Number(saved.max[k]) || 0; }); }
      if (saved.left) { s.left = {}; Object.keys(SPELL_DEFAULTS.left).forEach(function (k) { s.left[k] = Number(saved.left[k]) || 0; }); }
    }
    /* The spells of the character come first: a level it filled itself
       stays the way it left it, an empty one included. */
    var lists = {};
    LEVELS.forEach(function (lv) {
      var own = (saved && saved.lists && saved.lists[lv]) || null;
      if (own) {
        lists[lv] = own.filter(function (n) { return C.bookByName[n]; });
        return;
      }
      if (fresh) { lists[lv] = []; return; }
      lists[lv] = SPELL_SEED.filter(function (n) {
        var sp = C.bookByName[n];
        return sp && sp.level === lv;
      });
    });
    s.lists = lists;
    return s;
  }

  /* ---- the strip of levels ---- */

  function pipButton(full, lv, n, warlock) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pip' + (warlock ? ' wl' : '') + (full ? ' full' : '');
    b.dataset.lv = String(lv);
    b.dataset.n = String(n);
    if (warlock) b.dataset.wl = '1';
    b.setAttribute('aria-label', (warlock ? 'Warlock slot ' : 'Slot ') + n);
    return b;
  }

  function editButton(sign, lv, warlock) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini';
    b.textContent = sign;
    b.dataset.edit = sign === '+' ? 'add' : 'take';
    b.dataset.lv = String(lv);
    if (warlock) b.dataset.wl = '1';
    return b;
  }

  function renderLevels() {
    E.levels.innerHTML = '';
    E.levels.classList.toggle('editing', editing);

    /* How many slots each level holds, so the columns can share the width
       and every slot can be the same size in the whole strip. */
    var counts = LEVELS.map(function (lv) {
      return (S.max[lv] || 0) + (lv === WARLOCK_LEVEL ? (S.warlockMax || 0) : 0);
    });
    var busiest = Math.max.apply(null, counts) || 1;
    var pipH = Math.max(9, Math.min(16, Math.floor((120 - (busiest - 1) * 2) / busiest)));
    E.levels.style.setProperty('--pip-h', pipH + 'px');

    LEVELS.forEach(function (lv, ix) {
      var max = S.max[lv] || 0;
      var left = Math.min(S.left[lv] || 0, max);
      var col = document.createElement('div');
      col.className = 'lv' + (lv === S.selected ? ' on' : '') + (editing ? ' editing' : '');
      if (lv > 0 && !counts[ix]) col.classList.add('dim');
      col.dataset.lv = String(lv);
      col.style.flexGrow = String(Math.max(1, counts[ix]));

      /* The bolt turns a slot into sorcery points, so a character with no
         sorcery points has nothing to do with it. */
      if (lv > 0 && S.spMax) {
        var bolt = document.createElement('button');
        bolt.type = 'button';
        bolt.className = 'bolt';
        bolt.dataset.bolt = String(lv);
        bolt.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
          '<path d="M13.6 2L4.2 13.4h5.4L9.6 22 19.4 10.2H14L13.6 2z"/></svg>';
        var hasSlot = S.left[lv] > 0 || (lv === WARLOCK_LEVEL && S.warlockLeft > 0);
        var why = S.sp >= S.spMax
          ? 'Your sorcery points are full'
          : (!hasSlot ? 'No level ' + lv + ' slot left' : '');
        bolt.setAttribute('aria-label', 'Turn a level ' + lv + ' slot into ' + lv + ' sorcery points' + (why ? ', ' + why : ''));
        bolt.title = why || ('Turn a level ' + lv + ' slot into ' + lv + ' sorcery points');
        bolt.disabled = !!why;
        col.appendChild(bolt);
      } else {
        var space = document.createElement('span');
        space.className = 'boltspace';
        col.appendChild(space);
      }

      var head = document.createElement('span');
      head.className = 'head';
      var n = document.createElement('span');
      n.className = 'n';
      n.textContent = String(lv);
      head.appendChild(n);
      col.appendChild(head);

      var pips = document.createElement('span');
      pips.className = 'pips';
      for (var i = 1; i <= max; i++) pips.appendChild(pipButton(i <= left, lv, i, false));
      if (lv === WARLOCK_LEVEL && S.warlockMax) {
        var wlGroup = document.createElement('span');
        wlGroup.className = 'wlgroup';
        for (var w = 1; w <= S.warlockMax; w++) wlGroup.appendChild(pipButton(w <= S.warlockLeft, lv, w, true));
        pips.appendChild(wlGroup);
      }
      col.appendChild(pips);

      var down = document.createElement('button');
      down.type = 'button';
      down.className = 'down';
      down.dataset.lv = String(lv);
      down.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
        '<path d="M6 9.5l6 6 6-6"/></svg>';
      down.setAttribute('aria-label', 'Show the spells of level ' + lv);
      down.title = 'Show the spells of level ' + lv;
      col.appendChild(down);

      var edit = document.createElement('span');
      edit.className = 'edit';
      if (lv > 0) {
        edit.appendChild(editButton('-', lv, false));
        edit.appendChild(editButton('+', lv, false));
      }
      if (lv === WARLOCK_LEVEL && S.warlockMax) {
        var wl = document.createElement('span');
        wl.className = 'plus';
        wl.textContent = 'W';
        edit.appendChild(wl);
        edit.appendChild(editButton('-', lv, true));
        edit.appendChild(editButton('+', lv, true));
      }
      col.appendChild(edit);

      E.levels.appendChild(col);
    });

    if (editing) {
      var cell = document.createElement('div');
      cell.className = 'lv editing';
      var head2 = document.createElement('span');
      head2.className = 'head';
      var lbl = document.createElement('span');
      lbl.className = 'n';
      lbl.textContent = 'Lv';
      head2.appendChild(lbl);
      cell.appendChild(head2);
      var val = document.createElement('span');
      val.className = 'val';
      val.textContent = String(S.sorcererLevel);
      cell.appendChild(val);
      var ed = document.createElement('span');
      ed.className = 'edit';
      ed.style.display = 'flex';
      var down2 = document.createElement('button');
      down2.type = 'button'; down2.className = 'mini'; down2.textContent = '-'; down2.dataset.lvl = '-1';
      var up = document.createElement('button');
      up.type = 'button'; up.className = 'mini'; up.textContent = '+'; up.dataset.lvl = '1';
      ed.appendChild(down2); ed.appendChild(up);
      cell.appendChild(ed);
      E.levels.appendChild(cell);
    }
  }

  /* ---- the list of spells ---- */

  /* The summary of a spell: the same fields, in the same order, on every
     card, so the labels line up down the list. */
  function spellFields(spell, full) {
    var comps = spell.components ? spell.components.split('').join(' ') : '-';
    var time = full ? (spell.timeFull || spell.time) : spell.time;
    var hasTrigger = !!(full && spell.timeFull && spell.timeFull !== spell.time);
    return C.field('Cast', time, '', hasTrigger) +
      C.field('Range', spell.range) +
      C.field('Duration', spell.duration) +
      C.field('Comps', comps, 'cmp') +
      C.field('Conc', spell.concentration ? 'Yes' : 'No', spell.concentration ? 'yes' : '') +
      C.field('Ritual', spell.ritual ? 'Yes' : 'No', spell.ritual ? 'rit' : '');
  }

  function renderSpellList() {
    var list = S.lists[S.selected] || [];
    E.spellList.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No spells at level ' + S.selected + ' yet. Open the grimoire with the + button to add some.';
      E.spellList.appendChild(empty);
      return;
    }
    list.forEach(function (name) {
      var spell = C.bookByName[name];
      if (!spell) return;
      var card = document.createElement('div');
      card.className = 'card';
      card.dataset.name = name;
      card.innerHTML = '<div class="top"><span class="t">' + C.esc(spell.name) + '</span>' +
        C.sourceTag(spell.source) + '</div><div class="m">' + spellFields(spell) + '</div>';
      E.spellList.appendChild(card);
    });
  }

  /* The level a spell sits in, or -1 when it is not in the list. */
  function listLevelOf(name) {
    for (var i = 0; i < LEVELS.length; i++) {
      var list = S.lists[LEVELS[i]] || [];
      if (list.indexOf(name) >= 0) return LEVELS[i];
    }
    return -1;
  }

  /* The save DC is the character's, until the player moves it here. */
  function saveDC() {
    if (S.dcTouched) return S.dc;
    var ch = api.character().char;
    if (ch && ch.abilities) return C.SR.spellDC(ch);
    return S.dc;
  }

  function renderSpells() {
    E.dcValue.textContent = saveDC();
    E.spValue.textContent = S.sp + '/' + S.spMax;
    /* A character with no sorcery point and no pact slot has no use for
       the sorcerer's controls, and one with no wild surge has no use for
       the table, so they go away rather than sit there doing nothing. */
    var sorc = S.spMax > 0;
    var wild = (api.character().char.features || []).some(function (f) { return f.key === 'wildSurge'; });
    E.spStat.hidden = !sorc;
    E.sorcRest.hidden = !sorc;
    E.cunning.hidden = !(S.warlockMax > 0);
    E.wildSurge.hidden = !wild;
    E.cunning.setAttribute('aria-pressed', S.cunning ? 'true' : 'false');
    E.sorcRest.setAttribute('aria-pressed', S.sorcRest ? 'true' : 'false');
    E.sorcRest.title = 'Restores ' + Math.floor(S.sorcererLevel / 2) + ' sorcery points';
    E.dcStat.classList.toggle('editing', editing);
    var list = S.lists[S.selected] || [];
    E.listTitle.textContent = 'Level ' + S.selected + ' spells · ' + list.length;
    renderLevels();
    renderSpellList();
  }

  /* ---- the spell of the page ---- */

  function openSpell(name) {
    var spell = C.bookByName[name];
    if (!spell) return;
    api.sheet.open({
      id: 'spell:' + name,
      title: spell.name,
      meta: C.field('Level', spell.level) + spellFields(spell, true) + C.sourceTag(spell.source),
      text: C.renderBlocks(spell.blocks),
      actions: [{
        label: 'Remove from level ' + S.selected,
        kind: 'danger',
        onClick: function () {
          var list = S.lists[S.selected] || [];
          var ix = list.indexOf(name);
          if (ix >= 0) list.splice(ix, 1);
          api.sheet.close();
          commit();
        }
      }]
    });
  }

  /* ---- the grimoire ---- */

  function grimoireTitle(lv) {
    var on = S.classes || {};
    var active = Object.keys(on).filter(function (c) { return on[c]; });
    var byLevel = S.levelFilter !== false;
    return 'Grimoire' + (byLevel ? ', level ' + lv : '') +
      (active.length ? ' \u00b7 ' + active.join(', ') : '');
  }

  function grimoireList(lv, q) {
    var on = S.classes || {};
    var active = Object.keys(on).filter(function (c) { return on[c]; });
    var byLevel = S.levelFilter !== false;
    var rows = (C.book.spells || [])
      .filter(function (s) { return byLevel ? s.level === lv : true; })
      .filter(function (s) {
        if (!active.length) return true;
        return (s.classes || []).some(function (c) { return active.indexOf(c) >= 0; });
      })
      .filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) >= 0; });

    if (!rows.length) {
      return '<div class="empty">' + C.esc(active.length
        ? 'No spell of ' + active.join(', ') + (byLevel ? ' at this level' : '') + '.'
        : 'Nothing matches.') + '</div>';
    }

    return rows.map(function (s) {
      var at = listLevelOf(s.name);
      var added = at >= 0;
      var chips = (s.classes || []).map(function (c) {
        return '<button type="button" class="gcls' + (on[c] ? ' on' : '') + '" data-cls="' + C.esc(c) + '" ' +
          'title="' + C.esc(c) + '" aria-label="' + C.esc(c) + (on[c] ? ', on' : ', off') + '">' +
          C.esc(C.classShort(c)) + '</button>';
      }).join('');
      return '<div class="row">' +
        '<div class="g1">' +
          '<span class="gn tappable" data-name="' + C.esc(s.name) + '" aria-label="Read ' + C.esc(s.name) + '">' + C.esc(s.name) + '</span>' +
          '<button type="button" class="gadd" data-name="' + C.esc(s.name) + '" aria-label="' +
            (added ? 'Unlearn ' : 'Add ') + C.esc(s.name) + '">' + (added ? '\u2713' : '+') + '</button>' +
        '</div>' +
        '<div class="g2">' + chips +
          '<span class="gs">' + C.esc(added ? 'in level ' + at : s.time) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function openGrimoire(lv) {
    S.selected = lv;
    api.sheet.open({
      id: 'grimoire',
      title: grimoireTitle(lv),
      metaClass: 'sheet-meta one',
      meta: '<span>Tap a spell to read it, a class to filter, + learns, a check unlearns</span>',
      list: true,
      search: true,
      level: true,
      levelLabel: S.levelFilter !== false ? 'Level ' + lv : 'All levels',
      levelOn: S.levelFilter !== false,
      onPaint: function (root) {
        root.querySelector('#sheetTitle').textContent = grimoireTitle(lv);
        root.querySelector('#sheetList').innerHTML = grimoireList(lv, (api.sheet.search() || '').toLowerCase());
        var tog = root.querySelector('#grimoireLevel');
        tog.textContent = S.levelFilter !== false ? 'Level ' + lv : 'All levels';
        tog.setAttribute('aria-pressed', S.levelFilter !== false ? 'true' : 'false');
      },
      onSearch: function () { openGrimoire(lv); },
      onLevel: function () {
        S.levelFilter = S.levelFilter === false;
        api.save();
        openGrimoire(lv);
      },
      onList: function (ev) {
        var chip = ev.target.closest('.gcls');
        if (chip) {
          var cls = chip.dataset.cls;
          S.classes[cls] = !S.classes[cls];
          api.save();
          openGrimoire(lv);
          return;
        }
        var name = ev.target.closest('.gn, .gadd');
        if (!name) return;
        var spell = name.dataset.name;
        if (name.classList.contains('gadd')) {
          var level = listLevelOf(spell);
          if (level >= 0) {
            var list = S.lists[level] || [];
            var ix = list.indexOf(spell);
            if (ix >= 0) list.splice(ix, 1);
          } else {
            var target = S.lists[S.selected] || (S.lists[S.selected] = []);
            if (target.indexOf(spell) < 0) target.push(spell);
          }
          api.save();
          openGrimoire(lv);
          renderSpellList();
          return;
        }
        openSpell(spell);
      }
    });
    commit();
  }

  /* ---- the wild magic surge ---- */

  function openSurge() {
    var s = S.surge;
    var html = '<button class="surgelarge" type="button" id="surgeRoll" aria-label="Roll the wild magic surge">' +
      '<span class="surged100">' + (s ? s.roll : '--') + '</span></button>';
    if (s) {
      html += '<p>' + C.markup(s.text) + '</p>';
      if (s.dice && s.dice.length) {
        html += '<p>' + s.dice.map(function (d) {
          return C.esc(d.label) + ': ' + d.values.join(' + ') + ' = ' + d.total;
        }).join('<br>') + '</p>';
      }
    } else {
      html += '<p>Roll the surge to see what the wild magic does.</p>';
    }

    api.sheet.open({
      id: 'surge',
      title: 'Wild magic surge',
      meta: s
        ? C.field('Range', pad2(s.from) + '-' + pad2(s.to)) + C.field('Roll', 'd100: ' + s.roll)
        : C.field('Roll', 'd100'),
      text: html,
      actions: [{ label: 'Roll the surge', onClick: rollSurge }],
      onPaint: function (root) {
        var big = root.querySelector('#surgeRoll');
        if (big) big.addEventListener('click', rollSurge);
      }
    });
  }

  function rollSurge() {
    if (!C.surge.rows || !C.surge.rows.length) {
      api.toast('The surge table did not load.');
      return;
    }
    var result = R.rollSurge(C.surge.rows);
    S.surge = { roll: result.roll, from: result.from, to: result.to, text: result.text, dice: result.dice };
    api.save();
    openSurge();
    if (navigator.vibrate) navigator.vibrate(result.dice.length ? [14, 45, 14] : 16);
  }

  /* ---- the page ---- */

  Volley.page({
    id: 'spells',
    title: 'Spells',
    order: 2,
    blurb: 'The spell slots, the sorcery points and the list of spells.',
    html: [
      '<div class="sbar">',
      '  <div class="stat" id="dcStat">',
      '    <span class="k">DC</span>',
      '    <span class="v" id="dcValue">17</span>',
      '    <button class="mini" type="button" data-act="dc-" aria-label="Lower the DC">&minus;</button>',
      '    <button class="mini" type="button" data-act="dc+" aria-label="Raise the DC">+</button>',
      '  </div>',
      '  <div class="stat live" id="spStat">',
      '    <span class="k">SP</span>',
      '    <span class="v" id="spValue">8/8</span>',
      '    <button class="mini" type="button" data-act="sp-" aria-label="Spend a sorcery point">&minus;</button>',
      '    <button class="mini" type="button" data-act="sp+" aria-label="Regain a sorcery point">+</button>',
      '  </div>',
      '  <button class="tog" id="cunning" type="button" aria-pressed="false" title="Restores 1 warlock slot">Cunning</button>',
      '  <button class="tog" id="sorcRest" type="button" aria-pressed="false" title="Restores half your sorcerer level in sorcery points">Sorc rest</button>',
      '  <button class="tog wild" id="wildSurge" type="button" title="The wild magic surge">Wild</button>',
      '</div>',
      '<div class="sbody">',
      '  <div class="slotstrip" id="levels"></div>',
      '  <div class="listhead">',
      '    <span class="t" id="listTitle">Level 1 spells</span>',
      '    <button class="mini" id="addSpell" type="button" aria-label="Add a spell">+</button>',
      '  </div>',
      '  <div class="grimoire" id="spellList"></div>',
      '</div>'
    ].join('\n'),

    seed: seed,

    mount: function (root, a) {
      api = a;
      S = a.character().spells;
      E = {
        dcStat: root.querySelector('#dcStat'),
        dcValue: root.querySelector('#dcValue'),
        spValue: root.querySelector('#spValue'),
        spStat: root.querySelector('#spStat'),
        cunning: root.querySelector('#cunning'),
        sorcRest: root.querySelector('#sorcRest'),
        wildSurge: root.querySelector('#wildSurge'),
        levels: root.querySelector('#levels'),
        listTitle: root.querySelector('#listTitle'),
        addSpell: root.querySelector('#addSpell'),
        spellList: root.querySelector('#spellList')
      };

      E.cunning.addEventListener('click', function () {
        S.cunning = !S.cunning;
        if (S.cunning) S.warlockLeft = Math.min(S.warlockMax, S.warlockLeft + 1);
        else S.warlockLeft = Math.max(0, S.warlockLeft - 1);
        commit();
      });

      E.sorcRest.addEventListener('click', function () {
        var gain = Math.floor(S.sorcererLevel / 2);
        S.sorcRest = !S.sorcRest;
        if (S.sorcRest) S.sp = Math.min(S.spMax, S.sp + gain);
        else S.sp = Math.max(0, S.sp - gain);
        commit();
        bumpSp();
      });

      E.wildSurge.addEventListener('click', function () { openSurge(); });

      E.addSpell.addEventListener('click', function () { openGrimoire(S.selected); });

      root.querySelector('.sbar').addEventListener('click', function (ev) {
        var m = ev.target.closest('.mini[data-act]');
        if (!m) return;
        var act = m.dataset.act;
        if (act === 'dc+') { S.dc = saveDC() + 1; S.dcTouched = true; }
        else if (act === 'dc-') { S.dc = Math.max(0, saveDC() - 1); S.dcTouched = true; }
        else if (act === 'sp+') S.sp = Math.min(S.spMax, S.sp + 1);
        else if (act === 'sp-') S.sp = Math.max(0, S.sp - 1);
        commit();
      });

      E.levels.addEventListener('click', function (ev) {
        var bolt = ev.target.closest('.bolt');
        if (bolt) {
          var blv = Number(bolt.dataset.bolt);
          var moved = R.convertSlot({ sp: S.sp, spMax: S.spMax, left: S.left, warlockLeft: S.warlockLeft }, blv);
          if (moved) {
            S.left[blv] = moved.left;
            S.warlockLeft = moved.warlockLeft;
            S.sp = moved.sp;
            commit();
            bumpSp();
          }
          return;
        }

        var pip = ev.target.closest('.pip');
        if (pip) {
          var lv = Number(pip.dataset.lv), n = Number(pip.dataset.n);
          var full = pip.classList.contains('full');
          if (pip.dataset.wl) {
            S.warlockLeft = full ? Math.max(0, S.warlockLeft - 1) : n;
          } else {
            S.left[lv] = full ? Math.max(0, S.left[lv] - 1) : n;
          }
          commit();
          return;
        }
        var lvBtn = ev.target.closest('.mini[data-lvl]');
        if (lvBtn) {
          S.sorcererLevel = Math.max(1, Math.min(20, S.sorcererLevel + Number(lvBtn.dataset.lvl)));
          commit();
          return;
        }
        var eb = ev.target.closest('.edit .mini');
        if (eb) {
          var l = Number(eb.dataset.lv);
          var d = eb.dataset.edit === 'add' ? 1 : -1;
          if (eb.dataset.wl) {
            var wBefore = S.warlockMax;
            S.warlockMax = Math.max(0, Math.min(9, wBefore + d));
            if (S.warlockMax > wBefore) S.warlockLeft = Math.min(S.warlockMax, S.warlockLeft + (S.warlockMax - wBefore));
            else S.warlockLeft = Math.min(S.warlockLeft, S.warlockMax);
          } else {
            var before = S.max[l] || 0;
            S.max[l] = Math.max(0, Math.min(9, before + d));
            if (S.max[l] > before) S.left[l] = Math.min(S.max[l], (S.left[l] || 0) + (S.max[l] - before));
            else S.left[l] = Math.min(S.left[l], S.max[l]);
          }
          commit();
          return;
        }
        var down = ev.target.closest('.down');
        if (down) {
          S.selected = Number(down.dataset.lv);
          commit();
          E.spellList.scrollTop = 0;
          return;
        }
        var row = ev.target.closest('.lv');
        if (row && row.dataset.lv !== undefined) {
          S.selected = Number(row.dataset.lv);
          commit();
          E.spellList.scrollTop = 0;
        }
      });

      E.spellList.addEventListener('click', function (ev) {
        if (dragged) { dragged = false; return; }
        var card = ev.target.closest('.card');
        if (card) openSpell(card.dataset.name);
      });

      /* The cards can be dragged to reorder them, the way the feature cards
         are. A press that turns into a move carries the card, a press that
         ends straight away is a tap. */
      E.spellList.addEventListener('pointerdown', function (ev) {
        var card = ev.target.closest('.card');
        if (!card) return;
        var startY = ev.clientY, startX = ev.clientX, timer = null, moved = false;

        function begin() {
          timer = null;
          moved = true;
          card.classList.add('dragging');
          if (navigator.vibrate) navigator.vibrate(12);
        }

        function move(e) {
          if (!moved) {
            if (Math.abs(e.clientY - startY) > 8 || Math.abs(e.clientX - startX) > 8) {
              if (timer) { clearTimeout(timer); timer = null; }
              cleanup();
            }
            return;
          }
          if (e.cancelable) e.preventDefault();
          var cards = Array.prototype.slice.call(E.spellList.querySelectorAll('.card'));
          for (var i = 0; i < cards.length; i++) {
            var r = cards[i].getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2 && cards[i] !== card) {
              E.spellList.insertBefore(card, cards[i]);
              startY = e.clientY;
              dragged = true;
              break;
            }
          }
        }

        function up() {
          if (timer) { clearTimeout(timer); timer = null; }
          if (moved) {
            card.classList.remove('dragging');
            dragged = true;
            setTimeout(function () { dragged = false; }, 80);
            var order = Array.prototype.slice.call(E.spellList.querySelectorAll('.card'))
              .map(function (c) { return c.dataset.name; });
            S.lists[S.selected] = order;
            api.save();
          }
          cleanup();
        }

        function blockScroll(e) { if (moved && e.cancelable) e.preventDefault(); }
        function cleanup() {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          window.removeEventListener('touchmove', blockScroll);
        }

        timer = setTimeout(begin, 320);
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        window.addEventListener('touchmove', blockScroll, { passive: false });
      });
    },

    /* The wrench edits the maximum of the slots. */
    head: function (root, a) {
      api = a;
      S = a.character().spells;
      var b = C.wrenchButton('Edit the slot maximums', function () {
        editing = !editing;
        api.save();
        api.refresh();
      });
      root.appendChild(b);
      E.wrench = b;
    },

    render: function (a) {
      api = a;
      S = a.character().spells;
      if (E.wrench) E.wrench.setAttribute('aria-pressed', editing ? 'true' : 'false');
      renderSpells();
    }
  });

  function bumpSp() {
    E.spValue.classList.remove('bump');
    void E.spValue.offsetWidth;
    E.spValue.classList.add('bump');
  }
})();
