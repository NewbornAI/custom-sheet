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
      var why = C.dataError[r.what === 'spells' ? 'spellbook' : r.what];
      row.innerHTML = '<span class="t">' + C.esc(r.name) + '</span>' +
        '<span class="d">' + C.esc(on ? r.got + ' ' + r.what + ' ready' : (why ? why : 'not here yet')) + '</span>';
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

  /* The update route: the app asks the machine that serves it whether a
     newer build is there, and offers it. */
  function server() {
    var ui = api.state.ui || {};
    return ui.server || 'http://192.168.0.125:8123';
  }

  function update() {
    E.update.innerHTML = '';

    var row = document.createElement('div');
    row.className = 'srow';
    row.innerHTML = '<span class="t">This build</span><span class="d">' +
      C.esc((C.version || '').replace('T', ' ').slice(0, 19)) + '</span>';
    E.update.appendChild(row);

    var field = document.createElement('div');
    field.className = 'srow';
    var input = document.createElement('input');
    input.className = 'cinput';
    input.type = 'url';
    input.value = server();
    input.setAttribute('aria-label', 'The address of the machine that serves the app');
    input.addEventListener('input', function () {
      api.state.ui = api.state.ui || {};
      api.state.ui.server = input.value;
      api.save();
    });
    field.appendChild(input);
    E.update.appendChild(field);

    var line = document.createElement('div');
    line.className = 'srow';
    line.innerHTML = '<span class="t">The machine</span><span class="d">checking</span>';
    E.update.appendChild(line);

    var check = document.createElement('button');
    check.type = 'button';
    check.className = 'stog';
    check.textContent = 'Look';
    check.setAttribute('aria-label', 'Look for a newer build');
    check.addEventListener('click', function () {
      var address = server().replace(/\/$/, '');
      line.querySelector('.d').textContent = 'checking';
      C.readUrl(address + '/version.json')
        .then(function (text) { return JSON.parse(text); })
        .then(function (v) {
          if (!v || !v.version) { line.querySelector('.d').textContent = 'no answer'; return; }
          if (v.version === C.version) { line.querySelector('.d').textContent = 'this is the newest'; return; }
          line.querySelector('.d').textContent = 'a newer build is there';
          var get = document.createElement('button');
          get.type = 'button';
          get.className = 'stog on';
          get.textContent = 'Get it';
          get.setAttribute('aria-label', 'Open the newer build');
          get.addEventListener('click', function () {
            var apk = address + '/' + (v.apk || 'dnd-sheet.apk');
            line.querySelector('.d').textContent = 'downloading';
            C.installUpdate(apk).then(function (answer) {
              line.querySelector('.d').textContent = answer === 'ok' ? 'the installer is open' : answer;
            }).catch(function (e) {
              line.querySelector('.d').textContent = String((e && e.message) || e);
            });
          });
          line.appendChild(get);
        })
        .catch(function () { line.querySelector('.d').textContent = 'no answer'; });
    });
    var holder = document.createElement('div');
    holder.className = 'srow';
    holder.appendChild(check);
    E.update.appendChild(holder);
  }

  /* The exchange: the character being played goes out, and one comes in. */
  function exchange() {
    E.exchange.innerHTML = '';

    var out = document.createElement('div');
    out.className = 'srow';
    out.innerHTML = '<span class="t">The character being played</span><span class="d">a package of it</span>';
    var send = document.createElement('button');
    send.type = 'button';
    send.className = 'stog';
    send.textContent = 'Send';
    send.setAttribute('aria-label', 'Send the character being played');
    send.addEventListener('click', function () {
      var answer = C.exportCharacter();
      C.toast(answer.ok ? answer.name + ' is ready to send' : answer.why);
    });
    out.appendChild(send);
    E.exchange.appendChild(out);

    var into = document.createElement('div');
    into.className = 'srow';
    into.innerHTML = '<span class="t">A character</span><span class="d">from a file on the phone</span>';
    var open = document.createElement('button');
    open.type = 'button';
    open.className = 'stog';
    open.textContent = 'Open';
    open.setAttribute('aria-label', 'Open a file from the phone');
    open.addEventListener('click', function () { C.pickFile(); });
    into.appendChild(open);
    E.exchange.appendChild(into);
  }

  /* The repository: its address and its token, and the window that holds the
     characters it keeps. */
  function repositoryRows() {
    E.repository.innerHTML = '';
    var repo = C.repository();

    var address = document.createElement('div');
    address.className = 'srow';
    var input = document.createElement('input');
    input.className = 'cinput';
    input.type = 'url';
    input.value = repo.address;
    input.placeholder = 'https://....upstash.io';
    input.setAttribute('aria-label', 'The address of the repository');
    input.addEventListener('input', function () {
      api.state.ui = api.state.ui || {};
      api.state.ui.repo = input.value;
      api.save();
    });
    address.appendChild(input);
    E.repository.appendChild(address);

    var token = document.createElement('div');
    token.className = 'srow';
    var secret = document.createElement('input');
    secret.className = 'cinput';
    secret.type = 'password';
    secret.value = repo.token;
    secret.placeholder = 'the token of the repository';
    secret.setAttribute('aria-label', 'The token of the repository');
    secret.addEventListener('input', function () {
      api.state.ui = api.state.ui || {};
      api.state.ui.token = secret.value;
      api.save();
    });
    token.appendChild(secret);
    E.repository.appendChild(token);

    var row = document.createElement('div');
    row.className = 'srow';
    row.innerHTML = '<span class="t">The characters</span><span class="d">the ones it holds</span>';
    var list = document.createElement('button');
    list.type = 'button';
    list.className = 'stog';
    list.textContent = 'Open';
    list.setAttribute('aria-label', 'The characters the repository holds');
    list.addEventListener('click', openRepository);
    row.appendChild(list);
    E.repository.appendChild(row);
  }

  /* The window of the repository: a list of the characters it holds, and the
     two arrows. The arrow down brings one in, the arrow up leaves the
     character being played in its place. */
  function openRepository() {
    C.repoList().then(function (names) {
      var html = names.map(function (n) {
        return '<div class="crow" data-name="' + C.esc(n) + '">' +
          '<span class="cn">' + C.esc(n) + '</span>' +
          '<button class="mini" type="button" data-down="' + C.esc(n) + '" aria-label="Bring ' + C.esc(n) + ' in">&darr;</button>' +
          '<button class="mini" type="button" data-up="' + C.esc(n) + '" aria-label="Put the character being played in place of ' + C.esc(n) + '">&uarr;</button>' +
          '</div>';
      }).join('');
      if (!html) html = '<div class="empty">The repository is empty.</div>';
      api.sheet.open({
        id: 'repository',
        title: 'The repository',
        metaClass: 'sheet-meta one',
        meta: '<span>The characters it holds. The arrow down brings one in.</span>',
        list: html,
        onList: function (ev) {
          var down = ev.target.closest('[data-down]');
          if (down) {
            C.repoGet(down.dataset.down).then(function (pkg) {
              if (!pkg) { C.toast('that one is not there'); return; }
              var answer = C.importPackage(JSON.stringify(pkg));
              C.toast(answer.ok ? answer.name + ' is here' : answer.why);
            }).catch(function (e) { C.toast(String((e && e.message) || e)); });
            return;
          }
          var up = ev.target.closest('[data-up]');
          if (up) {
            var rec = api.character();
            var pkg = { kind: 'dnd-sheet-character', version: 1, name: up.dataset.up, saved: new Date().toISOString(), record: { char: rec.char, spells: rec.spells, volley: rec.volley, pages: rec.pages, theme: rec.theme, icon: rec.icon } };
            C.repoPut(pkg).then(function (ok) {
              C.toast(ok ? up.dataset.up + ' is in the repository' : 'the repository said no');
            }).catch(function (e) { C.toast(String((e && e.message) || e)); });
          }
        }
      });
    }).catch(function (e) { C.toast(String((e && e.message) || e)); });
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
      '  <div class="cshead"><span>Exchange</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsExchange"></div>',
      '  <p class="note">A character is a package: the data in JSON. It can leave the phone as a file, or sit in a repository that the players share.</p>',
      '  <div class="cshead"><span>The repository</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsRepository"></div>',
      '  <div class="cshead"><span>Update</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsUpdate"></div>',
      '  <p class="note">The app is served from the machine that holds it. Give that address here and the app will tell you when a newer build is there.</p>',
      '</div>'
    ].join('\n'),

    mount: function (root, a) {
      api = a;
      E = {
        body: root.querySelector('#settingsBody'),
        list: root.querySelector('#settingsList'),
        files: root.querySelector('#settingsFiles'),
        exchange: root.querySelector('#settingsExchange'),
        repository: root.querySelector('#settingsRepository'),
        update: root.querySelector('#settingsUpdate')
      };
    },

    render: function (a) {
      api = a;
      E.list.innerHTML = '';
      files();
      update();
      exchange();
      repositoryRows();
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
