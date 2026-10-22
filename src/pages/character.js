/* The character page: the abilities, the saving throws, the skills, the hit
   points, the hit dice and the rests. It is the home of the app. */
(function () {
  'use strict';

  var C = Volley.core;
  var SR = C.SR;
  var ABILITIES = C.ABILITIES;
  var SKILLS = C.SKILLS;

  var api = null;   /* the shell gives it at mount */
  var E = {};       /* the elements of the page */
  var CH = {};      /* the character */

  var editingChar = false;
  var noteTimer = null;

  /* One row of the sheet, from a feature of the data. */
  function featureRow(f) {
    return {
      key: f.key,
      name: f.name,
      source: f.source,
      active: !!f.active,
      max: f.uses || 0,
      left: f.uses || 0,
      recovery: f.recovery || 'passive',
      cost: f.cost || '',
      short: null,
      hidden: !!f.hidden
    };
  }

  /* A copy of a row, so two characters never share one. */
  function copyRow(f) {
    return {
      key: f.key,
      name: f.name,
      source: f.source || '',
      active: !!f.active,
      recovery: f.recovery || 'passive',
      bind: f.bind || null,
      max: f.max || 0,
      left: f.left || 0,
      cost: f.cost || '',
      short: (f.short === undefined || f.short === null) ? null : f.short,
      hidden: !!f.hidden
    };
  }

  /* A new character is given the features of the app's own character. The
     ones that belong to a ready-made character say so in the data and wait
     for it. */
  /* The features a fresh character starts with travel in the page; the rest
     of the library is a file the app reads when a page asks for it. */
  var FEATURE_SEED = (C.seeds.features || []).map(featureRow);

  var CHAR_DEFAULTS = {
    name: '',
    level: 11,
    /* The split of the app's own character, a sorcerer 8 with a warlock 3.
       The level of a character is the sum of its classes. */
    classes: [
      { name: 'Sorcerer', level: 8, subclass: 'Wild Magic Sorcery' },
      { name: 'Warlock', level: 3, subclass: 'The Hexblade' }
    ],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 20 },
    saves: { str: 0, dex: 0, con: 1, int: 0, wis: 0, cha: 1 },
    skills: {},
    features: FEATURE_SEED.concat([
      { key: 'warlockSlots', name: 'Warlock spell slots', source: 'Warlock', active: true, recovery: 'short', bind: 'warlock', max: 0, left: 0, short: null, hidden: true }
    ]),
    init: 0,
    ac: null,
    hp: { current: 0, max: 0 },
    dice: [].concat(
      [{ type: 10, spent: false }],
      [{ type: 6, spent: false }, { type: 6, spent: false }, { type: 6, spent: false }, { type: 6, spent: false },
       { type: 6, spent: false }, { type: 6, spent: false }, { type: 6, spent: false }, { type: 6, spent: false }]
    ),
    history: []
  };
  SKILLS.forEach(function (s) { CHAR_DEFAULTS.skills[s.key] = 0; });

  /* Every feature the app knows, by key, so a character can name the ones
     it was given. */
  var FEATURE_BY_KEY = {};
  (C.seeds.features || []).forEach(function (f) { FEATURE_BY_KEY[f.key] = featureRow(f); });
  CHAR_DEFAULTS.features.forEach(function (f) { FEATURE_BY_KEY[f.key] = f; });

  /* A key of the library resolves once the library is in, which is what the
     ready-made characters and the agent read. */
  function rowForKey(key) {
    if (FEATURE_BY_KEY[key]) return copyRow(FEATURE_BY_KEY[key]);
    return C.featureByKey[key] ? featureRow(C.featureByKey[key]) : null;
  }

  function commitChar() { api.save(); api.refresh(); }

  /* A proficiency is a number: 0 none, 1 proficient, 2 expertise. The state
     saved before the three states existed held a boolean, so it comes back
     as a plain proficiency. */
  function profValue(value) {
    if (value === true) return 1;
    if (value === false || value === undefined || value === null) return 0;
    var n = Number(value) || 0;
    if (n < 0) return 0;
    if (n > 2) return 2;
    return Math.floor(n);
  }

  /* ---- the state ---- */

  function seed(saved, fresh) {
    /* The features the character was given. A record that holds its own
       list is the truth, in the order it keeps them, and a list it emptied
       stays empty. One that holds none is built from the names it was made
       with, or from the list of the app's own character, and one that is
       new starts with nothing. */
    var own = (saved && Array.isArray(saved.features)) ? saved.features : null;
    var keys = null;
    if (!own) {
      if (saved && Array.isArray(saved.featureKeys)) keys = saved.featureKeys;
      else if (!fresh) keys = CHAR_DEFAULTS.features.map(function (f) { return f.key; });
    }
    var c = {
      name: '',
      level: CHAR_DEFAULTS.level,
      classes: CHAR_DEFAULTS.classes.map(function (k) {
        return { name: k.name, level: k.level, subclass: k.subclass || '' };
      }),
      abilities: {},
      saves: {},
      skills: {},
      features: own ? [] : (keys || []).map(function (k) {
        return rowForKey(k);
      }).filter(Boolean),
      init: CHAR_DEFAULTS.init,
      ac: CHAR_DEFAULTS.ac,
      hp: { current: 0, max: 0 },
      dice: (CHAR_DEFAULTS.dice || []).map(function (d) { return { type: d.type, spent: false }; }),
      history: []
    };
    ABILITIES.forEach(function (a) {
      c.abilities[a.key] = CHAR_DEFAULTS.abilities[a.key];
      c.saves[a.key] = CHAR_DEFAULTS.saves[a.key];
    });
    SKILLS.forEach(function (s) { c.skills[s.key] = 0; });
    /* A character that is new starts from nothing: no name, no features,
       no dice, and the scores at ten. */
    if (fresh) {
      c.name = '';
      c.level = 1;
      c.classes = [];
      ABILITIES.forEach(function (a) {
        c.abilities[a.key] = 10;
        c.saves[a.key] = 0;
      });
      c.dice = [];
      c.init = 0;
      c.ac = null;
      c.hp = { current: 0, max: 0 };
      c.history = [];
    }
    if (saved && typeof saved === 'object') {
      if (typeof saved.name === 'string') c.name = saved.name;
      if (saved.level) c.level = Math.max(1, Math.min(20, Number(saved.level) || CHAR_DEFAULTS.level));
      if (Array.isArray(saved.classes)) {
        c.classes = saved.classes.filter(function (k) { return k && k.name; }).map(function (k) {
          return {
            name: String(k.name),
            level: Math.max(0, Math.min(20, Number(k.level) || 0)),
            subclass: k.subclass ? String(k.subclass) : ''
          };
        });
      }
      /* The initiative follows the dexterity until the player sets one. */
      if (saved.initTouched) {
        c.init = Number(saved.init) || 0;
        c.initTouched = true;
      }
      if (saved.ac !== undefined && saved.ac !== null && saved.ac !== '') c.ac = Number(saved.ac) || 0;
      ABILITIES.forEach(function (a) {
        if (saved.abilities && saved.abilities[a.key] !== undefined && saved.abilities[a.key] !== null) {
          c.abilities[a.key] = Math.max(0, Math.min(30, Number(saved.abilities[a.key]) || 0));
        }
        if (saved.saves && saved.saves[a.key] !== undefined) c.saves[a.key] = profValue(saved.saves[a.key]);
      });
      SKILLS.forEach(function (s) {
        if (saved.skills && saved.skills[s.key] !== undefined) c.skills[s.key] = profValue(saved.skills[s.key]);
      });
      if (saved.hp) {
        c.hp.current = Math.max(0, Number(saved.hp.current) || 0);
        c.hp.max = Math.max(0, Number(saved.hp.max) || 0);
      }
      if (saved.dice && saved.dice.length) {
        c.dice = saved.dice.map(function (d) { return { type: Number(d.type) || 6, spent: !!d.spent }; });
      }
      if (saved.features && saved.features.length) {
        var savedByKey = {};
        saved.features.forEach(function (f) { savedByKey[f.key] = f; });
        c.features = c.features.map(function (f) {
          var s = savedByKey[f.key];
          if (!s) return f;
          var copy = Object.assign({}, f);
          if (s.name) copy.name = s.name;
          if (s.max !== undefined) copy.max = Math.max(0, Number(s.max) || 0);
          if (s.left !== undefined) copy.left = Math.max(0, Number(s.left) || 0);
          if (s.recovery !== undefined) copy.recovery = s.recovery;
          if (s.cost !== undefined) copy.cost = s.cost;
          if (s.short !== undefined) copy.short = s.short;
          /* the hidden flag follows the data, unless the player moved it */
          copy.hidden = s.toggled ? !!s.hidden : !!f.hidden;
          return copy;
        });
        /* the features that are not in the seed any more */
        saved.features.forEach(function (f) {
          var known = c.features.some(function (x) { return x.key === f.key; });
          if (!known) c.features.push(copyRow(f));
        });
      }
      if (saved.history && saved.history.length) {
        c.history = saved.history.filter(function (h) { return h && typeof h === 'object'; }).slice(-60);
      }
    }
    /* The level of a character is the sum of its classes, when it has any. */
    if (c.classes.length) c.level = Math.max(1, Math.min(20, SR.classLevels(c.classes)));
    return c;
  }

  /* ---- the sheet ---- */

  function buildChar() {
    ABILITIES.forEach(function (a) {
      var col = document.createElement('div');
      col.className = 'abcol';

      var tile = document.createElement('div');
      tile.className = 'ab';
      tile.innerHTML = '<span class="an">' + a.name + '</span>' +
        '<input class="cinput" type="number" inputmode="numeric" min="0" max="30" data-ab="' + a.key + '" aria-label="' + a.long + ' score">' +
        '<span class="am" data-mod="' + a.key + '">+0</span>';
      col.appendChild(tile);

      /* The saving throw rides under the ability it comes from. */
      var save = document.createElement('div');
      save.className = 'prow';
      save.dataset.kind = 'save';
      save.dataset.key = a.key;
      save.innerHTML = '<span class="dot"></span><span class="nm dim">save</span>' +
        '<span class="vl">+0</span>';
      col.appendChild(save);

      E.charAbilities.appendChild(col);
    });

    SKILLS.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'prow';
      row.dataset.kind = 'skill';
      row.dataset.key = s.key;
      row.innerHTML = '<span class="dot"></span><span class="nm">' + s.name + '</span>' +
        '<span class="abk">' + s.ab.toUpperCase() + '</span><span class="vl">+0</span>';
      E.charSkills.appendChild(row);
    });
  }

  function renderChar() {
    E.charBody.classList.toggle('editing', editingChar);
    E.charName.hidden = !editingChar;
    E.charSwitch.hidden = editingChar;
    if (!editingChar) {
      E.charSwitch.innerHTML = '<span>' + C.esc(CH.name || 'Unnamed character') + '</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
        '<path d="M6 9.5l6 6 6-6"/></svg>';
    }

    if (document.activeElement !== E.charName) E.charName.value = CH.name;
    if (document.activeElement !== E.charAc) {
      E.charAc.value = CH.ac === null ? '' : String(CH.ac);
    }
    if (document.activeElement !== E.charInit) E.charInit.value = String(SR.initMod(CH));
    if (document.activeElement !== E.charLevel) E.charLevel.value = String(CH.level);
    if (document.activeElement !== E.charHpNow) {
      E.charHpNow.value = CH.hp.current ? String(CH.hp.current) : '';
    }
    if (document.activeElement !== E.charHpMax) {
      E.charHpMax.value = CH.hp.max ? String(CH.hp.max) : '';
    }
    E.charHpDown.disabled = !CH.hp.current;
    E.charHpUp.disabled = CH.hp.max > 0 && CH.hp.current >= CH.hp.max;
    E.charHpRewind.disabled = !CH.history.length;
    E.charHpRewind.title = CH.history.length
      ? 'Rewind the last change, ' + CH.history.length + ' to go back'
      : 'Nothing to rewind';

    ABILITIES.forEach(function (a) {
      var input = E.charAbilities.querySelector('[data-ab="' + a.key + '"]');
      if (input && document.activeElement !== input) input.value = String(CH.abilities[a.key]);
      var mod = E.charAbilities.querySelector('[data-mod="' + a.key + '"]');
      if (mod) mod.textContent = SR.sign(SR.abilityMod(CH.abilities[a.key]));
    });

    ABILITIES.forEach(function (a) {
      var row = E.charAbilities.querySelector('[data-kind="save"][data-key="' + a.key + '"]');
      if (!row) return;
      var v = Number(CH.saves[a.key]) || 0;
      row.classList.toggle('prof', v === 1);
      row.classList.toggle('exp', v === 2);
      row.querySelector('.vl').textContent = SR.sign(SR.saveMod(CH, a.key));
      row.title = a.long + ' saving throw, ' + SR.profLabel(v);
    });

    SKILLS.forEach(function (s) {
      var row = E.charSkills.querySelector('[data-key="' + s.key + '"]');
      if (!row) return;
      var v = Number(CH.skills[s.key]) || 0;
      row.classList.toggle('prof', v === 1);
      row.classList.toggle('exp', v === 2);
      row.querySelector('.vl').textContent = SR.sign(SR.skillMod(CH, s.key));
      row.title = s.name + ', ' + SR.profLabel(v);
    });

    /* The ability the character casts with is the one of the class that
       carries the most levels. */
    var ability = C.primaryAbility(CH);
    E.charDerived.innerHTML =
      '<span>proficiency <b>' + SR.sign(SR.profBonus(CH.level)) + '</b></span>' +
      '<span>spell attack <b>' + SR.sign(SR.spellAttack(CH, ability)) + '</b></span>' +
      '<span>save DC <b>' + SR.spellDC(CH, ability) + '</b></span>' +
      '<span>passive perception <b>' + (10 + SR.skillMod(CH, 'perception')) + '</b></span>';

    var rows = C.classRows(CH);
    E.charLevel.disabled = rows.length > 0;
    if (rows.length && document.activeElement !== E.charLevel) E.charLevel.value = String(SR.classLevels(rows));
    E.charClassSum.hidden = !rows.length;
    E.charClassSum.textContent = rows.map(function (r) {
      return r.name + ' ' + r.level + (r.subclass ? ', ' + r.subclass : '');
    }).join(' · ');

    renderDice();
    if (editingChar) {
      buildClasses();
      buildStyle();
    }
  }

  /* ---- the classes ---- */

  function classes() {
    var ch = api.character().char;
    if (!Array.isArray(ch.classes)) ch.classes = [];
    return ch.classes;
  }

  /* The level of the character is the sum of its classes. */
  function syncLevel() {
    var ch = api.character().char;
    ch.level = Math.max(1, Math.min(20, SR.classLevels(ch.classes || [])));
  }

  function openClassPicker(index, onPick) {
    var list = C.classData.map(function (c) {
      var what = c.caster === 'full' ? 'full caster' : (c.caster === 'pact' ? 'pact magic' : ((c.caster === 'half' || c.caster === 'artificer') ? 'half caster' : 'no spellcasting'));
      return '<div class="crow" data-c="' + C.esc(c.name) + '"><span class="cn">' + C.esc(c.name) + '</span>' +
        '<span class="cl">' + C.esc(what + (c.ability ? ', ' + c.ability.toUpperCase() : '')) + '</span></div>';
    }).join('');
    api.sheet.open({
      id: 'pickclass',
      title: index >= 0 ? 'The class' : 'A class to add',
      metaClass: 'sheet-meta one',
      meta: '<span>Tap a class.</span>',
      list: list,
      onList: function (ev) {
        var row = ev.target.closest('[data-c]');
        if (!row) return;
        onPick(row.dataset.c);
        api.sheet.close();
      }
    });
  }

  function openSubclassPicker(index) {
    var row = classes()[index];
    if (!row) return;
    var info = C.classInfo(row.name);
    var list = ((info && info.subclasses) || []).map(function (s) {
      return '<div class="crow" data-s="' + C.esc(s.name) + '"><span class="cn">' + C.esc(s.name) + '</span>' +
        '<span class="cl">' + C.esc(s.source) + '</span></div>';
    }).join('') + '<div class="crow" data-s=""><span class="cn">No subclass</span></div>';
    api.sheet.open({
      id: 'picksub',
      title: info ? info.name : 'The subclass',
      metaClass: 'sheet-meta one',
      meta: '<span>' + C.esc((info && info.subclassTitle) || 'Tap the subclass.') + '</span>',
      list: list,
      onList: function (ev) {
        var picked = ev.target.closest('[data-s]');
        if (!picked) return;
        classes()[index].subclass = picked.dataset.s;
        api.sheet.close();
        commitChar();
      }
    });
  }

  function buildClasses() {
    if (!E.charClasses) return;
    var list = classes();
    E.charClasses.innerHTML = '';
    if (!list.length) {
      var none = document.createElement('p');
      none.className = 'note';
      none.textContent = 'No class yet. The plus adds one.';
      E.charClasses.appendChild(none);
    }
    list.forEach(function (k, ix) {
      var info = C.classInfo(k.name) || {};
      var what = info.caster === 'full' ? 'full caster' : (info.caster === 'pact' ? 'pact magic' : ((info.caster === 'half' || info.caster === 'artificer') ? 'half caster' : 'no spellcasting'));
      var row = document.createElement('div');
      row.className = 'srow clrow';
      row.dataset.ix = String(ix);
      row.innerHTML =
        '<span class="t"><button class="clname" type="button" data-pick="name">' + C.esc(k.name || 'A class') + '</button>' +
        '<button class="clsub" type="button" data-pick="sub">' + C.esc(k.subclass || 'no subclass') + '</button></span>' +
        '<span class="d">' + C.esc(what + (info.ability ? ', ' + info.ability.toUpperCase() : '')) + '</span>' +
        '<button class="mini" type="button" data-lv="-">&minus;</button>' +
        '<span class="clvl">' + k.level + '</span>' +
        '<button class="mini" type="button" data-lv="+">+</button>' +
        '<button class="cdel" type="button" data-del="1">&times;</button>';
      E.charClasses.appendChild(row);
    });
  }

  /* ---- the style of the character ---- */

  /* The colours and the icon are the character's own, and they are set
     here, in the edit mode, so a stray tap never repaints the app at the
     table. The gallery shows every one of them at once. */
  function buildStyle() {
    if (!E.charThemes) return;
    var rec = api.character();
    E.charThemes.innerHTML = '';
    E.charIcons.innerHTML = '';

    C.themes.forEach(function (t) {
      var on = (rec.theme || '') === t.id;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gcell' + (on ? ' on' : '');
      b.dataset.theme = t.id;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', t.label + ', ' + t.blurb + (on ? ', on' : ''));
      b.innerHTML = '<span class="gprev" style="background:' + t.swatch[0] + ';border-color:' + t.swatch[1] + '">' +
        '<i style="background:' + t.swatch[1] + '"></i><i style="background:' + t.swatch[2] + '"></i></span>' +
        '<span class="gname">' + C.esc(t.label) + '</span>';
      b.addEventListener('click', function () {
        if ((rec.theme || '') === t.id) return;
        rec.theme = t.id;
        commitChar();
      });
      E.charThemes.appendChild(b);
    });

    Object.keys(C.icons).forEach(function (key) {
      var on = C.iconOf(rec) === key;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gcell' + (on ? ' on' : '');
      b.dataset.icon = key;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', C.icons[key].label + ', ' + C.icons[key].blurb + (on ? ', on' : ''));
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + C.icons[key].svg + '</svg>';
      b.addEventListener('click', function () {
        if (C.iconOf(rec) === key) return;
        rec.icon = key;
        commitChar();
      });
      E.charIcons.appendChild(b);
    });
  }

  /* ---- the hit dice ---- */

  function dieSvg(type) {
    var pts = SR.DIE_SHAPES[type];
    if (!pts) {
      var built = [], i, a;
      for (i = 0; i < type; i++) {
        a = -Math.PI / 2 + i * 2 * Math.PI / type;
        built.push((12 + 9.2 * Math.cos(a)).toFixed(2) + ',' + (12 + 9.2 * Math.sin(a)).toFixed(2));
      }
      pts = built.join(' ');
    }
    var label = SR.DIE_LABEL[type] || { y: 15.4, size: 9 };
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<polygon points="' + pts + '" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<text x="12" y="' + label.y + '" text-anchor="middle" font-size="' + label.size + '" fill="currentColor" ' +
      'font-family="Cinzel, Georgia, serif">' + type + '</text></svg>';
  }

  function countDice(type) {
    var n = 0;
    (CH.dice || []).forEach(function (d) { if (d.type === type) n++; });
    return n;
  }

  function renderDice() {
    E.diceBox.innerHTML = '';

    if (editingChar) {
      var grid = document.createElement('div');
      grid.className = 'diceedit';
      [12, 10, 8, 6].forEach(function (t) {
        var row = document.createElement('div');
        row.className = 'drow';
        row.innerHTML = '<span class="dico">' + dieSvg(t) + '</span>' +
          '<span class="dty">d' + t + '</span>' +
          '<button class="mini" type="button" data-type="' + t + '" data-sign="-">&minus;</button>' +
          '<span class="dval">' + countDice(t) + '</span>' +
          '<button class="mini" type="button" data-type="' + t + '" data-sign="+">+</button>';
        grid.appendChild(row);
      });
      E.diceBox.appendChild(grid);
      return;
    }

    var dice = (CH.dice || []).map(function (d, ix) { return { d: d, ix: ix }; });
    dice.sort(function (a, b) { return b.d.type - a.d.type; });
    if (!dice.length) {
      var none = document.createElement('span');
      none.className = 'dnote';
      none.textContent = 'No hit dice yet. The wrench sets them.';
      E.diceBox.appendChild(none);
      return;
    }
    dice.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'die' + (item.d.spent ? ' spent' : '');
      b.innerHTML = dieSvg(item.d.type);
      b.dataset.ix = String(item.ix);
      b.setAttribute('aria-label', 'd' + item.d.type + (item.d.spent ? ', spent' : ', left'));
      E.diceBox.appendChild(b);
    });
  }

  /* ---- the rests ---- */

  function pushSnapshot() {
    CH.history.push(SR.snapshot(CH, api.character().spells));
    if (CH.history.length > 60) CH.history.shift();
  }

  function setHp(next) {
    if (next === CH.hp.current) return;
    pushSnapshot();
    CH.hp.current = next;
    commitChar();
  }

  function applyRest(result) {
    CH.hp.current = result.hp;
    CH.hp.max = result.hpmax;
    if (result.dice) CH.dice = result.dice;
    CH.features = result.features;
    var S = api.character().spells;
    S.left = result.left;
    S.warlockLeft = result.warlockLeft;
    S.sp = result.sp;
    S.cunning = result.cunning;
    S.sorcRest = result.sorcRest;
  }

  function slotsDiffer(a, b) {
    var keys = {}, k;
    for (k in (a || {})) keys[k] = 1;
    for (k in (b || {})) keys[k] = 1;
    for (k in keys) if ((a[k] || 0) !== (b[k] || 0)) return true;
    return false;
  }

  function doRest(kind) {
    var before = SR.snapshot(CH, api.character().spells);
    var after = kind === 'long' ? SR.longRest(CH, api.character().spells) : SR.shortRest(CH, api.character().spells);
    CH.history.push(before);
    if (CH.history.length > 60) CH.history.shift();
    applyRest(after);
    commitChar();
    note(restNote(kind, before, after));
    if (navigator.vibrate) navigator.vibrate([14, 40, 14]);
  }

  /* What the rest actually gave back, so the note says it. */
  function restNote(kind, before, after) {
    var names = [];
    (after.features || []).forEach(function (f, i) {
      var b = (before.features || [])[i];
      if (b && f.left > b.left) names.push(f.name);
    });
    if (after.warlockLeft > before.warlockLeft && names.indexOf('Warlock spell slots') < 0) {
      names.push('Warlock spell slots');
    }
    if (kind === 'long') {
      var bits = [];
      if (after.hp !== before.hp) bits.push('hit points');
      if (slotsDiffer(after.left, before.left) || after.warlockLeft !== before.warlockLeft) bits.push('spell slots');
      if (after.sp !== before.sp) bits.push('sorcery points');
      if (names.length) bits.push(names.join(' and '));
      return 'Long rest' + (bits.length ? ': ' + bits.join(', ') + ' back.' : ': nothing to give back.');
    }
    return 'Short rest' + (names.length ? ': ' + names.join(' and ') + ' back.' : ': nothing to give back yet.');
  }

  function note(message) {
    E.charNote.textContent = message;
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { E.charNote.textContent = ''; }, 2600);
  }

  /* ---- the page ---- */

  Volley.page({
    id: 'character',
    title: function (a) {
      var c = a.character().char || {};
      return c.name || 'Character';
    },
    tab: 'Character',
    home: true,
    order: 0,
    slice: 'char',
    blurb: 'The sheet of the character. It is always there.',
    html: [
      '<div class="charbody" id="charBody">',
      '  <div class="csname" id="charNameWrap">',
      '    <span class="ck">NAME</span>',
      '    <input class="cinput" id="charName" type="text" placeholder="your character" aria-label="Character name">',
      '    <button class="cname-btn" id="charSwitch" type="button" aria-label="The characters"></button>',
      '  </div>',
      '  <div class="clsum" id="charClassSum"></div>',
      '  <div class="ctop">',
      '    <label class="ctile" for="charAc">',
      '      <span class="ck">AC</span>',
      '      <input class="cinput" id="charAc" type="number" inputmode="numeric" min="0" max="40" placeholder="--" aria-label="Armor class">',
      '    </label>',
      '    <label class="ctile" for="charInit">',
      '      <span class="ck">INIT</span>',
      '      <input class="cinput" id="charInit" type="number" inputmode="numeric" min="-9" max="20" placeholder="0" aria-label="Initiative modifier">',
      '    </label>',
      '    <label class="ctile" for="charLevel">',
      '      <span class="ck">LEVEL</span>',
      '      <input class="cinput" id="charLevel" type="number" inputmode="numeric" min="1" max="20" placeholder="1" aria-label="Character level">',
      '    </label>',
      '  </div>',
      '  <div class="hpstrip">',
      '    <span class="ck">HP</span>',
      '    <input class="cinput cur" id="charHpNow" type="number" inputmode="numeric" min="0" placeholder="--" aria-label="Current hit points">',
      '    <span class="of">/</span>',
      '    <input class="cinput max" id="charHpMax" type="number" inputmode="numeric" min="0" placeholder="--" aria-label="Maximum hit points">',
      '    <span class="tools">',
      '      <button class="mini" id="charHpDown" type="button" aria-label="Lose a hit point">&minus;</button>',
      '      <button class="mini" id="charHpUp" type="button" aria-label="Gain a hit point">+</button>',
      '      <button class="mini" id="charHpRewind" type="button" aria-label="Rewind the last change">',
      '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">',
      '          <path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3"/><path d="M3.5 4.4v5.2h5.2"/>',
      '        </svg>',
      '      </button>',
      '    </span>',
      '  </div>',
      '  <div class="dicebox" id="diceBox"></div>',
      '  <div class="cshead"><span>Abilities</span><span class="rule"></span></div>',
      '  <div class="abgrid" id="charAbilities"></div>',
      '  <div class="derived" id="charDerived"></div>',
      '  <div class="cshead"><span>Skills</span><span class="rule"></span></div>',
      '  <div class="sgrid" id="charSkills"></div>',
      '  <div class="charstyle" id="charStyle">',
      '    <div class="cshead"><span>Classes</span><span class="rule"></span><button class="mini" id="addClass" type="button" aria-label="Add a class">+</button></div>',
      '    <div class="fcards" id="charClasses"></div>',
      '    <div class="cshead"><span>Colours</span><span class="rule"></span></div>',
      '    <div class="gal" id="charThemes"></div>',
      '    <div class="cshead"><span>Icon</span><span class="rule"></span></div>',
      '    <div class="gal icons" id="charIcons"></div>',
      '  </div>',
      '</div>',
      '<div class="charfoot">',
      '  <p class="note" id="charNote"></p>',
      '  <div class="rests">',
      '    <button class="rest" id="restShort" type="button">Short rest</button>',
      '    <button class="rest" id="restLong" type="button">Long rest</button>',
      '  </div>',
      '</div>'
    ].join('\n'),

    seed: seed,

    mount: function (root, a) {
    a.core.data('classes');
      api = a;
      CH = a.character().char;
      E = {
        charBody: root.querySelector('#charBody'),
        charNameWrap: root.querySelector('#charNameWrap'),
        charName: root.querySelector('#charName'),
        charSwitch: root.querySelector('#charSwitch'),
        charAc: root.querySelector('#charAc'),
        charInit: root.querySelector('#charInit'),
        charLevel: root.querySelector('#charLevel'),
        charHpNow: root.querySelector('#charHpNow'),
        charHpMax: root.querySelector('#charHpMax'),
        charHpDown: root.querySelector('#charHpDown'),
        charHpUp: root.querySelector('#charHpUp'),
        charHpRewind: root.querySelector('#charHpRewind'),
        diceBox: root.querySelector('#diceBox'),
        charAbilities: root.querySelector('#charAbilities'),
        charDerived: root.querySelector('#charDerived'),
        charSkills: root.querySelector('#charSkills'),
        charClassSum: root.querySelector('#charClassSum'),
        charClasses: root.querySelector('#charClasses'),
        addClass: root.querySelector('#addClass'),
        charThemes: root.querySelector('#charThemes'),
        charIcons: root.querySelector('#charIcons'),
        charNote: root.querySelector('#charNote'),
        restShort: root.querySelector('#restShort'),
        restLong: root.querySelector('#restLong')
      };

      buildChar();

      E.charName.addEventListener('input', function () {
        CH.name = E.charName.value;
        commitChar();
      });

      /* The name opens the list of the characters. */
      E.charSwitch.addEventListener('click', function () { api.openCharacters(); });

      /* The classes are set in the section the wrench opens. */
      E.charClasses.addEventListener('click', function (ev) {
        var row = ev.target.closest('.clrow');
        if (!row) return;
        var ix = Number(row.dataset.ix);
        var pick = ev.target.closest('[data-pick]');
        if (pick) {
          if (pick.dataset.pick === 'name') {
            openClassPicker(ix, function (name) {
              classes()[ix].name = name;
              classes()[ix].subclass = '';
              syncLevel();
              commitChar();
            });
          } else {
            openSubclassPicker(ix);
          }
          return;
        }
        if (ev.target.closest('[data-del]')) {
          classes().splice(ix, 1);
          syncLevel();
          commitChar();
          return;
        }
        var step = ev.target.closest('[data-lv]');
        if (step) {
          var k = classes()[ix];
          k.level = Math.max(0, Math.min(20, k.level + (step.dataset.lv === '+' ? 1 : -1)));
          syncLevel();
          commitChar();
        }
      });

      E.addClass.addEventListener('click', function () {
        openClassPicker(-1, function (name) {
          classes().push({ name: name, level: 1, subclass: '' });
          syncLevel();
          commitChar();
        });
      });

      E.charAc.addEventListener('input', function () {
        var v = E.charAc.value.trim();
        CH.ac = v === '' ? null : Number(v);
        commitChar();
      });

      E.charInit.addEventListener('input', function () {
        var v = E.charInit.value.trim();
        CH.init = v === '' ? 0 : Number(v);
        CH.initTouched = true;
        commitChar();
      });

      E.charLevel.addEventListener('input', function () {
        var v = Number(E.charLevel.value);
        CH.level = Math.max(1, Math.min(20, isFinite(v) && v ? v : 1));
        commitChar();
      });

      E.charAbilities.addEventListener('input', function (ev) {
        var input = ev.target.closest('[data-ab]');
        if (!input) return;
        var v = input.value.trim();
        CH.abilities[input.dataset.ab] = v === '' ? 10 : Math.max(0, Math.min(30, Number(v) || 0));
        commitChar();
      });

      /* The field follows the typing, and the value it had when the field
         was opened goes to the history when the player is done with it, so
         the rewind takes back a whole typed change and not one keystroke. */
      var hpBefore = null;

      E.charHpNow.addEventListener('focus', function () {
        hpBefore = SR.snapshot(CH, api.character().spells);
      });

      E.charHpNow.addEventListener('input', function () {
        var v = E.charHpNow.value.trim();
        CH.hp.current = SR.hpApply(v === '' ? 0 : Number(v) || 0, CH.hp.max, 0);
        commitChar();
      });

      E.charHpNow.addEventListener('change', function () {
        if (hpBefore && hpBefore.hp !== CH.hp.current) {
          CH.history.push(hpBefore);
          if (CH.history.length > 60) CH.history.shift();
        }
        hpBefore = null;
        commitChar();
      });

      E.charHpMax.addEventListener('input', function () {
        var v = E.charHpMax.value.trim();
        var max = v === '' ? 0 : Math.max(0, Number(v) || 0);
        CH.hp.max = max;
        if (max > 0 && CH.hp.current > max) CH.hp.current = max;
        commitChar();
      });

      E.charHpUp.addEventListener('click', function () {
        setHp(SR.hpApply(CH.hp.current, CH.hp.max, 1));
      });

      E.charHpDown.addEventListener('click', function () {
        setHp(SR.hpApply(CH.hp.current, CH.hp.max, -1));
      });

      E.charHpRewind.addEventListener('click', function () {
        var r = SR.rewind(CH.history);
        if (!r.current) return;
        CH.history = r.history;
        applyRest(r.current);
        commitChar();
        note('Rewound to before the last change.');
      });

      E.diceBox.addEventListener('click', function (ev) {
        var pick = ev.target.closest('[data-type][data-sign]');
        if (pick) {
          var type = Number(pick.dataset.type);
          var add = pick.dataset.sign === '+';
          var dice = CH.dice || (CH.dice = []);
          if (add) {
            dice.push({ type: type, spent: false });
          } else {
            for (var i = dice.length - 1; i >= 0; i--) {
              if (dice[i].type === type) { dice.splice(i, 1); break; }
            }
          }
          pushSnapshot();
          commitChar();
          return;
        }
        var die = ev.target.closest('.die');
        if (!die) return;
        var d = (CH.dice || [])[Number(die.dataset.ix)];
        if (!d) return;
        pushSnapshot();
        d.spent = !d.spent;
        commitChar();
      });

      /* The proficiencies only move in the edit mode, so a stray tap at the
         table never changes a modifier. */
      E.charBody.addEventListener('click', function (ev) {
        if (!editingChar) return;
        var row = ev.target.closest('.prow');
        if (!row) return;
        if (row.dataset.kind === 'save') CH.saves[row.dataset.key] = SR.nextProf(CH.saves[row.dataset.key]);
        else if (row.dataset.kind === 'skill') CH.skills[row.dataset.key] = SR.nextProf(CH.skills[row.dataset.key]);
        else return;
        commitChar();
      });

      E.restShort.addEventListener('click', function () { doRest('short'); });
      E.restLong.addEventListener('click', function () { doRest('long'); });
    },

    /* The wrench edits the proficiencies. */
    head: function (root, a) {
      api = a;
      CH = a.character().char;
      var b = C.wrenchButton('Edit the proficiencies', function () {
        editingChar = !editingChar;
        api.save();
        api.refresh();
      });
      root.appendChild(b);
      E.wrench = b;
    },

    render: function (a) {
      api = a;
      CH = a.character().char;
      if (E.wrench) E.wrench.setAttribute('aria-pressed', editingChar ? 'true' : 'false');
      renderChar();
    }
  });
})();
