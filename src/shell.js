/* The shell of the app: the pages that are on, the tabs that carry them,
   the store they share, and the overlay any of them can open. */
(function () {
  'use strict';

  var R = window.Rules;
  var SR = window.SheetRules;
  var STORE = 'customsheet.state.v3';
  /* The stores of the first names, read once and moved on. The first held the
     slices of the volley and one character, the second held the same three
     slices, and the third is this one under the name the app had before. */
  var OLD_STORES = ['dndsheet.state.v3', 'volley.state.v1', 'volley.state.v2'];

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
    if (spec.css) styleFor(spec);
  }

  /* The style of a page lives in a tag of its own, so a page that comes in a
     package carries its own with it. */
  function styleFor(spec) {
    var el = document.getElementById('style-' + spec.id);
    if (!el) {
      el = document.createElement('style');
      el.id = 'style-' + spec.id;
      document.head.appendChild(el);
    }
    el.textContent = spec.css || '';
  }

  /* An address goes to the browser of the phone, so a sign in can be
     approved there while the app waits at home. A page of a browser opens
     it in a new tab. */
  function openUrl(url) {
    if (window.SheetNet && window.SheetNet.openUrl) {
      try {
        return window.SheetNet.openUrl(url);
      } catch (e) {
        return 'error ' + String((e && e.message) || e);
      }
    }
    window.open(url, '_blank');
    return 'ok';
  }

  /* ---- what the build brought with it ---- */

  function readJson(id) {
    try { return JSON.parse(document.getElementById(id).textContent); } catch (e) { return {}; }
  }

  var SURGE = readJson('surge-data');
  var SEEDS = readJson('seed-data');
  var VERSION = (readJson('version-data') || {}).version || '';

  /* ---- the data on disk ---- */

  /* The book, the library of features and the classes live in files beside
     the page and are read when a page asks for one, so a launch only pays
     for the character. Each has a live shape filled in place, so a page that
     took its reference at load sees the data arrive. */
  var BOOK = { spells: [], seed: [] };
  var FEATURES = { features: [] };
  var CLASSDATA = [];
  var BESTIARY = { creatures: {} };
  var SPELL_BY_NAME = {};
  var FEATURE_BY_KEY = {};
  var LOADING = {};
  var DATA_ERROR = {};

  /* The bridge of the phone, whichever side answers. The app adds it under
     two names, so a call asks the one that holds it rather than the one that
     was hoped for. */
  function phone(name) {
    if (window.SheetShell && typeof window.SheetShell[name] === 'function') return window.SheetShell;
    if (window.SheetNet && typeof window.SheetNet[name] === 'function') return window.SheetNet;
    return null;
  }

  /* The shell reads a file out of the app when it is there, and a page on
     the web fetches it. Either way the file is read when a page asks. */
  function readFile(file) {
    var shell = phone('read');
    if (shell) {
      try {
        var answer = shell.read(file);
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
    if (window.SheetNet && window.SheetNet.fetchUrl) {
      try {
        var answer = window.SheetNet.fetchUrl(url);
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

  /* The app updates itself: the shell fetches the new build and hands it
     to the installer of the phone. A page on the web has no shell, so it
     opens the build in the browser instead. */
  function installUpdate(url) {
    if (window.SheetNet && window.SheetNet.download && window.SheetNet.install) {
      try {
        var answer = window.SheetNet.download(url);
        if (answer && typeof answer.then === 'function') {
          return answer.then(function (text) {
            if (!text || text.indexOf('error ') === 0) return text;
            return window.SheetNet.install();
          });
        }
        if (!answer || answer.indexOf('error ') === 0) return Promise.resolve(answer);
        return Promise.resolve(window.SheetNet.install());
      } catch (e) {
        return Promise.reject(e);
      }
    }
    window.open(url, '_blank');
    return Promise.resolve('the browser has it');
  }

  /* The address of the machine that serves the app. The update route asks
     it for a newer build, and the summons tab asks it for the creatures the
     app does not carry. */
  function server() {
    var ui = state.ui || {};
    return ui.server || 'http://192.168.0.125:8123';
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
        } else if (name === 'bestiary') {
          BESTIARY.creatures = value.creatures || {};
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
  /* A button of the head of the app: an icon, a label for the screen reader
     and one action. The wrench and the push are the same button. */
  function headButton(label, icon, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'wrench';
    b.setAttribute('aria-label', label);
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + '</svg>';
    b.addEventListener('click', onClick);
    return b;
  }

  function wrenchButton(label, onClick) {
    var b = headButton(label, '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>', onClick);
    b.setAttribute('aria-pressed', 'false');
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
    bestiary: BESTIARY,
    server: server,
    seeds: SEEDS,
    data: data,
    dataError: DATA_ERROR,
    version: VERSION,
    readUrl: readUrl,
    exportCharacter: exportCharacter,
    isPhone: isPhone,
    importPackage: importPackage,
    packageName: packageName,
    openPasteLink: openPasteLink,
    openIntake: openIntake,
    openCharacters: openCharacters,
    importUrl: importUrl,
    importAny: importAny,
    importLink: importLink,
    linkOf: linkOf,
    shareLink: shareLink,
    packageOf: packageOf,
    shelfRepo: shelfRepo,
    shelfCharacters: shelfCharacters,
    shelfBranches: shelfBranches,
    shelfWrite: shelfWrite,
    pushToShelf: pushToShelf,
    shelfRemove: shelfRemove,
    shelfBranch: shelfBranch,
    shelfCreateRepo: shelfCreateRepo,
    shelfFork: shelfFork,
    ghToken: ghToken,
    ghTokenNow: ghTokenNow,
    ghBegin: ghBegin,
    ghWait: ghWait,
    ghPending: ghPending,
    ghSetSession: ghSetSession,
    ghSetToken: ghSetToken,
    ghLogin: ghLogin,
    ghSetLogin: ghSetLogin,
    ghBranch: ghBranch,
    ghSetBranch: ghSetBranch,
    pickFile: pickFile,
    toast: toast,
    installUpdate: installUpdate,
    openUrl: openUrl,
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
    headButton: headButton,
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

  var DEFAULT_PAGES = ['volley', 'spells', 'features', 'summons'];

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
    var out = { characters: {}, current: '', ui: saved.ui || { pages: null } };
    /* Nothing at all was ever saved, so there is no character to carry and
       the app opens on the ways in. */
    if (!saved.spells && !saved.volley && !saved.char) return out;
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
    out.current = 'c1';
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

  /* The list of the characters, top down, and the way to add one. A device
     that holds none opens on the ways in, which is the same list. */
  function openCharacters() {
    var list = characterList();
    if (!list.length) { openIntake(); return; }
    var html = list.map(function (c) {
      return '<div class="crow" data-id="' + c.id + '">' +
        '<span class="cn">' + esc(c.name) + '</span>' +
        '<span class="cl">' + esc(c.level) + '</span>' +
        (c.current ? '<span class="cm">playing</span>' : '') +
        '<button class="cdel" type="button" data-del="' + c.id + '" aria-label="Remove ' + esc(c.name) + '">&times;</button>' +
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
        if (ev.target.closest('[data-add]')) { openIntake(); return; }
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
    registerPluginPages(state.characters[id]);
    save();
    sheet.closeAll();
    reshow();
  }

  /* The ways a character gets into the app. One list with two callers: the
     switcher when it holds nothing, and its add row. A page that owns a way
     in puts it here, so no flow is written twice. */
  function intakes() {
    var list = [
      {
        id: 'class',
        label: 'A character from a class',
        blurb: 'The class brings its features, its saves and its dice',
        run: function () {
          /* The class and the library have to be there before a skeleton can
             be built out of them. */
          data('classes').then(function (ok) {
            return ok ? data('features') : false;
          }).then(function (ok) {
            if (ok) openClassChooser();
          });
        }
      },
      {
        id: 'blank',
        label: 'A character from nothing',
        blurb: 'An empty sheet you fill yourself',
        run: openBlankCharacter
      },
      {
        id: 'file',
        label: 'From a file',
        blurb: 'A package someone sent you',
        run: function () { pickFile(); }
      },
      {
        id: 'link',
        label: 'From a link',
        blurb: 'A link that carries the character',
        run: openPasteLink
      }
    ];
    return list;
  }

  function intakeRows() {
    return intakes().map(function (a) {
      return '<div class="crow cadd" data-intake="' + a.id + '">' +
        '<span class="cn">' + esc(a.label) + '</span>' +
        '<span class="cl">' + esc(a.blurb) + '</span></div>';
    }).join('');
  }

  /* The file of a character is named after it, so the name of the file is
     the name to show. */
  function shelfLabel(file) {
    var n = String(file || '').replace(/\.json$/i, '').replace(/[-_]+/g, ' ').trim();
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'A character';
  }

  /* The ways in, then the characters of the shelf, so a new device can start
     from one of them. The shelf answers later, and the window is painted
     again with what it found. */
  function openIntake() {
    var shelf = '';
    function paint() {
      sheet.open({
        id: 'intake',
        title: 'A character',
        metaClass: 'sheet-meta one',
        meta: '<span>How does it come in?</span>',
        list: intakeRows() + shelf,
        onList: function (ev) {
          var take = ev.target.closest('[data-shelf]');
          if (take) {
            importUrl(take.dataset.shelf).then(function (answer) {
              toast(answer && answer.ok ? answer.name + ' is here'
                : ((answer && answer.why) || 'that character did not come'));
            });
            return;
          }
          var row = ev.target.closest('[data-intake]');
          if (!row) return;
          var one = intakes().filter(function (a) { return a.id === row.dataset.intake; })[0];
          if (one) one.run();
        }
      });
    }
    paint();
    shelfCharacters('').then(function (chars) {
      var layer = sheet.top();
      if (!layer || layer.id !== 'intake' || !chars || !chars.length) return;
      shelf = chars.map(function (c) {
        return '<div class="crow" data-shelf="' + esc(c.url) + '">' +
          '<span class="cn">' + esc(shelfLabel(c.name)) + '</span>' +
          '<span class="cl">on the shelf</span></div>';
      }).join('');
      paint();
    }).catch(function () {});
  }

  /* A link the player pasted. The link and the address of a file on GitHub
     both come in by the same door, so there is one way to read them. */
  function openPasteLink() {
    sheet.open({
      id: 'pastelink',
      title: 'From a link',
      metaClass: 'sheet-meta one',
      meta: '<input class="sheet-search" id="pasteLink" type="url" placeholder="the link of a character" aria-label="The link of a character">',
      actions: [{
        label: 'Fetch',
        onClick: function (root) {
          var field = root.querySelector('#pasteLink');
          var where = field && field.value ? field.value.trim() : '';
          if (!where) return;
          importAny(where).then(function (answer) {
            toast(answer && answer.ok ? answer.name + ' is here'
              : ((answer && answer.why) || 'that link holds no character'));
          });
        }
      }]
    });
  }

  /* ---- the packages ---- */

  /* A character leaves the app as a package: the record, a name, a kind and
     a version. What comes back in is turned into a character again, and the
     pages it carries are registered with the app. */
  function packageOf(rec) {
    return {
      kind: 'custom-sheet-character',
      version: 1,
      name: (rec.char && rec.char.name) || 'Unnamed character',
      record: {
        char: rec.char,
        spells: rec.spells,
        volley: rec.volley,
        pages: rec.pages,
        theme: rec.theme,
        icon: rec.icon
      },
      pages: rec.pluginPages || []
    };
  }

  /* One character, one name, wherever it sits: the file is named after the
     character. The export, the shelf write and the shelf read all use it. */
  function packageName(rec) {
    var name = ((rec.char && rec.char.name) || 'character').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'character';
    return name + '.json';
  }

  /* A name that is taken does not stop the import: the new one is called
     something else, so nothing is ever replaced by accident. */
  function freeName(name) {
    var taken = {};
    Object.keys(state.characters).forEach(function (id) {
      taken[((state.characters[id].char || {}).name || '').toLowerCase()] = true;
    });
    var out = name;
    var n = 2;
    while (taken[out.toLowerCase()]) { out = name + ' ' + n; n += 1; }
    return out;
  }

  /* The rules of a page are the source of a function. They run with the
     rights of the app itself, so a package is only as safe as the person
     who sent it. */
  function compileRule(src) {
    if (!src) return function () {};
    try {
      return new Function('return (' + src + ');')();
    } catch (e) {
      return function () {};
    }
  }

  /* A page of a package: its markup, its style and the rules that read it.
     A page that is already there is replaced, because the package that came
     in is the one that counts. */
  function registerPluginPage(p) {
    if (!p || !p.id) return null;
    var spec = {
      id: p.id,
      title: p.title || p.id,
      order: p.order === undefined ? PAGES.length : Number(p.order),
      blurb: p.blurb || '',
      html: typeof p.html === 'string' ? p.html : '',
      css: p.css || '',
      plugin: true,
      mount: compileRule(p.mount),
      render: compileRule(p.render)
    };
    var replaced = false;
    PAGES.forEach(function (old, i) {
      if (old.id === spec.id) { PAGES[i] = spec; replaced = true; }
    });
    if (!replaced) PAGES.push(spec);
    styleFor(spec);
    return spec;
  }

  /* The pages of a character are registered when it is played and when the
     app opens, so a package that came in keeps its pages. */
  function registerPluginPages(rec) {
    if (!rec) return;
    (rec.pluginPages || []).forEach(function (p) { registerPluginPage(p); });
  }

  function importPackage(text) {
    var pkg = null;
    try { pkg = JSON.parse(text); } catch (e) { return { ok: false, why: 'that file is not a character' }; }
    if (!pkg || (pkg.kind !== 'custom-sheet-character' && pkg.kind !== 'dnd-sheet-character') || !pkg.record) {
      return { ok: false, why: 'that file is not a character' };
    }
    var rec = seedCharacter(JSON.parse(JSON.stringify(pkg.record)), false);
    rec.char.name = freeName((rec.char.name || pkg.name || 'Unnamed character'));
    /* The pages of the package are registered and the character plays them. */
    var pages = Array.isArray(pkg.pages) ? pkg.pages : [];
    if (pages.length) {
      rec.pluginPages = pages;
      var list = rec.pages ? rec.pages.slice() : DEFAULT_PAGES.slice();
      pages.forEach(function (p) {
        registerPluginPage(p);
        if (p && p.id && list.indexOf(p.id) < 0) list.push(p.id);
      });
      rec.pages = list;
    }
    addCharacter(rec);
    return { ok: true, name: rec.char.name };
  }

  /* The export goes to the phone, which offers it to send. */
  function exportCharacter() {
    var rec = state.characters[state.current];
    if (!rec) return { ok: false, why: 'no character' };
    var name = packageName(rec);
    var text = JSON.stringify(packageOf(rec), null, 2);
    var shell = phone('share');
    if (shell) {
      try {
        var answer = shell.share(name, text);
        if (answer && answer.indexOf('error ') === 0) return { ok: false, why: answer };
        return { ok: true, name: name };
      } catch (e) {
        return { ok: false, why: String((e && e.message) || e) };
      }
    }
    /* On the web the file is offered as a download. */
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return { ok: true, name: name };
    } catch (e) {
      return { ok: false, why: String((e && e.message) || e) };
    }
  }

  /* ---- the exchange ---- */

  /* A character leaves the app as a package, and there are three ways for it
     to arrive: a file, a link, and the shelf. None of them asks the player
     to type a secret. */

  /* A link carries the character itself. The package is packed, squeezed
     and written into the link, so the two ends need nothing in common but
     the link. The character rides in the fragment of the link, and a
     fragment never reaches a server. */
  function toBase64Url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    var s = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var raw = atob(s);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function squeeze(text) {
    if (typeof CompressionStream === 'undefined') return Promise.resolve(null);
    try {
      var stream = new CompressionStream('gzip');
      var writer = stream.writable.getWriter();
      writer.write(new TextEncoder().encode(text));
      writer.close();
      return new Response(stream.readable).arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function unsqueeze(bytes) {
    var stream = new DecompressionStream('gzip');
    var writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Response(stream.readable).text();
  }

  /* The link a character travels in. It opens the repository of the app,
     which is a harmless place for it to point. */
  var LINK_BASE = 'https://github.com/NewbornAI/custom-sheet#';

  function linkOf(pkg) {
    var json = JSON.stringify(pkg);
    return squeeze(json).then(function (packed) {
      if (!packed) return LINK_BASE + 'p=0' + toBase64Url(new TextEncoder().encode(json));
      return LINK_BASE + 'p=1' + toBase64Url(packed);
    });
  }

  /* A link that carries a character comes back in. */
  function importLink(text) {
    var m = String(text || '').match(/[#&]p=([^&]+)/);
    if (!m) return Promise.resolve({ ok: false, why: 'that link carries no character' });
    var packed = m[1];
    var flag = packed.charAt(0);
    try {
      var bytes = fromBase64Url(packed.slice(1));
      if (flag === '1') {
        return unsqueeze(bytes).then(function (body) { return importPackage(body); });
      }
      return Promise.resolve(importPackage(new TextDecoder().decode(bytes)));
    } catch (e) {
      return Promise.resolve({ ok: false, why: 'that link carries no character' });
    }
  }

  /* A link leaves the app: the phone offers it to send, the web puts it in
     the clipboard. */
  function shareLink(url) {
    var shell = phone('shareText');
    if (shell) {
      try {
        var answer = shell.shareText(url);
        if (answer && answer.indexOf('error ') === 0) return Promise.resolve(answer);
        return Promise.resolve('ok');
      } catch (e) {
        return Promise.resolve(String((e && e.message) || e));
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url).then(function () {
        return 'copied';
      }).catch(function () {
        return 'not copied';
      });
    }
    return Promise.resolve('not copied');
  }

  /* The phone has an explorer and a share sheet, the web has neither. */
  function isPhone() {
    return !!phone('pick');
  }

  /* ---- the shelf ---- */

  /* The shelf is a folder in the repository of the app. The repository is
     public, so the app reads it with no secret at all, and anybody may
     open a branch and drop a character there. */
  function shelfRepo() {
    var ui = state.ui || {};
    return String(ui.shelf || 'NewbornAI/custom-sheet');
  }

  function shelfApi(path) {
    return 'https://api.github.com/repos/' + shelfRepo() + path;
  }

  /* The characters of a branch: the files of the folder, one package each.
     The token of the player is used when there is one, so a shelf of one's
     own can be private. */
  function shelfCharacters(ref) {
    if (window.SheetGit) {
      return window.SheetGit.listCharacters(shelfRepo(), ref, ghReadToken())
        .catch(function (e) { throw e; });
    }
    var where = shelfApi('/contents/characters' + (ref ? '?ref=' + encodeURIComponent(ref) : ''));
    return readUrl(where).then(function (text) {
      var rows = JSON.parse(text);
      if (!Array.isArray(rows)) return [];
      return rows.filter(function (f) {
        return f && f.type === 'file' && /\.json$/.test(f.name);
      }).map(function (f) {
        return { name: f.name, url: f.download_url, page: f.html_url || '', ref: ref || '' };
      });
    }).catch(function (e) {
      /* the folder of the shelf may not be there yet */
      var why = String((e && e.message) || e);
      if (why.indexOf('404') >= 0) return [];
      throw e;
    });
  }

  /* The branches are the shelves of the players: anybody may open one. */
  function shelfBranches() {
    if (window.SheetGit) {
      return window.SheetGit.api('GET', '/repos/' + shelfRepo() + '/branches', null, ghReadToken())
        .then(function (rows) {
          if (!Array.isArray(rows)) return [];
          return rows.map(function (b) { return b.name; });
        });
    }
    return readUrl(shelfApi('/branches')).then(function (text) {
      var rows = JSON.parse(text);
      if (!Array.isArray(rows)) return [];
      return rows.map(function (b) { return b.name; });
    });
  }

  /* ---- the shelf writes back ---- */

  /* The session of the player: the token, the refresh token that renews it
     and when it runs out. It is asked for once, kept in the state of the
     app, and it never leaves the machine except to GitHub. */
  function ghSession() {
    return (state.ui && state.ui.gh) || null;
  }

  function ghToken() {
    var s = ghSession();
    return (s && s.token) || (state.ui && state.ui.token) || '';
  }

  /* A read that may be anonymous. A token that has run out is not sent, so
     the public shelf is still read without one. */
  function ghReadToken() {
    var s = ghSession();
    if (!s || !s.token) return '';
    if (s.expires && s.expires <= Date.now()) return '';
    return s.token;
  }

  /* The token, renewed when it has run out. A GitHub App hands a token for
     eight hours and a refresh token for six months, so the app renews the
     session rather than asking the player to sign in again. */
  function ghTokenNow() {
    var s = ghSession();
    var token = ghToken();
    if (!token) return Promise.reject(new Error('connect to GitHub first'));
    if (!s || !s.expires || s.expires - 60000 > Date.now()) return Promise.resolve(token);
    if (!s.refresh || !window.SheetGit || !window.SheetGit.refreshSession) {
      return Promise.reject(new Error('the connection has run out, sign in again'));
    }
    return window.SheetGit.refreshSession(s.refresh).then(function (answer) {
      if (!answer || !answer.access_token) throw new Error('GitHub did not renew the connection');
      ghSetSession(answer);
      return answer.access_token;
    });
  }

  /* The sign in waits for a code approved in a browser, and the app is in
     the background while the player approves it, so the wait is kept in the
     state and picks itself up when the app comes back. */
  var ghTimer = null;
  var ghFails = 0;

  function ghPending() {
    var p = state.ui && state.ui.ghPending;
    if (!p || !p.code) return null;
    if (Date.now() - (Number(p.at) || 0) > 14 * 60 * 1000) {
      state.ui.ghPending = null;
      save();
      return null;
    }
    return p;
  }

  function ghBegin() {
    if (!window.SheetGit) return Promise.reject(new Error('the sign in cannot start'));
    state.ui = state.ui || {};
    return window.SheetGit.deviceStart().then(function (answer) {
      if (!answer || !answer.user_code) throw new Error('GitHub did not answer');
      state.ui.ghPending = {
        code: answer.device_code || '',
        wait: Number(answer.interval) || 5,
        at: Date.now()
      };
      save();
      return answer;
    });
  }

  /* Asks GitHub again, and again, until the code is approved or the code runs
     out. A slow down is answered by waiting longer, never by giving up. */
  function ghWait(onDone) {
    var p = ghPending();
    if (!p || !window.SheetGit) return;
    if (ghTimer) window.clearTimeout(ghTimer);
    ghTimer = window.setTimeout(function () {
      ghTimer = null;
      if (!ghPending()) { if (onDone) onDone(false, 'the code ran out, ask for another'); return; }
      window.SheetGit.devicePoll(p.code).then(function (answer) {
        if (answer && answer.access_token) {
          state.ui.ghPending = null;
          state.ui.ghLast = '';
          ghFails = 0;
          ghSetSession(answer);
          window.SheetGit.whoAmI(answer.access_token).then(function (login) {
            ghSetLogin(login);
            save();
            toast('signed in as ' + login);
            refresh();
            if (onDone) onDone(true);
          }).catch(function () {
            save();
            refresh();
            if (onDone) onDone(true);
          });
          return;
        }
        var why = (answer && (answer.error || answer.error_description)) || 'not yet';
        state.ui.ghLast = String(why);
        save();
        ghFails = 0;
        /* the row says what GitHub answered, so a wait that never ends can
           be read rather than guessed */
        refresh();
        if (why === 'authorization_pending') { ghWait(onDone); return; }
        if (why === 'slow_down') {
          p.wait = (Number(p.wait) || 5) + 5;
          save();
          ghWait(onDone);
          return;
        }
        state.ui.ghPending = null;
        save();
        toast(String(why));
        if (onDone) onDone(false, String(why));
      }).catch(function (e) {
        /* A bridge that cannot answer is not a reason to wait forever. */
        ghFails += 1;
        if (ghFails >= 5) {
          state.ui.ghPending = null;
          state.ui.ghLast = 'the check did not get through';
          save();
          toast('GitHub did not answer the check: ' + String((e && e.message) || e));
          if (onDone) onDone(false, 'GitHub did not answer the check');
          return;
        }
        ghWait(onDone);
      });
    }, (Number(p.wait) || 5) * 1000);
  }

  function ghSetSession(answer) {
    state.ui = state.ui || {};
    var s = state.ui.gh || {};
    if (answer && answer.access_token) s.token = answer.access_token;
    if (answer && answer.refresh_token) s.refresh = answer.refresh_token;
    s.expires = (answer && answer.expires_in) ? Date.now() + Number(answer.expires_in) * 1000 : 0;
    state.ui.gh = s;
    state.ui.token = s.token || '';
    save();
  }

  function ghSetToken(token) {
    state.ui = state.ui || {};
    state.ui.gh = token ? { token: token, expires: 0 } : null;
    state.ui.token = token || '';
    save();
  }

  function ghLogin() {
    return (state.ui && state.ui.login) || '';
  }

  function ghSetLogin(login) {
    state.ui = state.ui || {};
    state.ui.login = login || '';
    if (state.ui.gh) state.ui.gh.login = login || '';
    save();
  }

  /* Where a character is written. The main branch holds the shared ones, and
     a branch of one's own holds the ones that are not ready yet. */
  function ghBranch() {
    return (state.ui && state.ui.branch) || 'main';
  }

  function ghSetBranch(branch) {
    state.ui = state.ui || {};
    state.ui.branch = branch || 'main';
    save();
  }

  /* A character is written to the shelf as a package, one file per
     character, and the answer is the address of the file. */
  function shelfWrite(pkgText, fileName, message, token) {
    if (!window.SheetGit) return Promise.reject(new Error('the shelf cannot write yet'));
    var path = 'characters/' + fileName;
    return window.SheetGit.putFile(shelfRepo(), path, pkgText, message || 'a character joins the shelf', ghBranch(), token || ghToken())
      .then(function (answer) {
        return (answer && answer.content && answer.content.html_url) || '';
      });
  }

  /* A branch of the shelf, made when it is not there yet. */
  function shelfBranch(name, token) {
    if (!window.SheetGit) return Promise.reject(new Error('the shelf cannot write yet'));
    return window.SheetGit.createBranch(shelfRepo(), name, token || ghToken());
  }

  /* A character goes off the shelf as well as on it. */
  function shelfRemove(fileName, token) {
    if (!window.SheetGit) return Promise.reject(new Error('the shelf cannot write yet'));
    return window.SheetGit.deleteFile(shelfRepo(), 'characters/' + fileName, 'a character leaves the shelf', ghBranch(), token || ghToken());
  }

  /* The character being played goes onto the shelf, one file per character,
     named after it, on the branch that is named. The sheet and the settings
     both push through here, so a character is written one way. */
  function pushToShelf(rec) {
    if (!window.SheetGit) return Promise.reject(new Error('the shelf cannot write yet'));
    if (!rec || !rec.char) return Promise.reject(new Error('there is no character'));
    var name = packageName(rec);
    var text = JSON.stringify(packageOf(rec), null, 2);
    var branch = ghBranch();
    var message = (rec.char.name || 'a character') + ' goes to the shelf';
    return ghTokenNow().then(function (token) {
      return shelfWrite(text, name, message, token).catch(function (e) {
        var why = String((e && e.message) || e);
        /* the branch may not be there yet, so it is made and the character is
           put again */
        if (branch !== 'main' && why.indexOf('not found') >= 0) {
          return shelfBranch(branch, token).then(function () {
            return shelfWrite(text, name, message, token);
          });
        }
        throw e;
      });
    });
  }

  /* A shelf of one's own: a new repository, or a fork of the one of the
     project. */
  function shelfCreateRepo(name, isPrivate, token) {
    if (!window.SheetGit) return Promise.reject(new Error('the shelf cannot write yet'));
    return window.SheetGit.createRepo(name, token || ghToken(), isPrivate);
  }

  function shelfFork(token) {
    if (!window.SheetGit) return Promise.reject(new Error('the shelf cannot write yet'));
    return window.SheetGit.forkRepo(shelfRepo(), token || ghToken());
  }

  /* The address of a file on GitHub, the one a browser shows, is turned
     into the address of the file itself, so a player can paste either. */
  function rawAddress(url) {
    var blob = String(url || '').match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (blob) return 'https://raw.githubusercontent.com/' + blob[1] + '/' + blob[2] + '/' + blob[3] + '/' + blob[4];
    var raw = String(url || '').match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/);
    if (raw) return 'https://raw.githubusercontent.com/' + raw[1] + '/' + raw[2] + '/' + raw[3] + '/' + raw[4];
    return String(url || '');
  }

  /* A package that comes in by a link, or by the address of a file that
     holds one. */
  function importAny(text) {
    var where = String(text || '').trim();
    if (!where) return Promise.resolve({ ok: false, why: 'nothing to fetch' });
    if (/[#&]p=/.test(where)) return importLink(where);
    return importUrl(rawAddress(where));
  }

  /* A package that comes in by a link: the machine that holds the file
     answers, and the package lands the way one from a file lands. */
  function importUrl(url) {
    var where = rawAddress(String(url || '').trim());
    if (!where) return Promise.resolve({ ok: false, why: 'no link' });
    return readUrl(where).then(function (text) {
      return importPackage(text);
    }).catch(function (e) {
      return { ok: false, why: String((e && e.message) || e) };
    });
  }

  /* The file the player picked comes back to the page. */
  window.__sheetPicked = function (name) {
    var shell = phone('pickedText');
    var text = shell ? shell.pickedText() : '';
    if (!text) return;
    var answer = importPackage(text);
    if (answer && answer.ok) toast(answer.name + ' is here.');
    else toast(answer.why || 'that file is not a character');
  };

  function pickFile() {
    var shell = phone('pick');
    if (shell) {
      try {
        var answer = shell.pick();
        if (answer && answer.indexOf('error ') === 0) toast(answer);
        return true;
      } catch (e) {
        toast(String((e && e.message) || e));
        return false;
      }
    }
    /* There is no explorer of the phone on the web, so the page opens one
       of its own and reads the package the player chose. */
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var answer = importPackage(String(reader.result || ''));
        toast(answer && answer.ok ? answer.name + ' is here.' : (answer.why || 'that file is not a character'));
        if (input.parentNode) input.parentNode.removeChild(input);
      };
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
    return true;
  }

  /* A character from a class. The skeleton is built from the class data
     and the library, so the player or the agent only fills what is left: the
     scores, the hit points, the armour class, the skills and the spells. */
  function openClassChooser() {
    if (!CLASSDATA.length) {
      sheet.open({
        id: 'classchooser',
        title: 'A class',
        metaClass: 'sheet-meta one',
        meta: '<span>The class file did not arrive.</span>',
        list: ''
      });
      return;
    }
    var html = CLASSDATA.map(function (c) {
      var caster = c.caster === 'full' ? 'full caster'
        : (c.caster === 'half' ? 'half caster'
        : (c.caster === 'third' ? 'third caster'
        : (c.caster === 'pact' ? 'pact magic' : '')));
      return '<div class="crow" data-class="' + esc(c.name) + '">' +
        '<span class="cn">' + esc(c.name) + '</span>' +
        '<span class="cl">d' + (c.hd || 6) + (caster ? ', ' + caster : '') + '</span>' +
        '</div>';
    }).join('');
    sheet.open({
      id: 'classchooser',
      title: 'A class',
      metaClass: 'sheet-meta one',
      meta: '<span>The class brings its features, its saves and its dice.</span>',
      list: html,
      onList: function (ev) {
        var row = ev.target.closest('.crow[data-class]');
        if (row) openLevelChooser(row.dataset.class);
      }
    });
  }

  function openLevelChooser(className) {
    var level = 1;
    sheet.open({
      id: 'levelchooser',
      title: className,
      metaClass: 'sheet-meta one',
      meta: '<span>How many levels?</span>',
      list: '<div class="crow">' +
        '<button class="mini" type="button" data-step="-" aria-label="One level less">&minus;</button>' +
        '<span class="cn" id="skelLevel">Level 1</span>' +
        '<button class="mini" type="button" data-step="+" aria-label="One level more">+</button>' +
        '</div>',
      onList: function (ev) {
        var step = ev.target.closest('[data-step]');
        if (!step) return;
        level = Math.max(1, Math.min(20, level + (step.dataset.step === '+' ? 1 : -1)));
        var num = document.getElementById('skelLevel');
        if (num) num.textContent = 'Level ' + level;
      },
      actions: [{ label: 'Next', onClick: function () { openSubclassChooser(className, level); } }]
    });
  }

  function openSubclassChooser(className, level) {
    var cls = null;
    CLASSDATA.forEach(function (c) { if (c.name === className) cls = c; });
    var subs = (cls && cls.subclasses) || [];
    var html = subs.map(function (s) {
      return '<div class="crow" data-sub="' + esc(s.name) + '">' +
        '<span class="cn">' + esc(s.name) + '</span>' +
        '<span class="cl">' + esc(s.source || '') + '</span></div>';
    }).join('');
    html += '<div class="crow" data-none="1"><span class="cn">No archetype</span></div>';
    sheet.open({
      id: 'subchooser',
      title: 'The archetype',
      metaClass: 'sheet-meta one',
      meta: '<input class="sheet-search" id="skelName" type="text" placeholder="Name of the character" aria-label="Name of the character">',
      list: html,
      onList: function (ev) {
        var field = document.getElementById('skelName');
        var name = (field && field.value ? field.value : '').trim();
        var row = ev.target.closest('.crow[data-sub]');
        if (row) { addCharacter(skeleton(className, level, row.dataset.sub, name)); return; }
        if (ev.target.closest('[data-none]')) addCharacter(skeleton(className, level, '', name));
      }
    });
  }

  /* The skeleton: the class, the level, the archetype, the features those
     bring and the saves of the class. */
  function skeleton(className, level, subclass, name) {
    var cls = null;
    CLASSDATA.forEach(function (c) { if (c.name === className) cls = c; });
    var sub = null;
    if (cls && subclass) {
      (cls.subclasses || []).forEach(function (s) { if (s.name === subclass) sub = s; });
    }
    var keys = [];
    Object.keys(FEATURE_BY_KEY).forEach(function (key) {
      var f = FEATURE_BY_KEY[key];
      if (f.class !== className) return;
      if (Number(f.level) > level) return;
      if (/subclass$/i.test(f.name)) return;        /* a heading, not a feature */
      if (f.subclass) {
        if (!sub || f.subclass !== sub.short) return;
        if (f.name === sub.name) return;             /* the note of the archetype */
      }
      keys.push(key);
    });
    var saves = {};
    SR.ABILITIES.forEach(function (a) { saves[a.key] = 0; });
    ((cls && cls.saves) || []).forEach(function (a) { saves[a] = 1; });
    return seedCharacter({
      char: {
        name: name || '',
        level: level,
        classes: [{ name: className, level: level, subclass: subclass || '' }],
        saves: saves,
        featureKeys: keys
      }
    }, true);
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
    delete state.characters[id];
    if (state.current === id) {
      state.current = ids.filter(function (x) { return x !== id; })[0] || '';
    }
    save();
    sheet.closeAll();
    /* The last one leaves the app with nothing to play, so it goes back to
       the ways in. */
    if (!Object.keys(state.characters).length) { openCharacters(); return; }
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
      /* The page the app opens on, and the page every character has, are on
         whatever the character chose. */
      if (p.home || p.always) return true;
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
    registerPluginPages(state.characters[id]);
    });
    save();
    /* Every page reads a character, so a device that holds none shows the
       ways in and no page at all. */
    /* A sign in that was waiting when the app went away picks itself back
       up, so an approval in the browser is never lost. */
    if (!ghToken() && ghPending()) ghWait();
    if (!Object.keys(state.characters).length) { openCharacters(); return; }
    var home = PAGES.filter(function (p) { return p.home; })[0];
    show(home ? home.id : (enabled()[0] || PAGES[0]).id);
  }

  /* The app comes back from the browser where the code was approved, so
     the wait is picked up again there. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !ghToken() && ghPending()) ghWait();
  });

  window.Sheet = { page: page, core: core, show: show };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
