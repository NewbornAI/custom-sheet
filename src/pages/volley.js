/* The volley page: the spell slider, the toggles, the beams and the tally. */
(function () {
  'use strict';

  var C = Sheet.core;
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
    var ch = api.character().char;
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

  /* The beam: the hit rides in a die, the damage rides under it. */
  /* The beam: the hit rides in a die, the damage rides under it. */
  function cellHtml(beam) {
    var out = '';
    var types = [], i;
    var power = R.powerOf(S.power);
    var flatType = R.primaryType(power);

    if (!beam) {
      var groups = previewGroups();
      for (i = 0; i < groups.length; i++) {
        if (types.indexOf(groups[i].type) === -1) types.push(groups[i].type);
      }
      var flat = FLAT + (S.curse ? 4 : 0);
      out += '<div class="vhit">';
      out += '<span class="vdie">' + C.dieBig(20, '') + '</span>';
      out += '<span class="vsum">';
      out += '<span class="vmini">' + C.dieIcon(20) + '</span>';
      out += '<span class="vroll ghost">--</span>';
      out += '<span class="vmod">+' + ATK + '</span>';
      out += '</span></div>';
      out += '<div class="vbeam"></div>';
      out += '<div class="vdmg">';
      out += '<div class="vdt ghost">--</div>';
      out += '<div class="vkinds">';
      types.forEach(function (t) { out += '<em class="' + t + '">' + t + '</em>'; });
      out += '</div>';
      out += '<div class="vdice">';
      groups.forEach(function (g) {
        out += '<span class="vg"><span class="vlbl ' + g.type + '">' + g.label + '</span>';
        out += '<span class="vroll ghost">--</span></span>';
      });
      if (flat) out += '<span class="vg vflat"><span class="vlbl ' + flatType + '">+' + flat + '</span></span>';
      out += '</div></div>';
      return out;
    }

    for (i = 0; i < beam.groups.length; i++) {
      if (types.indexOf(beam.groups[i].type) === -1) types.push(beam.groups[i].type);
    }

    /* the hit: the final roll rides in a die of its own */
    out += '<div class="vhit">';
    out += '<span class="vdie">' + C.dieBig(20, beam.total) + '</span>';
    out += '<span class="vsum">';
    out += '<span class="vmini">' + C.dieIcon(20) + '</span>';
    out += '<span class="vroll">' + beam.kept + '</span>';
    if (beam.rolls.length > 1) {
      /* the dice that were thrown away, the one that was kept left out */
      var other = [], seen = false;
      for (i = 0; i < beam.rolls.length; i++) {
        if (!seen && beam.rolls[i] === beam.kept) { seen = true; continue; }
        other.push(beam.rolls[i]);
      }
      if (other.length) out += '<span class="vother">' + other.join(' ') + '</span>';
    }
    out += '<span class="vmod">+' + ATK + '</span>';
    out += '</span>';
    if (beam.crit) out += '<span class="vbadge vcrit">crit</span>';
    else if (beam.hit === true) out += '<span class="vbadge vhit">hit</span>';
    else if (beam.hit === false) out += '<span class="vbadge vmiss">miss</span>';
    out += '</div>';

    out += '<div class="vbeam"></div>';

    /* the damage: the total, the kinds under it, the dice that made it */
    out += '<div class="vdmg">';
    out += '<div class="vdt">' + beam.damage + '</div>';
    out += '<div class="vkinds">';
    types.forEach(function (t) { out += '<em class="' + t + '">' + t + '</em>'; });
    out += '</div>';
    out += '<div class="vdice">';
    beam.groups.forEach(function (g) {
      out += '<span class="vg"><span class="vlbl ' + g.type + '">' + g.label + '</span>';
      out += '<span class="vroll' + (g.rolls.length > 3 ? ' tight' : '') + '">' + g.rolls.join(',') + '</span></span>';
    });
    if (beam.flat) out += '<span class="vg vflat"><span class="vlbl ' + flatType + '">+' + beam.flat + '</span></span>';
    out += '</div></div>';

    return out;
  }

  function renderBoard(animate) {
    var power = R.powerOf(S.power);
    var n = power.attacks;
    var count = R.beamCount(S);
    var quick = R.quickened(S);
    E.grid.style.setProperty('--cols', n === 4 ? '2' : '3');
    E.grid.classList.toggle('vquick', quick);
    E.grid.innerHTML = '';

    for (var i = 0; i < count; i++) {
      /* the quickened cast starts a second row */
      if (quick && i === n) {
        var sep = document.createElement('div');
        sep.className = 'vrowsep';
        sep.innerHTML = '<span>Quickened</span>';
        E.grid.appendChild(sep);
      }
      var beam = volley ? volley.beams[i] : null;
      var cell = document.createElement('article');
      cell.className = 'vcell' + (beam && beam.quick ? ' vquick' : '');
      var preview = beam ? beam.groups : previewGroups();
      cell.style.setProperty('--beam', TYPE_RGB[preview[0] ? preview[0].type : 'force'] || '155,123,255');
      if (!animate) cell.style.animation = 'none';
      cell.style.setProperty('--i', String(i));
      if (beam) {
        if (beam.crit) cell.classList.add('vcrit');
        if (beam.hit === false) cell.classList.add('vmiss');
      } else {
        cell.classList.add('vghost');
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

  /* The tally of all the rays: the total on one line, the kinds on the next. */
  function renderTally() {
    if (!volley) {
      E.tally.innerHTML = S.ac === null
        ? '<span class="vnote">No target AC set, so damage shows for every beam</span>'
        : '';
      return;
    }
    var t = R.tally(volley, S.ac);
    var out = '<div class="vtline">';
    out += '<span class="vbig">' + t.total + '</span><span class="vunit">damage</span>';
    if (S.ac !== null) {
      out += '<span class="vextra">' + t.hits + ' hit' + (t.hits === 1 ? '' : 's');
      if (t.crits) out += ' &middot; ' + t.crits + ' crit' + (t.crits === 1 ? '' : 's');
      out += '</span>';
    }
    out += '</div>';
    /* the flat bonus sits in its own type, so the tally shows it there */
    out += '<div class="vtline vtypes">';
    t.order.forEach(function (type) {
      out += '<em class="' + type + '">' + t.byType[type] + ' ' + type + '</em>';
    });
    out += '</div>';
    E.tally.innerHTML = out;
  }

  /* ---- the page ---- */

  Sheet.page({
    id: 'volley',
    title: 'Volley',
    order: 1,
    blurb: 'The spell slider, the toggles and the beams.',
  css: [
    '.vac{flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:4px 9px;min-height:28px;border:1px solid var(--edge);border-radius:999px;background:rgba(255,255,255,.03);font-size:10.5px;letter-spacing:.08em;color:var(--muted);cursor:pointer}',
    '.vac input{width:26px;padding:0;border:0;background:none;color:var(--ink);font:inherit;font-variant-numeric:tabular-nums;text-align:center;outline:none;appearance:textfield;-moz-appearance:textfield}',
    '.vac input::-webkit-outer-spin-button,.vac input::-webkit-inner-spin-button{appearance:none;-webkit-appearance:none;margin:0}',
    '.vac input::placeholder{color:#5c5778}',
    '.vac:focus-within{border-color:rgba(var(--arcane-rgb),.6);box-shadow:0 0 0 2px rgba(var(--arcane-rgb),.15)}',
    '.vslider{flex:0 0 auto}',
    '.vslider input[type=range]{-webkit-appearance:none;appearance:none;display:block;width:100%;height:28px;margin:0;padding:0;background:transparent}',
    '.vslider input[type=range]:focus-visible{outline:2px solid var(--arcane);outline-offset:3px;border-radius:6px}',
    '.vslider input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(90deg,var(--arcane) 0 var(--fill,0%),rgba(255,255,255,.13) var(--fill,0%) 100%)}',
    '.vslider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;margin-top:-11px;border-radius:50%;border:1px solid rgba(255,255,255,.42);background:radial-gradient(circle at 34% 28%,#dccaff,#8a68f5 58%,#5a3fd2);box-shadow:0 3px 10px rgba(0,0,0,.6)}',
    '.vslider input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:rgba(255,255,255,.13)}',
    '.vslider input[type=range]::-moz-range-progress{height:4px;border-radius:2px;background:var(--arcane)}',
    '.vslider input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;border:1px solid rgba(255,255,255,.42);background:#8a68f5;box-shadow:0 3px 10px rgba(0,0,0,.6)}',
    '.vstops{position:relative;height:15px}',
    '.vstop{position:absolute;top:0;transform:translateX(-50%);padding:1px 2px;border:0;background:none;color:#615c7d;font-family:var(--sans);font-size:10px;letter-spacing:.06em;cursor:pointer;white-space:nowrap}',
    '.vstop.on{color:var(--arcane);font-weight:600}',
    '.vstop:focus-visible{outline:2px solid var(--arcane);outline-offset:1px;border-radius:3px}',
    '.vchips{display:flex;gap:6px;row-gap:6px;flex:0 0 auto;flex-wrap:wrap}',
    '.vchip{flex:0 1 auto;min-width:0;padding:6px 10px;min-height:31px;border:1px solid var(--edge);border-radius:999px;background:rgba(255,255,255,.03);color:var(--muted);font-family:var(--sans);font-size:12px;line-height:1;letter-spacing:.02em;white-space:nowrap;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transition:border-color .15s,color .15s,background-color .15s}',
    '.vchip:focus-visible{outline:2px solid var(--arcane);outline-offset:2px}',
    '.vchip[aria-pressed=\"true\"]{border-color:rgba(var(--crgb),.55);background:rgba(var(--crgb),.12);color:rgb(var(--crgb))}',
    '.vchip[hidden]{display:none}',
    '.vsummary{flex:0 0 auto;display:flex;flex-direction:column;gap:1px;font-size:10.5px;line-height:1.3;color:#7d7899}',
    '.vsummary em{font-style:normal}',
    '.vsummary b{color:var(--ink);font-weight:600}',
    '.vboard{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;scrollbar-width:none}',
    '.vboard::-webkit-scrollbar{width:0;height:0}',
    '.vgrid{flex:1 1 auto;display:grid;grid-template-columns:repeat(var(--cols,3),minmax(0,1fr));gap:6px;align-content:stretch}',
    '.vgrid.vquick{grid-template-rows:1fr auto 1fr}',
    '.vrowsep{grid-column:1 / -1;display:flex;align-items:center;gap:8px;padding:1px 0;color:var(--muted);font-size:8.5px;letter-spacing:.18em;text-transform:uppercase}',
    '.vrowsep::before,.vrowsep::after{content:\'\';flex:1 1 auto;height:1px;background:var(--edge)}',

    /* the beam: everything in it is centred */
    '.vcell{display:flex;flex-direction:column;align-items:center;gap:4px;padding:7px 5px 8px;border:1px solid var(--edge);border-radius:5px;background:radial-gradient(120% 55% at 50% 54%,rgba(var(--beam,var(--arcane-rgb)),.22),transparent 72%),linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012));min-width:0;animation:vrise .22s ease-out both;animation-delay:calc(var(--i,0) * 45ms)}',
    '@keyframes vrise{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}',
    '.vcell.vquick{border-color:rgba(92,214,220,.30)}',
    '.vcell.vcrit{border-color:rgba(var(--gold-rgb),.55);box-shadow:0 0 0 1px rgba(var(--gold-rgb),.14),0 8px 20px rgba(var(--gold-rgb),.10)}',
    '.vcell.vghost{opacity:.55;animation:none}',

    /* the hit: the final roll rides in a die, the arithmetic rides under it */
    '.vhit{display:flex;flex-direction:column;align-items:center;gap:3px;width:100%}',
    '.vdie{width:34px;height:34px;color:var(--arcane)}',
    '.vdie svg{width:100%;height:100%;display:block}',
    '.vsum{display:flex;align-items:center;gap:3px;justify-content:center;font-size:11px;line-height:1;color:var(--muted);font-variant-numeric:tabular-nums}',
    '.vmini{width:13px;height:13px;flex:0 0 auto;color:var(--muted)}',
    '.vmini svg{width:13px;height:13px;display:block}',
    '.vroll{color:var(--ink);font-weight:600}',
    '.vroll.ghost{color:#6f6a8d;font-weight:400}',
    '.vother{color:#6f6a8d;font-size:10px}',
    '.vmod{color:var(--muted)}',
    '.vbadge{align-self:center;padding:2px 5px;border:1px solid;border-radius:3px;font-size:8.5px;letter-spacing:.1em;line-height:1.2;text-transform:uppercase}',
    '.vbadge.vcrit{color:var(--gold);border-color:rgba(var(--gold-rgb),.5);background:rgba(var(--gold-rgb),.10)}',
    '.vbadge.vhit{color:#a9b6d8;border-color:rgba(169,182,216,.34);background:rgba(169,182,216,.08)}',
    '.vbadge.vmiss{color:#d08a9c;border-color:rgba(208,138,156,.45);background:rgba(208,138,156,.10)}',

    /* the beam of light between the hit and the damage */
    '.vbeam{flex:1 1 auto;display:flex;justify-content:center;min-height:8px}',
    '.vbeam::before{content:\'\';width:3px;border-radius:2px;background:linear-gradient(180deg,rgba(var(--beam,var(--arcane-rgb)),.5),rgba(var(--beam,var(--arcane-rgb)),.14));box-shadow:0 0 10px rgba(var(--beam,var(--arcane-rgb)),.35)}',

    /* the damage: the total, the kinds under it, the dice that made it */
    '.vdmg{width:100%;display:flex;flex-direction:column;align-items:center;gap:3px;padding-top:5px;border-top:1px solid var(--edge)}',
    '.vdt{font-family:var(--display);font-weight:700;font-size:22px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}',
    '.vdt.ghost{color:#6f6a8d}',
    '.vkinds{display:flex;gap:5px;flex-wrap:wrap;justify-content:center}',
    '.vkinds em{font-style:normal;font-size:9.5px;letter-spacing:.03em}',
    '.vdice{display:flex;gap:7px;flex-wrap:wrap;justify-content:center}',
    '.vg{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0}',
    '.vlbl{font-size:10px;line-height:1.1;color:var(--muted);font-variant-numeric:tabular-nums}',
    '.vroll.tight{font-size:10px}',
    '.vg.vflat{opacity:.85}',

    /* the tally of all the rays: the total, then the kinds */
    '.vtally{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:1px;min-height:22px;font-size:10.5px;color:var(--muted)}',
    '.vtline{display:flex;align-items:baseline;gap:6px;justify-content:center}',
    '.vbig{font-family:var(--display);font-weight:700;font-size:20px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}',
    '.vunit{color:var(--muted)}',
    '.vextra{color:#7d7899}',
    '.vtypes{gap:8px}',
    '.vtypes em{font-style:normal}',
    '.vnote{color:#615c7d}',

    /* the cast */
    '.vcast{position:relative;flex:0 0 auto;width:100%;height:92px;border:1px solid rgba(255,255,255,.2);border-radius:16px;background:linear-gradient(180deg,#9573ff 0%,#5a39d6 100%);color:#fff;font-family:var(--display);font-weight:700;font-size:34px;letter-spacing:.16em;padding-left:.16em;text-shadow:0 1px 10px rgba(40,20,90,.5);box-shadow:0 12px 30px rgba(92,58,220,.32),inset 0 1px 0 rgba(255,255,255,.32);cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;overflow:hidden}',
    '.vcast:focus-visible{outline:2px solid #fff;outline-offset:3px}',
    '.vcast:active{transform:translateY(1px);box-shadow:0 5px 16px rgba(92,58,220,.34),inset 0 1px 0 rgba(255,255,255,.25)}',
    '.vmark{position:absolute;right:-14px;top:50%;transform:translateY(-50%);width:150px;height:150px;color:#fff;opacity:.12;pointer-events:none}',
    '@media (prefers-reduced-motion:reduce){.vcell{animation:none}.vcast{transition:none}}',
    '@media (min-height:760px){.vcast{height:120px}}'
  ].join('\n'),

    html: [
      '<div class="vslider">',
      '  <input id="power" type="range" min="0" max="4" step="1" value="0" aria-label="Spell power">',
      '  <div class="vstops" id="stops"></div>',
      '</div>',
      '<div class="vchips" id="chips"></div>',
      '<div class="vsummary" id="summary"></div>',
      '<div class="vboard" id="board">',
      '  <div class="vgrid" id="grid"></div>',
      '</div>',
      '<div class="vtally" id="tally"></div>',
      '<button class="vcast" id="cast">',
      '  <span id="castLabel">Cast</span>',
      '  <svg class="vmark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '    <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width=".8"/>',
      '    <path d="M12 2.2V6M12 18v3.8M2.2 12H6M18 12h3.8" stroke="currentColor" stroke-width=".8"/>',
      '    <path d="M12 6.4L17.6 12 12 17.6 6.4 12z" fill="none" stroke="currentColor" stroke-width="1"/>',
      '  </svg>',
      '</button>'
    ].join('\n'),

    seed: function (saved, fresh) {
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
      S = a.character().volley;
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
        stop.className = 'vstop';
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
        b.className = 'vchip';
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
      S = a.character().volley;
      var wrap = document.createElement('label');
      wrap.className = 'vac';
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
      S = a.character().volley;
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
