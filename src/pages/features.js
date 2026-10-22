/* The features page: what the character has, what is left of it, and the
   rests that give it back. */
(function () {
  'use strict';

  var C = Sheet.core;
  var SR = C.SR;

  var api = null;   /* the shell gives it at mount */
  var E = {};       /* the elements of the page */

  var deleting = null;
  var editingFeatures = false;
  var dragged = false;
  var built = null;   /* the character the cards were built for */

  /* The library lands after the page does, and the shell repaints when it
     does, so the map is the one the shell fills. */
  var FEATURE_BY_KEY = C.featureByKey;

  var NEW_TYPES = [
    { id: 'short', label: 'short rest' },
    { id: 'long', label: 'long rest' },
    { id: 'special', label: 'special' },
    { id: 'passive', label: 'passive' }
  ];

  function commitChar() { api.save(); api.refresh(); }

  function features() { return api.character().char.features; }

  /* The feature waiting to be removed, and the question under it. */
  function featureByKey(key) {
    var found = null;
    features().forEach(function (f) { if (f.key === key) found = f; });
    return found;
  }

  function featureCount(f) {
    if (f.bind === 'warlock') {
      var S = api.character().spells;
      return {
        left: Number(S.warlockLeft) || 0,
        max: Number(S.warlockMax) || 0
      };
    }
    return { left: Number(f.left) || 0, max: Number(f.max) || 0 };
  }

  function eyeSvg(hidden) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<path d="M2 12s3.7-6.5 10-6.5S22 12 22 12s-3.7 6.5-10 6.5S2 12 2 12z"/>' +
      '<circle cx="12" cy="12" r="2.6"/>' +
      (hidden ? '<path d="M3.5 3.5l17 17"/>' : '') +
      '</svg>';
  }

  /* The uses of a feature: how many are left and when they come back. */
  function usesText(f) {
    if (f.cost === 'sp') return '1 SP';
    if (!f.max) return '';
    if (f.recovery === 'short' || f.recovery === 'long') return f.left + ' / ' + f.recovery;
    return String(f.left);
  }

  function recoveryWord(f) {
    if (f.recovery === 'short' || f.recovery === 'long') return f.recovery;
    if (f.recovery === 'special') return 'special';
    return '';
  }

  /* ---- the cards ---- */

  function buildFeatureCards() {
    E.featureActive.innerHTML = '';
    E.featurePassive.innerHTML = '';
    features().forEach(function (f) {
      var card = document.createElement('div');
      card.className = 'fcard';
      card.dataset.key = f.key;
      card.innerHTML =
        '<div class="top"><span class="t" data-role="name"></span>' +
        '<span class="fsrc"></span>' +
        '<button class="fuses" type="button" data-role="uses"></button>' +
        '<input class="fusesin" type="number" inputmode="numeric" min="0" max="99" data-role="usesin" aria-label="Uses left">' +
        '<span class="fslash">/</span>' +
        '<input class="fmaxin" type="number" inputmode="numeric" min="0" max="99" data-role="maxin" aria-label="Maximum uses">' +
        '<span class="frec"></span></div>' +
        '<div class="fm"><span class="fdesc"></span>' +
        '<button class="feye" type="button" data-role="eye" aria-label="Hide the feature"></button>' +
        '<button class="fdel" type="button" data-role="del" aria-label="Remove the feature">&times;</button></div>' +
        '<div class="fconfirm"><span>Remove it?</span>' +
        '<button class="yes" type="button" data-role="yes">Remove</button>' +
        '<button class="no" type="button" data-role="no">Keep</button></div>';
      (f.active ? E.featureActive : E.featurePassive).appendChild(card);
    });
  }

  function renderFeatureCards() {
    E.featureBody.classList.toggle('editing', editingFeatures);
    features().forEach(function (f) {
      var card = E.featureBody.querySelector('.fcard[data-key="' + f.key + '"]');
      if (!card) return;
      var data = FEATURE_BY_KEY[f.key] || {};
      card.classList.toggle('hidden', !!f.hidden);

      var name = card.querySelector('[data-role="name"]');
      name.textContent = f.name;
      name.setAttribute('aria-label', 'Read ' + f.name);

      card.querySelector('.fsrc').innerHTML = C.sourceTag(f.source);

      var text = usesText(f);
      var uses = card.querySelector('[data-role="uses"]');
      uses.textContent = text;
      uses.hidden = !text;
      uses.classList.toggle('sp', f.recovery === 'sp');
      uses.setAttribute('aria-label', f.name + ': ' + text);

      /* A feature of the library starts with no counter, so the two fields
         are there in the edit mode for the player to give it one. */
      var input = card.querySelector('[data-role="usesin"]');
      if (input && document.activeElement !== input) input.value = String(f.left || 0);
      input.hidden = !f.max && !editingFeatures;

      var maxInput = card.querySelector('[data-role="maxin"]');
      if (maxInput && document.activeElement !== maxInput) maxInput.value = String(f.max || 0);
      maxInput.hidden = !f.max && !editingFeatures;

      var rec = card.querySelector('.frec');
      rec.textContent = editingFeatures ? (recoveryWord(f) ? ' ' + recoveryWord(f) : '') : '';

      var bits = [];
      if (data.desc) bits.push(data.desc);
      if (data.action) bits.push(data.action);
      if (data.duration) bits.push(data.duration);
      card.querySelector('.fdesc').textContent = bits.join(' \u00b7 ');

      var eye = card.querySelector('[data-role="eye"]');
      eye.innerHTML = eyeSvg(f.hidden);
      eye.setAttribute('aria-label', f.hidden ? 'Show the feature' : 'Hide the feature');

      card.classList.toggle('confirming', deleting === f.key);
    });
  }

  /* ---- the description of a feature ---- */

  function openFeature(key) {
    var f = featureByKey(key);
    if (!f) return;
    var data = FEATURE_BY_KEY[key] || {};
    var meta = C.field('Source', f.source);
    if (f.max || f.recovery === 'sp') meta += C.field('Uses', usesText(f));
    if (data.action) meta += C.field('Action', data.action);
    if (data.duration) meta += C.field('Duration', data.duration);
    if (f.recovery === 'sp') meta += C.field('Cost', '1 sorcery point');
    else if (f.recovery && f.recovery !== 'none') meta += C.field('Recovery', f.recovery + ' rest');

    api.sheet.open({
      id: 'feature:' + key,
      title: f.name,
      meta: meta + C.sourceTag(f.source),
      text: C.renderBlocks(data.blocks)
    });
  }

  /* ---- the creation of a feature: a name and a recovery type ---- */

  function openNewFeature() {
    var picked = 'short';
    api.sheet.open({
      id: 'newfeature',
      title: 'New feature',
      metaClass: 'sheet-meta one',
      meta: '<input class="sheet-search" id="featureName" type="text" placeholder="Name of the feature" aria-label="Name of the feature">',
      text: '<div class="fnew">' + NEW_TYPES.map(function (t) {
        return '<button class="fnewtype" type="button" data-type="' + t.id + '">' + t.label + '</button>';
      }).join('') + '</div>',
      actions: [{
        label: 'Create',
        onClick: function (root) {
          var field = root.querySelector('#featureName');
          var name = (field && field.value ? field.value : '').trim() || 'New feature';
          var passive = picked === 'passive';
          features().push({
            key: 'f' + Date.now(),
            name: name,
            source: 'Feat',
            active: !passive,
            recovery: picked,
            cost: '',
            bind: null,
            max: passive ? 0 : 1,
            left: passive ? 0 : 1,
            short: null,
            hidden: false
          });
          buildFeatureCards();
          api.sheet.close();
          commitChar();
        }
      }],
      onPaint: function (root) {
        var buttons = root.querySelectorAll('.fnewtype');
        Array.prototype.forEach.call(buttons, function (b) {
          b.addEventListener('click', function () {
            picked = b.dataset.type;
            Array.prototype.forEach.call(buttons, function (x) { x.classList.toggle('on', x === b); });
          });
        });
        if (buttons[0]) buttons[0].classList.add('on');
      }
    });
  }

  /* ---- one tap spends a use, and at zero it gives one back. The bend luck
     feature costs a sorcery point rather than a use. ---- */

  function spendFeature(f) {
    var S = api.character().spells;
    if (f.cost === 'sp') {
      if (S.sp > 0) {
        S.sp -= 1;
        api.toast('\u22121 sorcery point \u00b7 ' + S.sp + ' left');
      } else {
        S.sp = S.spMax;
        api.toast('The sorcery point is back \u00b7 ' + S.sp + ' left');
      }
      commitChar();
      C.bumpSp();
      return;
    }
    var count = featureCount(f);
    var next = count.left > 0 ? count.left - 1 : (count.max > 0 ? 1 : count.left);
    if (next === count.left) return;
    C.pushSnapshot(api);
    if (f.bind === 'warlock') S.warlockLeft = next;
    else f.left = next;
    commitChar();
  }

  /* The order the cards sit in becomes the order of the list. */
  function saveFeatureOrder(list) {
    var keys = Array.prototype.slice.call(list.querySelectorAll('.fcard')).map(function (c) { return c.dataset.key; });
    var byKey = {};
    features().forEach(function (f) { byKey[f.key] = f; });
    var others = features().filter(function (f) { return keys.indexOf(f.key) < 0; });
    api.character().char.features = keys.map(function (k) { return byKey[k]; }).concat(others);
    api.save();
    renderFeatureCards();
  }

  /* ---- the page ---- */

  Sheet.page({
    id: 'features',
    title: 'Features',
    order: 3,
    blurb: 'What the character has and what is left of it.',
    html: [
      '<div class="charbody" id="featureBody">',
      '  <div class="cshead"><span>Active</span><span class="rule"></span><button class="mini" id="addFeature" type="button" aria-label="Add a feature">+</button></div>',
      '  <div class="fcards" id="featureActive"></div>',
      '  <div class="cshead"><span>Passive</span><span class="rule"></span></div>',
      '  <div class="fcards" id="featurePassive"></div>',
      '</div>'
    ].join('\n'),

    mount: function (root, a) {
    a.core.data('features');
      api = a;
      E = {
        featureBody: root.querySelector('#featureBody'),
        featureActive: root.querySelector('#featureActive'),
        featurePassive: root.querySelector('#featurePassive'),
        addFeature: root.querySelector('#addFeature')
      };

      buildFeatureCards();
      built = a.state.current + '|' + features().map(function (f) { return f.key; }).join(',');

      E.featureBody.addEventListener('input', function (ev) {
        var roleEl = ev.target.closest ? ev.target.closest('[data-role]') : null;
        if (!roleEl || (roleEl.dataset.role !== 'usesin' && roleEl.dataset.role !== 'maxin')) return;
        var card = roleEl.closest('.fcard');
        if (!card) return;
        var f = featureByKey(card.dataset.key);
        if (!f) return;
        if (roleEl.dataset.role === 'usesin') {
          f.left = Math.max(0, Math.min(99, Number(roleEl.value) || 0));
        } else if (roleEl.dataset.role === 'maxin') {
          f.max = Math.max(0, Math.min(99, Number(roleEl.value) || 0));
          if (f.left > f.max) f.left = f.max;
        } else return;
        commitChar();
      });

      E.featureBody.addEventListener('click', function (ev) {
        var card = ev.target.closest('.fcard');
        if (!card) return;
        var f = featureByKey(card.dataset.key);
        if (!f) return;
        /* The eye holds a drawing, so the role is found from the closest
           element that carries one. */
        var roleEl = ev.target.closest ? ev.target.closest('[data-role]') : null;
        var role = roleEl ? roleEl.dataset.role : null;

        if (role === 'uses') { spendFeature(f); return; }
        if (role === 'name') { openFeature(f.key); return; }

        if (!editingFeatures) return;

        if (role === 'eye') {
          f.hidden = !f.hidden;
          f.toggled = true;
          commitChar();
          return;
        }
        if (role === 'del') {
          deleting = f.key;
          commitChar();
          return;
        }
        if (role === 'no') {
          deleting = null;
          commitChar();
          return;
        }
        if (role === 'yes') {
          api.character().char.features = features().filter(function (x) { return x.key !== f.key; });
          deleting = null;
          buildFeatureCards();
          commitChar();
        }
      });

      /* The cards can be dragged to reorder them, the way the spell list
         does. A press that turns into a move carries the card, a press that
         ends straight away is a tap. */
      E.featureBody.addEventListener('pointerdown', function (ev) {
        if (ev.target.closest('input, button')) return;
        var card = ev.target.closest('.fcard');
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
          var list = card.parentNode;
          var cards = Array.prototype.slice.call(list.querySelectorAll('.fcard'));
          for (var i = 0; i < cards.length; i++) {
            var r = cards[i].getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2 && cards[i] !== card) {
              list.insertBefore(card, cards[i]);
              startY = e.clientY;
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
            saveFeatureOrder(card.parentNode);
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

      E.addFeature.addEventListener('click', function () { openNewFeature(); });
    },

    /* The wrench edits the features. */
    head: function (root, a) {
      api = a;
      var b = C.wrenchButton('Edit the features', function () {
        editingFeatures = !editingFeatures;
        api.save();
        api.refresh();
      });
      root.appendChild(b);
      E.wrench = b;
    },

    render: function (a) {
      api = a;
      /* The cards are built for one character and for the features it
         holds. Playing another one builds its own list, so the first
         character's cards never stay on screen, and a feature plugged into
         the character while it is on screen gets a card of its own. */
      var signature = a.state.current + '|' + features().map(function (f) { return f.key; }).join(',');
      if (built !== signature) {
        built = signature;
        buildFeatureCards();
      }
      if (E.wrench) E.wrench.setAttribute('aria-pressed', editingFeatures ? 'true' : 'false');
      renderFeatureCards();
    }
  });
})();
