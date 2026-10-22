/* The settings page: the pages of the app, and the ones that are on. */
(function () {
  'use strict';

  var C = Volley.core;

  var api = null;   /* the shell gives it at mount */
  var E = {};

  /* The pages belong to the character: a bard can live without the volley
     page the warlock plays. A character that never chose keeps the pages
     of the app. */
  function pages() {
    var rec = api.character();
    if (rec.pages) return rec.pages;
    if (api.state.ui.pages) return api.state.ui.pages;
    return api.defaultPages.slice();
  }

  function toggle(id) {
    var list = pages().slice();
    var ix = list.indexOf(id);
    if (ix >= 0) list.splice(ix, 1);
    else list.push(id);
    api.character().pages = list;
    api.save();
    api.refresh();
  }

  /* What has arrived, so a phone that cannot read a file can say so. */
  function files() {
    var rows = [
      { name: 'The book', got: (C.book.spells || []).length, what: 'spells' },
      { name: 'The library of features', got: Object.keys(C.featureByKey).length, what: 'features' },
      { name: 'The classes', got: (C.classData || []).length, what: 'classes' }
    ];
    E.files.innerHTML = '';
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'srow';
      var on = r.got > 0;
      row.innerHTML = '<span class="t">' + C.esc(r.name) + '</span>' +
        '<span class="d">' + (on ? r.got + ' ' + r.what + ' ready' : 'not here yet') + '</span>';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'stog' + (on ? ' on' : '');
      b.textContent = on ? 'Here' : 'Read';
      b.setAttribute('aria-label', (on ? r.name + ' is ready' : 'Read ' + r.name));
      b.addEventListener('click', function () { C.data(r.what === 'spells' ? 'spellbook' : r.what); });
      row.appendChild(b);
      E.files.appendChild(row);
    });
  }

  Volley.page({
    id: 'settings',
    title: 'Settings',
    order: 4,
    hidden: true,   /* the gear opens it, so it has no tab of its own */
    blurb: 'The pages of the app.',
    html: [
      '<div class="charbody" id="settingsBody">',
      '  <div class="cshead"><span>Pages</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsList"></div>',
      '  <p class="note">A page that is off keeps its numbers. Turning it back on brings them back.</p>',
      '  <div class="cshead"><span>The files</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsFiles"></div>',
      '  <p class="note">The book, the library of features and the classes sit beside the app and are read when a page asks for one.</p>',
      '</div>'
    ].join('\n'),

    mount: function (root, a) {
      api = a;
      E = {
        body: root.querySelector('#settingsBody'),
        list: root.querySelector('#settingsList'),
        files: root.querySelector('#settingsFiles')
      };
    },

    render: function (a) {
      api = a;
      E.list.innerHTML = '';
      files();
      api.pages.forEach(function (p) {
        if (p.hidden) return;
        var on = p.home || pages().indexOf(p.id) >= 0;
        var row = document.createElement('div');
        row.className = 'srow';
        row.innerHTML = '<span class="t">' + C.esc(typeof p.title === 'function' ? p.title(api) : p.title) + '</span>' +
          '<span class="d">' + C.esc(p.blurb || '') + '</span>';
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'stog' + (on ? ' on' : '');
        b.textContent = p.home ? 'Always' : (on ? 'On' : 'Off');
        b.disabled = !!p.home;
        b.setAttribute('aria-label', (typeof p.title === 'function' ? p.title(api) : p.title) + ', ' + (on ? 'on' : 'off'));
        if (!p.home) {
          b.addEventListener('click', function () { toggle(p.id); });
        }
        row.appendChild(b);
        E.list.appendChild(row);
      });
    }
  });
})();
