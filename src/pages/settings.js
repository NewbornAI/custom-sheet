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

    /* A character from a link. The window is the one the ways in use, so a
       link is read the same way wherever it is offered. */
    var fromLink = document.createElement('div');
    fromLink.className = 'srow';
    fromLink.innerHTML = '<span class="t">From a link</span><span class="d">a link that carries the character</span>';
    var paste = document.createElement('button');
    paste.type = 'button';
    paste.className = 'stog';
    paste.textContent = 'Paste';
    paste.setAttribute('aria-label', 'Bring in the character a link carries');
    paste.addEventListener('click', function () { C.openPasteLink(); });
    fromLink.appendChild(paste);
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

    /* The connection. The phone asks GitHub for a code and the player
       approves it in the browser, so nothing is typed. A page of a browser
       cannot ask GitHub for that, so it takes a token pasted instead, and a
       paste is accurate where a typing is not. */
    var sign = document.createElement('div');
    sign.className = 'srow';
    var signed = C.ghLogin();
    var waiting = !signed && C.ghPending();
    var last = (api.state.ui && api.state.ui.ghLast) || '';
    sign.innerHTML = '<span class="t">The connection</span><span class="d">' +
      C.esc(signed ? 'signed in as ' + signed
        : (waiting ? 'waiting for the approval' + (last ? ', GitHub says ' + last : '')
        : 'not signed in')) + '</span>';
    if (signed) {
      var out = document.createElement('button');
      out.type = 'button';
      out.className = 'stog';
      out.textContent = 'Leave';
      out.setAttribute('aria-label', 'Leave the connection to GitHub');
      out.addEventListener('click', function () {
        C.ghSetToken('');
        C.ghSetLogin('');
        C.toast('the connection is closed');
        api.refresh();
      });
      sign.appendChild(out);
    } else if (waiting) {
      var again = document.createElement('button');
      again.type = 'button';
      again.className = 'stog';
      again.textContent = 'Check';
      again.setAttribute('aria-label', 'Ask GitHub whether the code was approved');
      again.addEventListener('click', function () {
        C.ghWait(function (ok, why) {
          if (ok) api.refresh();
          else if (why) C.toast(String(why));
        });
      });
      sign.appendChild(again);
    } else if (C.isPhone()) {
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'stog';
      go.textContent = 'Connect';
      go.setAttribute('aria-label', 'Connect to GitHub');
      go.addEventListener('click', connect);
      sign.appendChild(go);
    } else {
      var tokenField = document.createElement('input');
      tokenField.className = 'cinput slim';
      tokenField.type = 'password';
      tokenField.placeholder = 'a token to paste';
      tokenField.setAttribute('aria-label', 'A token to paste');
      var use = document.createElement('button');
      use.type = 'button';
      use.className = 'stog';
      use.textContent = 'Use';
      use.setAttribute('aria-label', 'Use that token');
      use.addEventListener('click', function () {
        var value = (tokenField.value || '').trim();
        if (!value) { C.toast('there is no token in the field'); return; }
        C.ghSetToken(value);
        window.SheetGit.whoAmI(value).then(function (login) {
          C.ghSetLogin(login);
          C.toast('signed in as ' + login);
          api.refresh();
        }).catch(function (e) { C.toast(String((e && e.message) || e)); });
      });
      sign.appendChild(tokenField);
      sign.appendChild(use);
    }
    E.shelf.appendChild(sign);

    /* A shelf of one's own: a new repository, or a fork of the one of the
       project. */
    var own = document.createElement('div');
    own.className = 'srow';
    own.innerHTML = '<span class="t">A shelf of my own</span><span class="d">a repository of mine</span>';
    var mine = document.createElement('button');
    mine.type = 'button';
    mine.className = 'stog';
    mine.textContent = 'New';
    mine.setAttribute('aria-label', 'Create a repository of my own');
    mine.addEventListener('click', function () { ownRepo(); });
    own.appendChild(mine);
    var fork = document.createElement('button');
    fork.type = 'button';
    fork.className = 'stog';
    fork.textContent = 'Fork';
    fork.setAttribute('aria-label', 'Fork the shelf of the project');
    fork.addEventListener('click', function () { ownFork(); });
    own.appendChild(fork);
    E.shelf.appendChild(own);

    /* Where a character is written: the main branch holds the shared ones,
    /* Where a character is written. The main branch holds the shared ones,
       a branch of one's own holds the ones that are not ready yet. */
    var where = document.createElement('div');
    where.className = 'srow';
    var whereTitle = document.createElement('span');
    whereTitle.className = 't';
    whereTitle.textContent = 'The character being played';
    where.appendChild(whereTitle);
    var branch = document.createElement('input');
    branch.className = 'cinput slim';
    branch.type = 'text';
    branch.value = C.ghBranch();
    branch.placeholder = 'main';
    branch.setAttribute('aria-label', 'The branch to write to');
    branch.addEventListener('input', function () { C.ghSetBranch(branch.value.trim() || 'main'); });
    where.appendChild(branch);
    var send = document.createElement('button');
    send.type = 'button';
    send.className = 'stog';
    send.textContent = 'Put';
    send.setAttribute('aria-label', 'Put the character being played on the shelf');
    send.addEventListener('click', function () { putOnShelf(); });
    where.appendChild(send);
    E.shelf.appendChild(where);

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

  /* The device flow: the app asks GitHub for a code, the player reads it in
     the browser, and the shell waits for the token, in the background as
     well as here, so the approval is never lost. */
  function connect() {
    C.toast('asking GitHub for a code');
    C.ghBegin().then(function (answer) {
      var where = answer.verification_uri || 'https://github.com/login/device';
      api.sheet.open({
        id: 'ghconnect',
        title: 'Connect to GitHub',
        metaClass: 'sheet-meta one',
        meta: '<span>Open GitHub, read the code, approve it. The app waits.</span>' +
          '<div class="crow"><span class="cn">' + C.esc(answer.user_code) + '</span>' +
          '<a class="mini" href="' + C.esc(where) + '" target="_blank" rel="noreferrer" aria-label="Open GitHub">&#8599;</a></div>',
        actions: [{
          label: 'Open GitHub',
          onClick: function () { C.openUrl(where); }
        }]
      });
      /* The row says it is waiting, so it is painted again as soon as the
         wait starts. */
      api.refresh();
      C.ghWait(function (ok, why) {
        if (ok) { api.sheet.close(); api.refresh(); return; }
        if (why) C.toast(String(why));
        api.refresh();
      });
    }).catch(function (e) { C.toast(String((e && e.message) || e)); });
  }

  /* A repository of the player, and the shelf points at it. */
  function ownRepo() {
    if (!C.ghToken()) { C.toast('connect to GitHub first'); return; }
    window.SheetGit.whoAmI(C.ghToken()).then(function (login) {
      var name = 'custom-sheet-' + login;
      return C.shelfCreateRepo(name, false).then(function (full) {
        if (!full) { C.toast('GitHub did not answer'); return; }
        api.state.ui = api.state.ui || {};
        api.state.ui.shelf = full;
        api.save();
        C.toast(full + ' is your shelf');
        api.refresh();
      });
    }).catch(function (e) { C.toast(String((e && e.message) || e)); });
  }

  /* A fork of the shelf of the project. */
  function ownFork() {
    if (!C.ghToken()) { C.toast('connect to GitHub first'); return; }
    C.shelfFork().then(function (full) {
      if (!full) { C.toast('GitHub did not answer'); return; }
      api.state.ui = api.state.ui || {};
      api.state.ui.shelf = full;
      api.save();
      C.toast(full + ' is your shelf');
      api.refresh();
    }).catch(function (e) { C.toast(String((e && e.message) || e)); });
  }

  /* The character being played goes on the shelf, as a package, one file per
     character, on the branch that is named. */
  function putOnShelf() {
    C.toast('putting it on the shelf');
    C.pushToShelf(api.character()).then(function (url) {
      C.toast('it is on the shelf');
      showAddress(url);
    }).catch(function (e) { C.toast(String((e && e.message) || e)); });
  }

  /* The address of the file on GitHub, which is a link anyone can open and
     which holds the character itself. It is the way to a character that does
     not travel in a message. */
  function showAddress(url) {
    if (!url || !E.address) return;
    E.address.innerHTML = '';
    var row = document.createElement('div');
    row.className = 'srow';
    var title = document.createElement('span');
    title.className = 't';
    title.textContent = 'The file on GitHub';
    row.appendChild(title);
    var field = document.createElement('input');
    field.className = 'cinput slim';
    field.type = 'text';
    field.readOnly = true;
    field.value = url;
    field.setAttribute('aria-label', 'The address of the file on GitHub');
    row.appendChild(field);
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'stog';
    copy.textContent = 'Copy';
    copy.setAttribute('aria-label', 'Copy the address of the file');
    copy.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { C.toast('the address is in the clipboard'); })
          .catch(function () { C.toast('the address is in the field above'); });
        return;
      }
      C.toast('the address is in the field above');
    });
    row.appendChild(copy);
    E.address.appendChild(row);
  }
  /* A character of the shelf comes in. */
  function takeFrom(url) {
    C.importUrl(url).then(function (pkg) {
      if (!pkg) { C.toast('that one is not there'); return; }
      var answer = C.importPackage(JSON.stringify(pkg));
      C.toast(answer.ok ? answer.name + ' is here' : answer.why);
    }).catch(function (e) { C.toast(String((e && e.message) || e)); });
  }

  /* A character of the shelf can be taken off it, when the app is the one
     that put it there. */
  function takeOff(name) {
    if (!C.ghToken()) { C.toast('connect to GitHub first'); return; }
    C.shelfRemove(name).then(function () {
      C.toast(name + ' is off the shelf');
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
            (C.ghToken() ? '<button class="mini" type="button" data-off="' + C.esc(c.name) + '" aria-label="Take ' + C.esc(c.name) + ' off the shelf">&times;</button>' : '') +
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
            var off = ev.target.closest('[data-off]');
            if (off) { takeOff(off.dataset.off); return; }
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
      '  <div class="fcards" id="settingsAddress"></div>',
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
        address: root.querySelector('#settingsAddress'),
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
      if (E.address) E.address.innerHTML = '';
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
