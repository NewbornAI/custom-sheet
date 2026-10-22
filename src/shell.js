/* The shell of the app: the pages that are on, the tabs that carry them,
   the store they share, and the overlay any of them can open. */
(function () {
  'use strict';

  var R = window.Rules;
  var SR = window.SheetRules;
  var STORE = 'dndsheet.state.v3';
  /* The stores of the two first versions, read once and moved into the
     characters. */
  var OLD_STORES = ['volley.state.v1', 'volley.state.v2'];

  /* ---- the registry ---- */

  var PAGES = [];
  var MOUNTED = {};
  var current = '';

  /* A page joins the app by describing itself. */
  function page(spec) {
    if (!spec || !spec.id) throw new Error('a page needs an id');
    if (PAGES.some(function (p) { return p.id === spec.id; })) {
      throw new Error('two pages want the id ' + spec.id);
    }
    spec.order = spec.order === undefined ? PAGES.length : spec.order;
    PAGES.push(spec);
  }

  /* ---- what the build brought with it ---- */

  function readJson(id) {
    try { return JSON.parse(document.getElementById(id).textContent); } catch (e) { return {}; }
  }

  var SURGE = readJson('surge-data');
  var SEEDS = readJson('seed-data');
  var VERSION = (readJson('version-data') || {}).version || '';
  var PRESETS = readJson('character-data').presets || [];

  /* ---- the data on disk ---- */

  /* The book, the library of features and the classes live in files beside
     the page and are read when a page asks for one, so a launch only pays
     for the character. Each has a live shape filled in place, so a page that
     took its reference at load sees the data arrive. */
  var BOOK = { spells: [], seed: [] };
  var FEATURES = { features: [] };
  var CLASSDATA = [];
  var SPELL_BY_NAME = {};
  var FEATURE_BY_KEY = {};
  var LOADING = {};
  var DATA_ERROR = {};

  /* The shell reads a file out of the app when it is there, and a page on
     the web fetches it. Either way the file is read when a page asks. */
  function readFile(file) {
    if (window.DndShell && window.DndShell.read) {
      try {
        var answer = window.DndShell.read(file);
        if (answer && typeof answer.then === 'function') {
          return answer.then(function (text) {
            if (text) return text;
            throw new Error('the app could not read ' + file);
          });
        }
        if (answer) return Promise.resolve(answer);
        return Promise.reject(new Error('the app could not read ' + file));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return fetch(file).then(function (r) {
      if (!r.ok) throw new Error(file + ': ' + r.status);
      return r.text();
    });
  }

  /* An answer from another origin comes through the shell, because the
     page cannot fetch it and the other origin cannot answer it. */
  function readUrl(url) {
    if (window.DndNet && window.DndNet.fetchUrl) {
      try {
        var answer = window.DndNet.fetchUrl(url);
        if (answer && typeof answer.then === 'function') {
          return answer.then(function (text) {
            if (text && text.indexOf('error ') !== 0) return text;
            throw new Error(text || 'no answer');
          });
        }
        if (answer && answer.indexOf('error ') !== 0) return Promise.resolve(answer);
        return Promise.reject(new Error(answer || 'no answer'));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ': ' + r.status);
      return r.text();
    });
  }

  function data(name) {
    if (LOADING[name]) return LOADING[name];
    var file = 'data/' + name + '.json';
    LOADING[name] = readFile(file)
      .then(function (text) { return JSON.parse(text); })
      .then(function (value) {
        if (name === 'spellbook') {
          BOOK.spells = value.spells || [];
          BOOK.seed = value.seed || [];
          BOOK.spells.forEach(function (spell) { SPELL_BY_NAME[spell.name] = spell; });
        } else if (name === 'features') {
          FEATURES.features = value.features || [];
          FEATURES.features.forEach(function (f) { FEATURE_BY_KEY[f.key] = f; });
        } else if (name === 'classes') {
          (value.classes || []).forEach(function (c) { CLASSDATA.push(c); });
        }
        if (current) refresh();
        return true;
      })
      .catch(function (e) {
        DATA_ERROR[name] = String((e && e.message) || e);
        delete LOADING[name];          /* so a later try reads it again */
        if (current) refresh();
        return false;
      });
    return LOADING[name];
  }

  /* ---- the style of a character ---- */

  /* The colours the app can wear. The first has no attribute of its own:
     it is the one the app came with. The three colours of the swatch are
     the ground, the accent and the light. */
  var THEMES = [
    { id: '', label: 'Violet', blurb: 'The colours the app came with', swatch: ['#08070f', '#9b7bff', '#ffc44d'] },
    { id: 'blueRed', label: 'Blue and red', blurb: 'An electric blue, a hot red', swatch: ['#070a14', '#4c8dff', '#ff4b5c'] },
    { id: 'emerald', label: 'Emerald', blurb: 'A deep green, a warm gold', swatch: ['#060f0b', '#34d399', '#ffd166'] },
    { id: 'ember', label: 'Ember', blurb: 'A forge and its coals', swatch: ['#100807', '#ff7a45', '#ffd23f'] },
    { id: 'frost', label: 'Frost', blurb: 'Ice and pale light', swatch: ['#060a12', '#7fd8ff', '#c7a4ff'] },
    { id: 'crimson', label: 'Crimson', blurb: 'Blood and brass', swatch: ['#0d0509', '#ff4d6d', '#ffc44d'] },
    { id: 'verdigris', label: 'Verdigris', blurb: 'Old copper, green patina', swatch: ['#05100f', '#2dd4bf', '#f0b27a'] },
    { id: 'steel', label: 'Steel', blurb: 'Grey iron and a flame', swatch: ['#0a0b0e', '#b8c6e0', '#ff9f43'] }
  ];


  /* The line icons share one dress. */
  function o(body) {
    return '<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + body + '</g>';
  }

  /* The icons the head of the app can carry, all drawn in the same box and
     the same weight. */
  var ICONS = {
    sigil: {
      label: 'Rune',
      blurb: 'The rune the app came with',
      svg: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width=".9" opacity=".55"/>' +
        '<path d="M12 2.2V6M12 18v3.8M2.2 12H6M18 12h3.8" stroke="currentColor" stroke-width=".9" opacity=".35"/>' +
        '<path d="M12 6.4L17.6 12 12 17.6 6.4 12z" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
        '<circle cx="12" cy="12" r="1.7" fill="currentColor"/>'
    },
    guitar: {
      label: 'Guitar',
      blurb: 'Six strings, plugged in',
      svg: '<g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12.9 10.6c-.5-2 .3-3.6 1.7-4.6-1.5-.9-3.4-.6-4.4.8-.7 1-1.4 1.7-2.6 2.1-2.1.7-3.4 2.8-3.1 4.9.4 2.1 2.4 3.6 4.5 3.2 1.6-.2 2.8-1.3 3.3-2.9.4-1.1 1-1.8 2.2-2.1"/>' +
        '<path d="M12.6 12.1 18.4 6.3"/><path d="M17.5 5.2l1.4 1.4 2.3-2.3a1 1 0 0 0-1.4-1.4z"/>' +
        '<path d="M6 14.8l1.9 1.9"/></g>'
    },
    sword: {
      label: 'Sword',
      blurb: 'A blade and its guard',
      svg: o('<path d="M12 2.6 13.7 8v7.2h-3.4V8Z"/><path d="M7.4 16.6h9.2"/><path d="M12 16.6v4.2"/><path d="M10.2 20.8h3.6"/>')
    },
    shield: {
      label: 'Shield',
      blurb: 'A heater shield',
      svg: o('<path d="M12 3.2 19 5.8v5.7c0 5-3.2 8.3-7 9.9-3.8-1.6-7-4.9-7-9.9V5.8Z"/><path d="M8.8 9.6 12 7.6l3.2 2"/>')
    },
    hammer: {
      label: 'Hammer',
      blurb: 'A warhammer',
      svg: o('<path d="M12 21V9.4"/><path d="M7 4.4h10v5H7Z"/><path d="M9.4 4.4v5M14.6 4.4v5"/>')
    },
    bow: {
      label: 'Bow',
      blurb: 'A drawn bow',
      svg: o('<path d="M7 3.6c7 2.6 7 14.2 0 16.8"/><path d="M7 3.6v16.8"/><path d="M7 12h11.4"/><path d="M15.6 9.4 18.6 12l-3 2.6"/><path d="M9.8 10.4 7.6 12l2.2 1.6"/>')
    },
    dagger: {
      label: 'Dagger',
      blurb: 'A short blade',
      svg: o('<path d="M12 3.2 13.2 8.6v4h-2.4v-4Z"/><path d="M8.8 12.8h6.4"/><path d="M12 12.8v4.6"/><path d="M10.4 17.6h3.2"/>')
    },
    flame: {
      label: 'Flame',
      blurb: 'A fire that burns',
      svg: o('<path d="M12 2.8c2.8 3.6 6.4 6.4 6.4 10.8a6.4 6.4 0 0 1-12.8 0c0-3 1.8-4.6 3-6.2.6 1.6 1.2 2.6 2.4 3.2-.6-3.2 0-5.6 1-7.8Z"/><path d="M12 11c1 2 2.4 3.4 2.4 5.4a2.4 2.4 0 0 1-4.8 0c0-1.4.8-2.6 2.4-5.4Z"/>')
    },
    eye: {
      label: 'Eye',
      blurb: 'A watching eye',
      svg: o('<path d="M2.8 12C5.6 7.6 8.6 5.8 12 5.8s6.4 1.8 9.2 6.2c-2.8 4.4-5.8 6.2-9.2 6.2S5.6 16.4 2.8 12Z"/><circle cx="12" cy="12" r="2.6"/>')
    },
    leaf: {
      label: 'Leaf',
      blurb: 'A leaf and its rib',
      svg: o('<path d="M19.6 4.4C9.4 4.2 4.4 10 4.4 15.4c0 3 1.6 4.8 4 4.8 7 0 11.4-6.8 11.2-15.8Z"/><path d="M6.6 18.2c2.4-3.6 5.8-7.6 11-11"/>')
    },
    book: {
      label: 'Book',
      blurb: 'An open book',
      svg: o('<path d="M4.6 4.4c2.4-1 5.2-.7 7.4.6 2.2-1.3 5-1.6 7.4-.6v14.2c-2.4-1-5.2-.7-7.4.6-2.2-1.3-5-1.6-7.4-.6Z"/><path d="M12 5v14.2"/>')
    },
    sun: {
      label: 'Sun',
      blurb: 'A sun and its rays',
      svg: o('<circle cx="12" cy="12" r="3.8"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8"/>')
    },
    fist: {
      label: 'Fist',
      blurb: 'A closed fist',
      svg: o('<path d="M6.4 11.6V9a1.5 1.5 0 0 1 3 0V7a1.5 1.5 0 0 1 3 0v.4a1.5 1.5 0 0 1 3 0v2.4a1.6 1.6 0 0 1 2.8 1v3.8c0 3.4-2.4 5.8-6.1 5.8s-5.7-2.4-5.7-5.8Z"/><path d="M9.4 12.4v2.2M12.4 12.2v2.4"/>')
    },
    skull: {
      label: 'Skull',
      blurb: 'A skull',
      svg: o('<path d="M12 3.4c4.4 0 7.4 3 7.4 6.8 0 2.2-1.2 3.8-2.8 4.8v4H14v-2.2h-1.2V19h-1.6v-2.2H10V19H7.4v-4c-1.6-1-2.8-2.6-2.8-4.8C4.6 6.4 7.6 3.4 12 3.4Z"/><circle cx="9.4" cy="10.2" r="1.7"/><circle cx="14.6" cy="10.2" r="1.7"/><path d="M12 12.4 13 14.2h-2Z"/>')
    }
  };
;

  function themeOf(rec) {
    var wanted = rec && rec.theme;
    return THEMES.filter(function (t) { return t.id === wanted; })[0] || THEMES[0];
  }

  function iconOf(rec) {
    return (rec && rec.icon && ICONS[rec.icon]) ? rec.icon : 'sigil';
  }

  /* The colours and the icon belong to the character being played, so they
     move when the character does. */
  function applyStyle() {
    var rec = state.characters[state.current] || {};
    var theme = themeOf(rec).id;
    if (theme) document.body.setAttribute('data-theme', theme);
    else document.body.removeAttribute('data-theme');
    if (el.sigil) el.sigil.innerHTML = ICONS[iconOf(rec)].svg;
  }

  /* ---- the shared helpers ---- */

  function esc(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* The marked pieces of a spell text: the damage in red, the saving
     throws in blue, and the conditions, which carry the reference. */
  function markup(text) {
    var out = esc(text);
    out = out.replace(/\[\[d:([^\]]*)\]\]/g, '<span class="tdmg">$1</span>');
    out = out.replace(/\[\[s:([^\]]*)\]\]/g, '<span class="tsav">$1</span>');
    out = out.replace(/\[\[c:([^\]]*)\]\]/g, '<span class="tcond" data-cond="$1" title="https://5e.tools/conditionsdiseases.html">$1</span>');
    return out;
  }

  /* One labelled field of a summary. */
  function field(label, value, cls, wide) {
    var text = value ? String(value) : '-';
    return '<span class="f' + (wide ? ' wide' : '') + '"><span class="k">' + esc(label) + '</span>' +
      '<span class="v' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span></span>';
  }

  /* The text of a spell or a feature, in blocks. */
  function renderBlocks(blocks) {
    var html = '';
    (blocks || []).forEach(function (b) {
      if (b.t === 'p') html += '<p>' + markup(b.text) + '</p>';
      else if (b.t === 'h') html += '<h3>' + markup(b.text) + '</h3>';
      else if (b.t === 'list') {
        html += '<ul>' + b.items.map(function (i) { return '<li>' + markup(i) + '</li>'; }).join('') + '</ul>';
      } else if (b.t === 'table') {
        if (b.caption) html += '<div class="tcap">' + esc(b.caption) + '</div>';
        html += '<table>';
        if (b.head && b.head.length) {
          html += '<thead><tr>' + b.head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>';
        }
        html += '<tbody>' + b.rows.map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + markup(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
      }
    });
    return html;
  }

  /* The same class, written two ways on the sheet. */
  var SOURCE_CANON = {
    'izzet': 'Izzet engineer', 'high elf': 'Elf', 'elf': 'Elf', 'hex': 'Hexblade'
  };

  function canonSource(source) {
    var name = String(source || '').trim();
    return SOURCE_CANON[name.toLowerCase()] || name;
  }

  /* The class of the book, and the short name its button carries. */
  var CLASS_SHORT = {
    'Sorcerer': 'Sor', 'Warlock': 'War', 'Wizard': 'Wiz', 'Bard': 'Bar',
    'Cleric': 'Cle', 'Druid': 'Dru', 'Ranger': 'Ran', 'Paladin': 'Pal',
    'Hexblade': 'Hex', 'Izzet engineer': 'Izz', 'Elf': 'Elf', 'elf': 'Elf'
  };

  function classShort(name) {
    return CLASS_SHORT[name] || String(name || '').slice(0, 3);
  }

  /* The class a spell came from, as the app colours it. */
  var SOURCE_CLASS = {
    'sorcerer': 'sorc',
    'wild magic': 'sorc',
    'warlock': 'warlock',
    'hexblade': 'warlock',
    'hex': 'warlock',
    'izzet': 'izzet',
    'izzet engineer': 'izzet',
    'elf': 'elf',
    'high elf': 'elf',
    'bard': 'bard',
    'creation': 'bard'
  };

  function sourceClass(source) {
    return SOURCE_CLASS[String(source || '').trim().toLowerCase()] || '';
  }

  function sourceTag(source) {
    if (!source) return '';
    var name = canonSource(source);
    var cls = sourceClass(name);
    return '<span class="src' + (cls ? ' ' + cls : '') + '">' + esc(name) + '</span>';
  }

  /* A class of the book, by name. */
  function classInfo(name) {
    for (var i = 0; i < CLASSDATA.length; i++) if (CLASSDATA[i].name === name) return CLASSDATA[i];
    return null;
  }

  /* The classes of a character, with what the rules need of each one. */
  function classRows(ch) {
    return ((ch && ch.classes) || []).map(function (k) {
      var info = classInfo(k.name) || {};
      return {
        name: k.name,
        level: Math.max(0, Number(k.level) || 0),
        subclass: k.subclass || '',
        ability: info.ability || '',
        caster: info.caster || ''
      };
    });
  }

  /* The class that carries the most levels, whose ability the app reads for
     the character as a whole. */
  function primaryClass(ch) {
    var best = null;
    classRows(ch).forEach(function (r) {
      if (!r.ability) return;
      if (!best || r.level > best.level) best = r;
    });
    return best;
  }

  function primaryAbility(ch) {
    var p = primaryClass(ch);
    return p ? p.ability : 'cha';
  }

  /* The wrench a page puts in the head of the app. */
  function wrenchButton(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'wrench';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', label);
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
    b.addEventListener('click', onClick);
    return b;
  }

  /* The history of the character: a snapshot before every change a rest
     can take back. */
  function pushSnapshot(api) {
    var ch = api.character().char;
    ch.history.push(SR.snapshot(ch, api.character().spells));
    if (ch.history.length > 60) ch.history.shift();
  }

  /* The sorcery points bump when they move. */
  function bumpSp() {
    var el = document.getElementById('spValue');
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /* Drops a feature of the library into the character being played and
     repaints, the way the agent will. */
  function plugFeature(key) {
    var rec = state.characters[state.current];
    if (!rec || !rec.char || !FEATURE_BY_KEY[key]) return false;
    if (rec.char.features.some(function (f) { return f.key === key; })) return true;
    var f = FEATURE_BY_KEY[key];
    rec.char.features.push({
      key: f.key,
      name: f.name,
      source: f.source || '',
      active: !!f.active,
      recovery: f.recovery || 'passive',
      bind: f.bind || null,
      max: Number(f.uses) || 0,
      left: Number(f.uses) || 0,
      cost: f.cost || '',
      short: f.short === undefined ? null : f.short,
      hidden: !!f.hidden
    });
    save();
    refresh();
    return true;
  }

  var core = {
    R: R,
    SR: SR,
    LEVELS: R.LEVELS,
    WARLOCK_LEVEL: R.WARLOCK_LEVEL,
    ABILITIES: SR.ABILITIES,
    SKILLS: SR.SKILLS,
    surge: SURGE,
    book: BOOK,
    bookByName: SPELL_BY_NAME,
    features: FEATURES,
    featureByKey: FEATURE_BY_KEY,
    seeds: SEEDS,
    data: data,
    dataError: DATA_ERROR,
    version: VERSION,
    readUrl: readUrl,
    plugFeature: plugFeature,
    esc: esc,
    markup: markup,
    field: field,
    renderBlocks: renderBlocks,
    canonSource: canonSource,
    classShort: classShort,
    sourceClass: sourceClass,
    sourceTag: sourceTag,
    wrenchButton: wrenchButton,
    pushSnapshot: pushSnapshot,
    bumpSp: bumpSp,
    themes: THEMES,
    icons: ICONS,
    classData: CLASSDATA,
    classInfo: classInfo,
    classRows: classRows,
    primaryClass: primaryClass,
    primaryAbility: primaryAbility,
    themeOf: themeOf,
    iconOf: iconOf
  };

  /* ---- the store ---- */

  var DEFAULT_PAGES = ['volley', 'spells', 'features'];

  var state = load();

  function load() {
    var saved = readStore();
    if (!saved.characters) saved = migrate(saved);
    var out = { characters: {}, current: '', ui: { pages: null } };
    Object.keys(out).forEach(function (k) {
      if (saved[k] !== undefined && saved[k] !== null) out[k] = saved[k];
    });
    if (!out.ui) out.ui = { pages: null };
    if (out.ui.pages === undefined) out.ui.pages = null;
    if (!out.current || !out.characters[out.current]) {
      out.current = Object.keys(out.characters)[0] || '';
    }
    return out;
  }

  function readStore() {
    var keys = [STORE].concat(OLD_STORES);
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (raw) {
          var saved = JSON.parse(raw) || {};
          if (saved && typeof saved === 'object') return saved;
        }
      } catch (e) {}
    }
    return {};
  }

  /* The two first versions, moved into the characters. The first held the
     slices of the volley and one character, the second held the same three
     slices. */
  function migrate(saved) {
    var out = { characters: {}, current: 'c1', ui: saved.ui || { pages: null } };
    var rec = {};
    if (saved.spells || saved.volley) {
      /* the second version: three slices */
      rec.volley = saved.volley || {};
      rec.spells = saved.spells || {};
      rec.char = saved.char || {};
    } else {
      /* the first version: the slices of the spell tab and the fields of
         the volley, side by side */
      rec.volley = {};
      ['power', 'advantage', 'hex', 'curse', 'elem', 'elemPlus', 'quicken', 'ac'].forEach(function (k) {
        if (saved[k] !== undefined) rec.volley[k] = saved[k];
      });
      rec.spells = saved.spell || {};
      rec.char = saved.char || {};
    }
    out.characters.c1 = rec;
    return out;
  }

  /* Every page seeds the slice it owns, and a character that is new starts
     from nothing. */
  function seedCharacter(rec, fresh) {
    PAGES.forEach(function (p) {
      if (!p.seed) return;
      var key = p.slice || p.id;
      rec[key] = p.seed(rec[key] || {}, !!fresh, rec);
    });
    return rec;
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
  }

  /* ---- the overlay ---- */

  var sheet = (function () {
    var stack = [];
    var term = '';

    function top() { return stack[stack.length - 1]; }

    /* Opening the layer that is already on top replaces it, so a page can
       paint itself again without stacking a copy. */
    function open(layer) {
      var t = top();
      if (t && t.id === layer.id) {
        /* the same layer again replaces the one on top */
        stack[stack.length - 1] = layer;
      } else {
        stack.push(layer);
        if (layer.search) term = '';
      }
      paint();
    }

    function close() {
      var layer = stack.pop();
      if (layer && layer.onClose) layer.onClose();
      if (!stack.length) {
        el.sheet.hidden = true;
        el.sheetMeta.innerHTML = '';
        el.sheetText.innerHTML = '';
        el.sheetList.innerHTML = '';
        return;
      }
      paint();
    }

    function paint() {
      var layer = top();
      if (!layer) { el.sheet.hidden = true; return; }
      el.sheet.hidden = false;
      el.sheetTitle.textContent = layer.title || '';
      el.sheetMeta.className = layer.metaClass || 'sheet-meta';
      el.sheetMeta.innerHTML = layer.meta || '';
      el.sheetText.innerHTML = layer.text || '';
      el.sheetList.innerHTML = typeof layer.list === 'string' ? layer.list : '';
      el.sheetList.hidden = !layer.list;
      el.sheetSearch.hidden = !layer.search;
      if (layer.search) el.sheetSearch.value = term;
      el.grimoireLevel.hidden = !layer.level;
      if (layer.level) {
        el.grimoireLevel.textContent = layer.levelLabel || '';
        el.grimoireLevel.setAttribute('aria-pressed', layer.levelOn ? 'true' : 'false');
      }
      el.sheetActions.innerHTML = '';
      (layer.actions || []).forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button';
        if (a.kind) b.className = a.kind;
        b.textContent = a.label;
        b.addEventListener('click', function () { a.onClick(el.sheet); });
        el.sheetActions.appendChild(b);
      });
      if (layer.onPaint) layer.onPaint(el.sheet);
    }

    function closeAll() {
      while (stack.length) {
        var layer = stack.pop();
        if (layer && layer.onClose) layer.onClose();
      }
      el.sheet.hidden = true;
      el.sheetMeta.innerHTML = '';
      el.sheetText.innerHTML = '';
      el.sheetList.innerHTML = '';
    }

    return {
      open: open,
      close: close,
      closeAll: closeAll,
      top: top,
      search: function () { return term; },
      setSearch: function (v) { term = v; }
    };
  })();

  /* ---- the toast ---- */

  var toastTimer = null;

  function toast(message) {
    el.spentToast.textContent = message;
    el.spentToast.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.spentToast.classList.remove('on'); }, 3000);
  }

  /* ---- the characters ---- */

  function characterList() {
    return Object.keys(state.characters).map(function (id) {
      var rec = state.characters[id] || {};
      var ch = rec.char || {};
      return {
        id: id,
        name: ch.name || 'Unnamed character',
        level: ch.level ? 'level ' + ch.level : '',
        current: id === state.current
      };
    });
  }

  function homeId() {
    var home = PAGES.filter(function (p) { return p.home; })[0];
    return home ? home.id : current;
  }

  /* The list of the characters, top down, and the way to add one. */
  function openCharacters() {
    var list = characterList();
    var html = list.map(function (c) {
      return '<div class="crow" data-id="' + c.id + '">' +
        '<span class="cn">' + esc(c.name) + '</span>' +
        '<span class="cl">' + esc(c.level) + '</span>' +
        (c.current ? '<span class="cm">playing</span>' : '') +
        (list.length > 1
          ? '<button class="cdel" type="button" data-del="' + c.id + '" aria-label="Remove ' + esc(c.name) + '">&times;</button>'
          : '') +
        '</div>';
    }).join('');
    html += '<div class="crow cadd" data-add="1"><span class="cn">Add a character</span>' +
      '<span class="cx">+</span></div>';

    sheet.open({
      id: 'characters',
      title: 'Characters',
      metaClass: 'sheet-meta one',
      meta: '<span>Tap a character to play it.</span>',
      list: html,
      onList: function (ev) {
        var del = ev.target.closest('[data-del]');
        if (del) { openRemoveCharacter(del.dataset.del); return; }
        if (ev.target.closest('[data-add]')) { openNewCharacter(); return; }
        var row = ev.target.closest('.crow[data-id]');
        if (!row) return;
        switchCharacter(row.dataset.id);
      }
    });
  }

  /* The page the shell is on may not belong to the character that comes
     next, so the home of the new one carries. */
  function reshow() {
    var on = enabled().some(function (p) { return p.id === current; });
    show(on ? current : homeId());
  }

  function switchCharacter(id) {
    if (!state.characters[id]) return;
    state.current = id;
    save();
    sheet.closeAll();
    reshow();
  }

  /* A character comes ready-made, or from nothing at all. */
  function openNewCharacter() {
    var html = PRESETS.map(function (p, i) {
      return '<div class="crow" data-preset="' + i + '">' +
        '<span class="cn">' + esc(p.name) + '</span>' +
        '<span class="cl">' + esc(p.blurb || '') + '</span>' +
        '</div>';
    }).join('');
    html += '<div class="crow cadd" data-blank="1"><span class="cn">A character from nothing</span>' +
      '<span class="cx">+</span></div>';
    sheet.open({
      id: 'newcharacter',
      title: 'New character',
      metaClass: 'sheet-meta one',
      meta: '<span>Ready-made, or from nothing at all.</span>',
      list: html,
      onList: function (ev) {
        var row = ev.target.closest('[data-preset]');
        if (row) { addCharacter(fromPreset(PRESETS[Number(row.dataset.preset)])); return; }
        if (ev.target.closest('[data-blank]')) openBlankCharacter();
      }
    });
  }

  /* A ready-made character keeps the pages it wants, so a page can be left
     out of one character without turning it off for the others. */
  function fromPreset(preset) {
    var rec = seedCharacter((preset && preset.rec) || {}, true);
    if (!rec.char.name && preset && preset.name) rec.char.name = preset.name;
    if (!rec.pages && preset && preset.rec && preset.rec.pages) rec.pages = preset.rec.pages.slice();
    return rec;
  }

  function addCharacter(rec) {
    var id = 'c' + Date.now();
    state.characters[id] = rec;
    state.current = id;
    save();
    sheet.closeAll();
    show(homeId());
  }

  function openBlankCharacter() {
    sheet.open({
      id: 'blankcharacter',
      title: 'New character',
      metaClass: 'sheet-meta one',
      meta: '<input class="sheet-search" id="newCharName" type="text" placeholder="Name of the character" aria-label="Name of the character">',
      actions: [{
        label: 'Create',
        onClick: function (root) {
          var field = root.querySelector('#newCharName');
          var name = (field && field.value ? field.value : '').trim() || 'New character';
          var rec = seedCharacter({}, true);
          rec.char.name = name;
          addCharacter(rec);
        }
      }]
    });
  }

  function openRemoveCharacter(id) {
    var c = characterList().filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    sheet.open({
      id: 'remove:' + id,
      title: 'Remove ' + c.name + '?',
      metaClass: 'sheet-meta one',
      meta: '<span>The character and everything on it goes away.</span>',
      actions: [
        { label: 'Keep', onClick: function () { sheet.close(); } },
        { label: 'Remove', kind: 'danger', onClick: function () { removeCharacter(id); } }
      ]
    });
  }

  function removeCharacter(id) {
    var ids = Object.keys(state.characters);
    if (ids.length <= 1) return;
    delete state.characters[id];
    if (state.current === id) {
      state.current = ids.filter(function (x) { return x !== id; })[0];
    }
    save();
    sheet.closeAll();
    reshow();
    openCharacters();
  }

  /* ---- the elements of the shell ---- */

  /* The characters are one tap from the head of the app, beside the wrench,
     so they can be changed from any page. */
  function wireHead() {
    if (el.charBtn) el.charBtn.addEventListener('click', openCharacters);
  }

  var el = {
    sigil: document.getElementById('sigil'),
    pageTitle: document.getElementById('pageTitle'),
    head: document.getElementById('headSlot'),
    tabs: document.getElementById('tabList'),
    gear: document.getElementById('gear'),
    charBtn: document.getElementById('charBtn'),
    views: document.getElementById('views'),
    spentToast: document.getElementById('spentToast'),
    sheet: document.getElementById('sheet'),
    sheetTitle: document.getElementById('sheetTitle'),
    sheetMeta: document.getElementById('sheetMeta'),
    sheetText: document.getElementById('sheetText'),
    sheetList: document.getElementById('sheetList'),
    sheetActions: document.getElementById('sheetActions'),
    sheetSearch: document.getElementById('sheetSearch'),
    sheetClose: document.getElementById('sheetClose'),
    grimoireLevel: document.getElementById('grimoireLevel'),
    condTip: document.getElementById('condTip'),
    condName: document.getElementById('condName'),
    condClose: document.getElementById('condClose')
  };

  /* ---- the tabs ---- */

  /* The pages a character plays with. They sit on the character, so a
     bard can live without the volley page the warlock plays, and a
     character that never chose keeps the pages of the app. */
  function pagesOf() {
    var rec = state.characters[state.current] || {};
    if (rec.pages) return rec.pages;
    if (state.ui.pages) return state.ui.pages;
    return DEFAULT_PAGES;
  }

  function enabled() {
    var on = pagesOf();
    return PAGES.filter(function (p) {
      if (p.hidden) return false;
      if (p.home) return true;
      return on.indexOf(p.id) >= 0;
    }).sort(function (a, b) { return a.order - b.order; });
  }

  /* The label of a tab, which can be shorter than the name of the page, and
     the name of the page itself, which the head of the app carries. */
  function label(p) {
    if (p.tab) return p.tab;
    return titleOf(p);
  }

  function titleOf(p) {
    return typeof p.title === 'function' ? p.title(api) : p.title;
  }

  /* The tabs are only rebuilt when the pages or their names change. */
  var tabsSig = '';

  function renderTabs() {
    var list = enabled();
    var sig = list.map(function (p) { return p.id + ':' + label(p); }).join('|');
    if (sig !== tabsSig) {
      tabsSig = sig;
      el.tabs.innerHTML = '';
      list.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tab';
        b.textContent = label(p);
        b.setAttribute('role', 'tab');
        b.dataset.page = p.id;
        b.setAttribute('aria-selected', p.id === current ? 'true' : 'false');
        b.addEventListener('click', function () { show(p.id); });
        el.tabs.appendChild(b);
      });
    }
    Array.prototype.forEach.call(el.tabs.children, function (b) {
      b.setAttribute('aria-selected', b.dataset.page === current ? 'true' : 'false');
    });
    el.gear.setAttribute('aria-pressed', current === 'settings' ? 'true' : 'false');
  }

  /* A page is mounted the first time it is shown, and stays in the app
     after that, so its state and its scroll place are kept. */
  function show(id) {
    var p = PAGES.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    current = id;

    if (!MOUNTED[id]) {
      var section = document.createElement('section');
      section.className = 'view';
      section.id = 'view-' + id;
      if (p.html) section.innerHTML = p.html;
      el.views.appendChild(section);
      MOUNTED[id] = { spec: p, section: section };
      if (p.mount) p.mount(section, api);
    }

    Object.keys(MOUNTED).forEach(function (k) {
      MOUNTED[k].section.classList.toggle('on', k === id);
    });

    el.head.innerHTML = '';
    if (p.head) p.head(el.head, api);

    renderTabs();
    applyStyle();
    el.pageTitle.textContent = titleOf(p);
    if (p.render) p.render(api);
  }

  function refresh() {
    renderTabs();
    applyStyle();
    var m = MOUNTED[current];
    if (m && m.spec.render) m.spec.render(api);
  }

  /* ---- the interface the pages get ---- */

  var api = {
    state: state,
    save: save,
    refresh: refresh,
    show: show,
    toast: toast,
    sheet: sheet,
    core: core,
    pages: PAGES,
    defaultPages: DEFAULT_PAGES,
    /* the character being played */
    character: function () { return state.characters[state.current] || {}; },
    characters: function () { return state.characters; },
    openCharacters: openCharacters
  };

  /* ---- the wiring of the shell ---- */

  el.gear.addEventListener('click', function () { show('settings'); });
wireHead();
  el.sheetClose.addEventListener('click', function () { sheet.close(); });
  el.sheet.addEventListener('click', function (ev) { if (ev.target === el.sheet) sheet.close(); });
  el.sheetSearch.addEventListener('input', function () {
    sheet.setSearch(el.sheetSearch.value);
    var layer = sheet.top();
    if (layer && layer.onSearch) layer.onSearch(el.sheetSearch.value);
  });
  el.grimoireLevel.addEventListener('click', function () {
    var layer = sheet.top();
    if (layer && layer.onLevel) layer.onLevel();
  });
  el.sheetList.addEventListener('click', function (ev) {
    var layer = sheet.top();
    if (layer && layer.onList) layer.onList(ev);
  });
  /* A condition opens the reference to it. */
  el.sheetText.addEventListener('click', function (ev) {
    var cond = ev.target.closest('.tcond');
    if (!cond) return;
    el.condName.textContent = cond.dataset.cond;
    el.condTip.hidden = false;
  });
  el.condClose.addEventListener('click', function () { el.condTip.hidden = true; });

  /* ---- the boot ---- */

  function boot() {
    /* every page seeds the slice it owns, for every character */
    Object.keys(state.characters).forEach(function (id) {
      seedCharacter(state.characters[id], false);
    });
    save();
    var home = PAGES.filter(function (p) { return p.home; })[0];
    show(home ? home.id : (enabled()[0] || PAGES[0]).id);
  }

  window.Volley = { page: page, core: core, show: show };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
