/* The volley page: the spell slider, the toggles, the beams and the tally. */
(function () {
  'use strict';

  var C = Volley.core;
  var R = C.R;

  var api = null;   /* the shell gives it at mount */
  var E = {};       /* the elements of the page */
  var S = {};       /* the state of the page */

  var CHIPS = [
    { key: 'advantage', label: 'Adv',      rgb: '154,209,255' },
    { key: 'hex',       label: 'Hex',      rgb: '122,216,111' },
    { key: 'curse',     label: 'Curse',    rgb: '255,111,168' },
    { key: 'elem',      label: 'Elem',     rgb: '255,212,71' },
    { key: 'elemPlus',  label: '+3d8',     rgb: '255,176,59', needs: 'elem' },
    { key: 'quicken',   label: 'Quicken',  rgb: '92,214,220', only: 'eb' }
  ];

  var TYPE_RGB = {
    force: '110,155,255',
    fire: '255,132,70',
    lightning: '255,212,71',
    necrotic: '122,216,111'
  };

  var volley = null;
  var ATK = R.ATTACK_MOD;   /* the attack bonus of the caster */
  var FLAT = 0;             /* the modifier that rides on the damage */

  function commit() { api.save(); api.refresh(); }

  /* The state of the caster, with the numbers of the character sheet in
     it: the attack bonus and the modifier the damage carries. */
  function casting() {
    var st = Object.assign({}, S);
    var ch = api.state.char;
    if (ch && ch.abilities) {
      st.attackMod = C.SR.spellAttack(ch);
      st.flatMod = C.SR.abilityMod(ch.abilities.cha);
    }
    return st;
  }

  function setState(patch) {
    Object.keys(patch).forEach(function (k) { S[k] = patch[k]; });
    if (!S.elem) S.elemPlus = false;
    if (S.power !== 'eb') S.quicken = false;
    volley = null;
    commit();
  }

  function elemLabel() {
    if (!S.elem) return 'Elem';
    return S.elemPlus ? 'Elem 3d8' : 'Elem 2d8';
  }

  /* ---- the board ---- */

  function previewGroups() {
    var power = R.powerOf(S.power);
    var groups = [];
    power.dice.forEach(function (d) { groups.push({ label: d.n + 'd' + d.s, type: d.type }); });
    if (S.hex) groups.push({ label: '1d6', type: 'necrotic' });
    if (S.elem) groups.push({ label: S.elemPlus ? '3d8' : '2d8', type: 'lightning' });
    return groups;
  }

  function cellHtml(beam) {
    if (!beam) {
      var groups = previewGroups();
      var types = [];
      groups.forEach(function (g) { if (types.indexOf(g.type) === -1) types.push(g.type); });
      var power = R.powerOf(S.power);
      var flat = FLAT + (S.curse ? 4 : 0);
      var flatType = R.primaryType(power);
      var out = '<div class="atk"><span class="at ghostnum">d20</span><span class="am">+' + ATK + '</span></div>';
      out += '<div class="d20"><span class="ghostroll">--</span></div>';
      out += '<div class="beam"></div>';
      out += '<div class="dmg"><div class="dtop"><span class="dt ghostnum">--</span><span class="kinds">';
      types.forEach(function (t) { out += '<em class="' + t + '">' + t + '</em>'; });
      out += '</span></div><div class="dice">';
      groups.forEach(function (g) {
        out += '<span class="g"><span class="lbl ' + g.type + '">' + g.label + '</span>';
        out += '<span class="roll ghostroll">--</span></span>';
      });
      if (flat) out += '<span class="g flat"><span class="lbl ' + flatType + '">+' + flat + '</span></span>';
      out += '</div></div>';
      return out;
    }

    var out = '<div class="atk">';
    out += '<span class="at">' + beam.total + '</span>';
    out += '<span class="am">+' + ATK + '</span>';
    if (beam.crit) out += '<span class="badge crit">crit</span>';
    else if (beam.hit === true) out += '<span class="badge hit">hit</span>';
    else if (beam.hit === false) out += '<span class="badge miss">miss</span>';
    out += '</div>';

    out += '<div class="d20">';
    beam.rolls.forEach(function (r) {
      out += '<span' + (r === beam.kept && beam.rolls.length > 1 ? ' class="kept"' : '') + '>' + r + '</span>';
    });
    out += '</div>';
    out += '<div class="beam"></div>';

    var types = [], i;
    for (i = 0; i < beam.groups.length; i++) {
      if (types.indexOf(beam.groups[i].type) === -1) types.push(beam.groups[i].type);
    }
    /* the flat bonus is damage of the spell's own type */
    var flatType = R.primaryType(R.powerOf(S.power));

    out += '<div class="dmg"><div class="dtop"><span class="dt">' + beam.damage + '</span><span class="kinds">';
    types.forEach(function (t) { out += '<em class="' + t + '">' + t + '</em>'; });
    out += '</span></div>';

    out += '<div class="dice">';
    beam.groups.forEach(function (g) {
      out += '<span class="g"><span class="lbl ' + g.type + '">' + g.label + '</span>';
      out += '<span class="roll' + (g.rolls.length > 3 ? ' tight' : '') + '">' + g.rolls.join(',') + '</span></span>';
    });
    if (beam.flat) out += '<span class="g flat"><span class="lbl ' + flatType + '">+' + beam.flat + '</span></span>';
    out += '</div></div>';

    return out;
  }

  function renderBoard(animate) {
    var power = R.powerOf(S.power);
    var n = power.attacks;
    var count = R.beamCount(S);
    var quick = R.quickened(S);
    E.grid.style.setProperty('--cols', n === 4 ? '2' : '3');
    E.grid.classList.toggle('quick', quick);
    E.grid.innerHTML = '';

    for (var i = 0; i < count; i++) {
      /* the quickened cast starts a second row */
      if (quick && i === n) {
        var sep = document.createElement('div');
        sep.className = 'rowsep';
        sep.innerHTML = '<span>Quickened</span>';
        E.grid.appendChild(sep);
      }
      var beam = volley ? volley.beams[i] : null;
      var cell = document.createElement('article');
      cell.className = 'cell' + (beam && beam.quick ? ' quick' : '');
      var preview = beam ? beam.groups : previewGroups();
      cell.style.setProperty('--beam', TYPE_RGB[preview[0] ? preview[0].type : 'force'] || '155,123,255');
      if (!animate) cell.style.animation = 'none';
      cell.style.setProperty('--i', String(i));
      if (beam) {
        if (beam.crit) cell.classList.add('crit');
        if (beam.hit === false) cell.classList.add('miss');
      } else {
        cell.classList.add('ghost');
      }
      cell.innerHTML = cellHtml(beam);
      E.grid.appendChild(cell);
    }
  }

  function renderSummary() {
    var power = R.powerOf(S.power);
    var count = R.beamCount(S);
    /* The flat bonus is damage of the spell's own type, the curse one too. */
    var flat = FLAT + (S.curse ? 4 : 0);
    var beams = count + ' beam' + (count === 1 ? '' : 's');
    var attack = S.advantage
      ? 'attack 3d20+' + ATK + ' keep best'
      : 'attack d20+' + ATK;
    var crit = S.curse ? 'crit on 19-20' : 'crit on 20';
    var head = beams + (R.quickened(S) ? ' &middot; quickened' : '') +
      ' &middot; ' + attack + ' &middot; ' + crit;

    var bits = [];
    power.dice.forEach(function (d, i) {
      bits.push(d.n + 'd' + d.s + (i === 0 && flat ? '+' + flat : '') +
        ' <em class="' + d.type + '">' + d.type + '</em>');
    });
    if (S.hex) bits.push('1d6 <em class="necrotic">necrotic</em>');
    var light = 0;
    if (S.elem) light = S.elemPlus ? 3 : 2;
    if (light) bits.push(light + 'd8 <em class="lightning">lightning</em>');

    E.summary.innerHTML =
      '<span>' + head + '</span>' +
      '<span>damage ' + bits.join(' + ') + '</span>';
  }

  function renderTally() {
    if (!volley) {
      E.tally.innerHTML = S.ac === null
        ? '<span style="color:#615c7d">No target AC set, so damage shows for every beam</span>'
        : '';
      return;
    }
    var t = R.tally(volley, S.ac);
    var out = '<span class="big">' + t.total + '</span><span>damage</span>';
    if (S.ac !== null) {
      out += '<span>&middot; ' + t.hits + ' hit' + (t.hits === 1 ? '' : 's');
      if (t.crits) out += ' &middot; ' + t.crits + ' crit' + (t.crits === 1 ? '' : 's');
      out += '</span>';
    }
    /* the flat bonus sits in its own type, so the tally shows it there */
    t.order.forEach(function (type) {
      out += '<em class="' + type + '">&middot; ' + t.byType[type] + ' ' + type + '</em>';
    });
    E.tally.innerHTML = out;
  }

  /* ---- the page ---- */

  Volley.page({
    id: 'volley',
    title: 'Volley',
    order: 1,
    blurb: 'The spell slider, the toggles and the beams.',
    html: [
      '<div class="slider">',
      '  <input id="power" type="range" min="0" max="4" step="1" value="0" aria-label="Spell power">',
      '  <div class="stops" id="stops"></div>',
      '</div>',
      '<div class="chips" id="chips"></div>',
      '<div class="summary" id="summary"></div>',
      '<div class="board" id="board">',
      '  <div class="grid" id="grid"></div>',
      '</div>',
      '<div class="tally" id="tally"></div>',
      '<button class="cast" id="cast">',
      '  <span id="castLabel">Cast</span>',
      '  <svg class="mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '    <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width=".8"/>',
      '    <path d="M12 2.2V6M12 18v3.8M2.2 12H6M18 12h3.8" stroke="currentColor" stroke-width=".8"/>',
      '    <path d="M12 6.4L17.6 12 12 17.6 6.4 12z" fill="none" stroke="currentColor" stroke-width="1"/>',
      '  </svg>',
      '</button>'
    ].join('\n'),

    seed: function (saved) {
      var s = {
        power: 'eb', advantage: false, hex: false, curse: false,
        elem: false, elemPlus: false, quicken: false, ac: null
      };
      if (saved && typeof saved === 'object') {
        Object.keys(s).forEach(function (k) {
          if (saved[k] !== undefined && saved[k] !== null) s[k] = saved[k];
        });
      }
      if (!R.powerOf || s.power !== R.powerOf(s.power).id) s.power = 'eb';
      if (!s.elem) s.elemPlus = false;
      if (s.power !== 'eb') s.quicken = false;
      if (s.ac === '' || s.ac === null || isNaN(Number(s.ac))) s.ac = null;
      else s.ac = Number(s.ac);
      return s;
    },

    mount: function (root, a) {
      api = a;
      S = a.state.volley;
      E = {
        power: root.querySelector('#power'),
        stops: root.querySelector('#stops'),
        chips: root.querySelector('#chips'),
        summary: root.querySelector('#summary'),
        grid: root.querySelector('#grid'),
        tally: root.querySelector('#tally'),
        cast: root.querySelector('#cast'),
        ac: null
      };

      E.power.addEventListener('input', function () {
        var p = R.POWERS[Number(E.power.value)];
        setState({ power: p.id });
      });

      R.POWERS.forEach(function (p, i) {
        var stop = document.createElement('button');
        stop.type = 'button';
        stop.className = 'stop';
        stop.textContent = p.short;
        stop.style.left = 'calc(13px + (100% - 26px) * ' + (i / (R.POWERS.length - 1)) + ')';
        stop.addEventListener('click', function () {
          E.power.value = String(i);
          setState({ power: p.id });
        });
        E.stops.appendChild(stop);
      });

      CHIPS.forEach(function (chip) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.dataset.key = chip.key;
        b.textContent = chip.label;
        b.style.setProperty('--crgb', chip.rgb);
        b.addEventListener('click', function () {
          var next = !S[chip.key];
          var patch = {};
          patch[chip.key] = next;
          if (chip.key === 'elem' && !next) patch.elemPlus = false;
          setState(patch);
        });
        E.chips.appendChild(b);
      });

      E.cast.addEventListener('click', function () {
        volley = R.rollVolley(casting());
        renderBoard(true);
        renderTally();
        var anyCrit = volley.beams.some(function (b) { return b.crit; });
        if (navigator.vibrate) navigator.vibrate(anyCrit ? [14, 45, 18] : 16);
      });
    },

    /* The target armor class sits in the head of the app, next to the name
       of the spell. */
    head: function (root, a) {
      api = a;
      S = a.state.volley;
      var wrap = document.createElement('label');
      wrap.className = 'ac';
      wrap.id = 'acField';
      wrap.innerHTML = '<span>AC</span><input id="ac" type="number" inputmode="numeric" min="1" max="40" step="1" placeholder="—" aria-label="Target armor class">';
      root.appendChild(wrap);
      E.ac = wrap.querySelector('#ac');
      E.ac.addEventListener('input', function () {
        var v = E.ac.value.trim();
        setState({ ac: v === '' ? null : Number(v) });
      });
    },

    render: function (a) {
      api = a;
      S = a.state.volley;
      var st = casting();
      ATK = R.attackMod(st);
      FLAT = R.flatMod(st, R.powerOf(S.power));
      var power = R.powerOf(S.power);

      E.power.value = String(R.POWERS.indexOf(power));
      var span = Number(E.power.max) - Number(E.power.min);
      E.power.style.setProperty('--fill', (span ? (Number(E.power.value) - Number(E.power.min)) / span * 100 : 0) + '%');

      Array.prototype.forEach.call(E.stops.children, function (s, i) {
        s.classList.toggle('on', R.POWERS[i].id === power.id);
      });

      Array.prototype.forEach.call(E.chips.children, function (b) {
        var key = b.dataset.key;
        var chip = CHIPS.filter(function (c) { return c.key === key; })[0];
        b.setAttribute('aria-pressed', S[key] ? 'true' : 'false');
        if (key === 'elem') b.textContent = elemLabel();
        if (chip.only) b.hidden = S.power !== chip.only;
        if (chip.needs) b.hidden = !S[chip.needs];
      });

      if (E.ac && E.ac.value !== (S.ac === null ? '' : String(S.ac))) {
        E.ac.value = S.ac === null ? '' : String(S.ac);
      }

      renderSummary();
      renderBoard(false);
      renderTally();
    }
  });
})();
