/* The settings page: the pages of the app, and the ones that are on. */
(function () {
  'use strict';

  var C = Sheet.core;

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
    input.className = 'cinput slim';
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
            var apk = address + '/' + (v.apk || 'custom-sheet.apk');
            line.querySelector('.d').textContent = 'downloading';
            C.installUpdate(apk).then(function (answer) {
              line.querySelector('.d').textContent = answer === 'ok' ? 'the installer is open' : answer;
              if (answer !== 'ok') return;
              /* The installer of the phone does not always come up. The
                 browser is the way that always works. */
              var other = document.createElement('button');
              other.type = 'button';
              other.className = 'stog';
              other.textContent = 'Browser';
              other.setAttribute('aria-label', 'Open the build in the browser');
              other.addEventListener('click', function () { window.open(apk, '_blank'); });
              line.appendChild(other);
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
    var phone = C.isPhone();
    var field;

    /* The character being played, as a file. The phone offers it to send,
       the desktop saves it. */
    var out = document.createElement('div');
    out.className = 'srow';
    out.innerHTML = '<span class="t">The character as a file</span><span class="d">a package of it</span>';
    var send = document.createElement('button');
    send.type = 'button';
    send.className = 'stog';
    send.textContent = phone ? 'Send' : 'Save';
    send.setAttribute('aria-label', 'Save the character being played as a file');
    send.addEventListener('click', function () {
      var answer = C.exportCharacter();
      if (!answer.ok) { C.toast(answer.why); return; }
      C.toast(answer.name + (phone ? ' is ready to send' : ' was saved'));
    });
    out.appendChild(send);
    E.exchange.appendChild(out);

    /* The character being played, as a link. The link carries the character
       itself, so the other end needs nothing but the link. */
    var asLink = document.createElement('div');
    asLink.className = 'srow';
    asLink.innerHTML = '<span class="t">The character as a link</span><span class="d">a link that carries it</span>';
    var link = document.createElement('button');
    link.type = 'button';
    link.className = 'stog';
    link.textContent = phone ? 'Send' : 'Copy';
    link.setAttribute('aria-label', 'Make a link of the character being played');
    link.addEventListener('click', function () {
      C.linkOf(C.packageOf(api.character())).then(function (where) {
        return C.shareLink(where).then(function (answer) {
          if (answer === 'copied') { C.toast('the link is in the clipboard'); return; }
          if (answer === 'ok') { C.toast('the link is ready to send'); return; }
          /* The clipboard was refused, so the link goes in the field and can
             still be copied by hand. */
          field.value = where;
          C.toast('the link is in the field below');
        });
      }).catch(function (e) { C.toast(String((e && e.message) || e)); });
    });
    asLink.appendChild(link);
    E.exchange.appendChild(asLink);

    /* A character from a file: the explorer of the phone, or the file picker
       of the browser on the desktop. */
    var into = document.createElement('div');
    into.className = 'srow';
    into.innerHTML = '<span class="t">From a file</span><span class="d">a package to bring in</span>';
    var open = document.createElement('button');
    open.type = 'button';
    open.className = 'stog';
    open.textContent = 'Open';
    open.setAttribute('aria-label', 'Open a file that holds a character');
    open.addEventListener('click', function () { C.pickFile(); });
    into.appendChild(open);
    E.exchange.appendChild(into);

    /* A character from a link. */
    var fromLink = document.createElement('div');
    fromLink.className = 'srow';
    var title = document.createElement('span');
    title.className = 't';
    title.textContent = 'From a link';
    fromLink.appendChild(title);
    field = document.createElement('input');
    field.className = 'cinput slim';
    field.type = 'url';
    field.placeholder = 'the link of a character';
    field.setAttribute('aria-label', 'The link of a character to bring in');
    var take = document.createElement('button');
    take.type = 'button';
    take.className = 'stog';
    take.textContent = 'Fetch';
    take.setAttribute('aria-label', 'Fetch the character at that link');
    take.addEventListener('click', function () {
      take.disabled = true;
      C.importAny(field.value).then(function (answer) {
        take.disabled = false;
        C.toast(answer && answer.ok ? answer.name + ' is here'
          : ((answer && answer.why) || 'that link holds no character'));
      });
    });
    fromLink.appendChild(field);
    fromLink.appendChild(take);
    E.exchange.appendChild(fromLink);
  }

  /* The shelf: a folder in the public repository of the app. The app reads
     it with no secret, and anybody may open a branch and drop a character
     there. */
  function shelfRows() {
    E.shelf.innerHTML = '';

    var address = document.createElement('div');
    address.className = 'srow';
    var input = document.createElement('input');
    input.className = 'cinput slim';
    input.type = 'text';
    input.value = C.shelfRepo();
    input.placeholder = 'NewbornAI/custom-sheet';
    input.setAttribute('aria-label', 'The repository that holds the shelf');
    input.addEventListener('input', function () {
      api.state.ui = api.state.ui || {};
      api.state.ui.shelf = input.value;
      api.save();
    });
    address.appendChild(input);
    E.shelf.appendChild(address);

    var row = document.createElement('div');
    row.className = 'srow';
    row.innerHTML = '<span class="t">The characters</span><span class="d">the ones the shelf holds</span>';
    var list = document.createElement('button');
    list.type = 'button';
    list.className = 'stog';
    list.textContent = 'Open';
    list.setAttribute('aria-label', 'The characters the shelf holds');
    list.addEventListener('click', openShelf);
    row.appendChild(list);
    E.shelf.appendChild(row);
  }

  /* A character of the shelf comes in. */
  function takeFrom(url) {
    C.importUrl(url).then(function (pkg) {
      if (!pkg) { C.toast('that one is not there'); return; }
      var answer = C.importPackage(JSON.stringify(pkg));
      C.toast(answer.ok ? answer.name + ' is here' : answer.why);
    }).catch(function (e) { C.toast(String((e && e.message) || e)); });
  }

  /* The window of the shelf: the characters of the main branch, then the
     branches, which are the shelves of the players. */
  function openShelf() {
    C.shelfCharacters('').then(function (chars) {
      return C.shelfBranches().then(function (branches) {
        var html = chars.map(function (c) {
          return '<div class="crow">' +
            '<span class="cn">' + C.esc(c.name) + '</span>' +
            '<button class="mini" type="button" data-take="' + C.esc(c.url) + '" aria-label="Bring ' + C.esc(c.name) + ' in">&darr;</button>' +
            '</div>';
        }).join('');
        if (!html) html = '<div class="empty">The shelf is empty.</div>';
        html += '<div class="crow"><span class="cn">The branches</span></div>';
        html += branches.map(function (b) {
          return '<div class="crow">' +
            '<span class="cn">' + C.esc(b) + '</span>' +
            '<button class="mini" type="button" data-open="' + C.esc(b) + '" aria-label="Open the branch ' + C.esc(b) + '">&rarr;</button>' +
            '</div>';
        }).join('');
        api.sheet.open({
          id: 'shelf',
          title: 'The shelf',
          metaClass: 'sheet-meta one',
          meta: '<span>The characters of the main branch, then the branches of the players.</span>',
          list: html,
          onList: function (ev) {
            var take = ev.target.closest('[data-take]');
            if (take) { takeFrom(take.dataset.take); return; }
            var open = ev.target.closest('[data-open]');
            if (open) openBranch(open.dataset.open);
          }
        });
      });
    }).catch(function (e) { C.toast(String((e && e.message) || e)); });
  }

  /* The characters of one branch. */
  function openBranch(name) {
    C.shelfCharacters(name).then(function (rows) {
      var html = rows.map(function (c) {
        return '<div class="crow">' +
          '<span class="cn">' + C.esc(c.name) + '</span>' +
          '<button class="mini" type="button" data-take="' + C.esc(c.url) + '" aria-label="Bring ' + C.esc(c.name) + ' in">&darr;</button>' +
          '</div>';
      }).join('');
      if (!html) html = '<div class="empty">This branch holds no character.</div>';
      api.sheet.open({
        id: 'shelfbranch',
        title: name,
        metaClass: 'sheet-meta one',
        meta: '<span>The characters of the branch.</span>',
        list: html,
        onList: function (ev) {
          var take = ev.target.closest('[data-take]');
          if (take) takeFrom(take.dataset.take);
        }
      });
    }).catch(function (e) { C.toast(String((e && e.message) || e)); });
  }

  /* The credits. The text of the rules comes from the System Reference
     Document, which is under Creative Commons Attribution 4.0, and the
     licence asks for this notice wherever the text is published. */
  function credits() {
    E.credits.innerHTML = '';
    var rows = [
      { t: 'The rules', d: 'The spells, the classes, the archetypes and the surge table come from the System Reference Document 5.2 by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd, under the Creative Commons Attribution 4.0 International Licence, https://creativecommons.org/licenses/by/4.0/legalcode. The text was taken from 5e.tools and laid out by this app; the app itself is not part of the SRD and is not under that licence.' },
      { t: 'The name', d: 'Dungeons & Dragons, D&D and the D20 logo are trademarks of Wizards of the Coast LLC. This app is not affiliated with, endorsed by or sponsored by Wizards of the Coast.' },
      { t: 'The font', d: 'Cinzel is under the SIL Open Font Licence 1.1.' },
      { t: 'The licence', d: 'The app is under the MIT licence. The text of the rules in the data files is under the Creative Commons Attribution 4.0 International Licence, and the NOTICE file of the repository says where it comes from.' }
    ];
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'srow';
      row.innerHTML = '<span class="t">' + C.esc(r.t) + '</span><span class="d">' + C.esc(r.d) + '</span>';
      E.credits.appendChild(row);
    });
  }

  Sheet.page({
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
      '  <p class="note">A character is a package: the data in JSON. It can leave as a file or as a link, and come back in by either. Nothing has to be typed.</p>',
      '  <div class="cshead"><span>The shelf</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsShelf"></div>',
      '  <p class="note">The shelf is a folder in the public repository of the app. The app reads it with no secret, and anybody may open a branch and drop a character there.</p>',
      '  <div class="cshead"><span>Credits</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsCredits"></div>',
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
        shelf: root.querySelector('#settingsShelf'),
        credits: root.querySelector('#settingsCredits'),
        update: root.querySelector('#settingsUpdate')
      };
    },

    render: function (a) {
      api = a;
      E.list.innerHTML = '';
      files();
      update();
      exchange();
      shelfRows();
      credits();
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
