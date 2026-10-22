/* The shell of the app: the pages that are on, the tabs that carry them,
   the store they share, and the overlay any of them can open. */
(function () {
  'use strict';

  var R = window.Rules;
  var SR = window.SheetRules;
  var STORE = 'volley.state.v2';
  var OLD_STORE = 'volley.state.v1';

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
  var BOOK = readJson('spell-data');
  var FEATUREDATA = readJson('feature-data');

  var SPELL_BY_NAME = {};
  (BOOK.spells || []).forEach(function (s) { SPELL_BY_NAME[s.name] = s; });

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
    'high elf': 'elf'
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
    var ch = api.state.char;
    ch.history.push(SR.snapshot(ch, api.state.spells));
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
    features: FEATUREDATA,
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
    bumpSp: bumpSp
  };

  /* ---- the store ---- */

  var DEFAULT_PAGES = ['volley', 'spells', 'features'];

  var state = load();

  function load() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { saved = {}; }
    if (!saved.volley && !saved.spells && !saved.char) saved = fromOld();
    var out = { volley: {}, spells: {}, char: {}, ui: { pages: null } };
    Object.keys(out).forEach(function (k) {
      if (saved[k] !== undefined && saved[k] !== null) out[k] = saved[k];
    });
    if (!out.ui) out.ui = { pages: null };
    if (out.ui.pages === undefined) out.ui.pages = null;
    return out;
  }

  /* The state of the first version, moved into the slices. */
  function fromOld() {
    var old = {};
    try { old = JSON.parse(localStorage.getItem(OLD_STORE) || '{}') || {}; } catch (e) { old = {}; }
    if (!old || (!old.spell && !old.char && old.power === undefined)) return {};
    var out = { volley: {}, spells: old.spell || {}, char: old.char || {}, ui: { pages: null } };
    ['power', 'advantage', 'hex', 'curse', 'elem', 'elemPlus', 'quicken', 'ac'].forEach(function (k) {
      if (old[k] !== undefined) out.volley[k] = old[k];
    });
    return out;
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

    return {
      open: open,
      close: close,
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

  /* ---- the elements of the shell ---- */

  var el = {
    pageTitle: document.getElementById('pageTitle'),
    head: document.getElementById('headSlot'),
    tabs: document.getElementById('tabList'),
    gear: document.getElementById('gear'),
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

  function enabled() {
    var on = state.ui.pages || DEFAULT_PAGES;
    return PAGES.filter(function (p) {
      if (p.hidden) return false;
      if (p.home) return true;
      return on.indexOf(p.id) >= 0;
    }).sort(function (a, b) { return a.order - b.order; });
  }

  /* The label of a tab, which can be shorter than the name of the page. */
  function label(p) {
    if (p.tab) return p.tab;
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
    el.pageTitle.textContent = label(p);
    if (p.render) p.render(api);
  }

  function refresh() {
    renderTabs();
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
    defaultPages: DEFAULT_PAGES
  };

  /* ---- the wiring of the shell ---- */

  el.gear.addEventListener('click', function () { show('settings'); });
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
    /* every page seeds its own slice */
    PAGES.forEach(function (p) {
      if (!p.seed) return;
      var key = p.slice || p.id;
      state[key] = p.seed(state[key] || {});
    });
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
