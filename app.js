/* Brush — a silent, guided 3-minute toothbrushing timer.
 *
 * The countdown is derived from a wall-clock timestamp rather than by counting
 * interval ticks: iOS throttles and suspends timers whenever the screen sleeps
 * or you switch apps, so tick counting would drift. Working from Date.now()
 * means the app shows the correct zone the instant you look back at it.
 *
 * Zones are not all the same length, so every position is resolved against a
 * precomputed table of start offsets rather than by dividing by a step size.
 */
(function () {
  'use strict';

  /* "Left" means your own left side, and the map is drawn from your
   * perspective — your left on the screen's left. Set MIRROR to true to swap
   * the halves if you'd rather read it as a mirror image. */
  var MIRROR = false;

  /* The 12 zones, grouped by surface: insides, then outsides, then chewing.
   * Surface picks the hue family, the jaw shifts it, and the right side runs
   * one step deeper. Ink text stays above 4.5:1 contrast on every colour. */
  var ZONES = [
    { jaw: 'lower', surface: 'inside',  side: 'left',  colour: '#2ee6c5' },
    { jaw: 'lower', surface: 'inside',  side: 'right', colour: '#19b89c' },
    { jaw: 'upper', surface: 'inside',  side: 'left',  colour: '#4cc9ff' },
    { jaw: 'upper', surface: 'inside',  side: 'right', colour: '#1fa0e0' },
    { jaw: 'lower', surface: 'outside', side: 'left',  colour: '#ffc233' },
    { jaw: 'lower', surface: 'outside', side: 'right', colour: '#f09a12' },
    { jaw: 'upper', surface: 'outside', side: 'left',  colour: '#ff8552' },
    { jaw: 'upper', surface: 'outside', side: 'right', colour: '#f2612a' },
    { jaw: 'lower', surface: 'chewing', side: 'left',  colour: '#b79bff' },
    { jaw: 'lower', surface: 'chewing', side: 'right', colour: '#9a74f5' },
    { jaw: 'upper', surface: 'chewing', side: 'left',  colour: '#ff7dc2' },
    { jaw: 'upper', surface: 'chewing', side: 'right', colour: '#ee4fa0' }
  ];

  /* Seconds per zone, by surface. The insides and outsides carry most of the
   * plaque and get the time the chewing surfaces give up; with four zones of
   * each surface this balances exactly, so the session is still 3:00:
   * 4x17 + 4x18 + 4x10 = 68 + 72 + 40 = 180. */
  var SECONDS = { inside: 17, outside: 18, chewing: 10 };

  /* What the status line says while you brush, one verb per surface. */
  var VERB = { inside: 'Scrubbing', outside: 'Polishing', chewing: 'Crunching' };

  /* ?x=15 runs everything 15 times faster, so the whole session can be watched
   * in 12 seconds while testing. It scales the durations rather than flattening
   * them, so the uneven zone lengths are still exercised. Not surfaced in the UI. */
  var speed = parseFloat(new URLSearchParams(location.search).get('x'));
  if (!(speed > 0)) speed = 1;

  /* Zone lengths and the running start time of each, worked out once up front. */
  var DURATIONS = ZONES.map(function (z) { return SECONDS[z.surface] * 1000 / speed; });
  var OFFSETS = [];
  var TOTAL_MS = DURATIONS.reduce(function (acc, ms) { OFFSETS.push(acc); return acc + ms; }, 0);

  /* The session length as the person sees it, unaffected by ?x. */
  var TOTAL_SECONDS = ZONES.reduce(function (acc, z) { return acc + SECONDS[z.surface]; }, 0);

  /* Which zone is running at a given elapsed time. Twelve entries, so a plain
   * scan from the end is both the clearest and the fastest thing here. */
  function stepAt(ms) {
    for (var i = ZONES.length - 1; i > 0; i--) {
      if (ms >= OFFSETS[i]) return i;
    }
    return 0;
  }

  var IDLE_COLOUR = '#14110f';
  var DONE_COLOUR = '#b8f03c';

  /* ── Pixel art ──────────────────────────────────────────── */

  /* The mouth, 32 x 26 pixels: upper arch on top, lower arch below, three
   * bands in each — outside, chewing, inside. Letters a–l are zones 1–12 in
   * brushing order (a = ZONES[0]); dots are empty. */
  var MOUTH = [
    '...........ggggghhhhh...........',
    '........gggggggghhhhhhhh........',
    '......gggggggggghhhhhhhhhh......',
    '.....ggggggg........hhhhhhh.....',
    '....ggggg...kkkkllll...hhhhh....',
    '...gggg..kkkkkkklllllll..hhhh...',
    '..gggg.kkkkkkkkklllllllll.hhhh..',
    '.gggg.kkkkkk........llllll.hhhh.',
    '.ggg.kkkkk..ccccdddd..lllll.hhh.',
    'gggg.kkk..ccccccdddddd..lll.hhhh',
    'ggg.kkk..cccccccddddddd..lll.hhh',
    'ggg.kkk.cccc........dddd.lll.hhh',
    '................................',
    '................................',
    'eee.iii.aaaa........bbbb.jjj.fff',
    'eee.iii..aaaaaaabbbbbbb..jjj.fff',
    'eeee.iii..aaaaaabbbbbb..jjj.ffff',
    '.eee.iiiii..aaaabbbb..jjjjj.fff.',
    '.eeee.iiiiii........jjjjjj.ffff.',
    '..eeee.iiiiiiiiijjjjjjjjj.ffff..',
    '...eeee..iiiiiiijjjjjjj..ffff...',
    '....eeeee...iiiijjjj...fffff....',
    '.....eeeeeee........fffffff.....',
    '......eeeeeeeeeeffffffffff......',
    '........eeeeeeeeffffffff........',
    '...........eeeeefffff...........'
  ];

  /* The mascot, 16 x 16. O outline, W tooth, K eyes and mouth, P blush. */
  var TOOTH = [
    '................',
    '..OOOO....OOOO..',
    '.OWWWWO..OWWWWO.',
    'OWWWWWWOOWWWWWWO',
    'OWWWWWWWWWWWWWWO',
    'OWWKKWWWWWWKKWWO',
    'OWWKKWWWWWWKKWWO',
    'OWPPWWKWWKWWPPWO',
    'OWPPWWWKKWWWPPWO',
    'OWWWWWWWWWWWWWWO',
    '.OWWWWWWWWWWWWO.',
    '.OWWWWWWWWWWWWO.',
    '.OWWWWOOOOWWWWO.',
    '.OWWWO....OWWWO.',
    '..OWWO....OWWO..',
    '...OO......OO...'
  ];

  /* The same tooth after brushing: eyes squeezed shut, grinning. */
  var TOOTH_HAPPY = TOOTH.slice();
  TOOTH_HAPPY[5] = 'OWWWKWWWWWWKWWWO';
  TOOTH_HAPPY[6] = 'OWWKWKWWWWKWKWWO';
  TOOTH_HAPPY[7] = 'OWPPWKWWWWKWPPWO';
  TOOTH_HAPPY[8] = 'OWPPWWKKKKWWPPWO';

  var TOOTH_COLOURS = { O: '#14110f', K: '#14110f', W: '#fff6e9', P: '#ff7dc2' };
  var EYE_ROW = 5;                          // top row of the open eyes

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function rect(x, y, w, h) {
    var r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', w);
    r.setAttribute('height', h);
    return r;
  }

  /* One rect per pixel. With blinks set, the top row of each eye gets a class
   * that CSS flicks to the tooth colour now and then, closing the eye. */
  function drawSprite(svg, rows, blinks) {
    rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var fill = TOOTH_COLOURS[row[x]];
        if (!fill) continue;
        var r = svg.appendChild(rect(x, y, 1, 1));
        r.setAttribute('fill', fill);
        if (blinks && row[x] === 'K' && y === EYE_ROW) r.setAttribute('class', 'blink');
      }
    });
  }

  /* ── Elements ───────────────────────────────────────────── */
  var body = document.body;
  var el = {
    flash: document.getElementById('flash'),
    map: document.getElementById('map'),
    steps: document.getElementById('steps'),
    ticks: document.getElementById('ticks'),
    zoneNo: document.getElementById('zone-no'),
    jaw: document.getElementById('jaw'),
    sideChip: document.getElementById('side-chip'),
    side: document.getElementById('side'),
    surface: document.getElementById('surface'),
    secs: document.getElementById('secs'),
    total: document.getElementById('total'),
    spinner: document.getElementById('spinner'),
    status: document.getElementById('status'),
    veilZone: document.getElementById('veil-zone'),
    veilLeft: document.getElementById('veil-left'),
    themeColour: document.querySelector('meta[name="theme-color"]')
  };

  function listItems(list, n) {
    var items = [];
    for (var i = 0; i < n; i++) items.push(list.appendChild(document.createElement('li')));
    return items;
  }

  /* ── Building the screens ───────────────────────────────── */
  drawSprite(document.getElementById('tooth-idle'), TOOTH, true);
  drawSprite(document.getElementById('tooth-done'), TOOTH_HAPPY, false);

  /* Each zone's pixels go in their own group, so moving to the next zone only
   * changes twelve classes. Pixels are 9 units with a 1-unit gap. */
  var zoneGroups = ZONES.map(function () {
    var g = el.map.appendChild(document.createElementNS(SVG_NS, 'g'));
    g.setAttribute('class', 'todo');
    return g;
  });

  var pixels = [];                          // [zone, column on screen, row]
  MOUTH.forEach(function (row, y) {
    for (var x = 0; x < row.length; x++) {
      var k = row.charCodeAt(x) - 97;
      if (k < 0 || k >= ZONES.length) continue;
      pixels.push([k, MIRROR ? row.length - 1 - x : x, y]);
    }
  });

  /* Every pixel also carries --t: 0 at its zone's left edge, 1 at its right.
   * CSS staggers on it so a finished zone turns white from left to right. */
  var leftmost = ZONES.map(function () { return Infinity; });
  var rightmost = ZONES.map(function () { return -Infinity; });
  pixels.forEach(function (p) {
    leftmost[p[0]] = Math.min(leftmost[p[0]], p[1]);
    rightmost[p[0]] = Math.max(rightmost[p[0]], p[1]);
  });
  pixels.forEach(function (p) {
    var k = p[0];
    var r = zoneGroups[k].appendChild(rect(p[1] * 10, p[2] * 10, 9, 9));
    var t = (p[1] - leftmost[k]) / Math.max(1, rightmost[k] - leftmost[k]);
    r.style.setProperty('--t', t.toFixed(3));
  });
  if (MIRROR) {
    document.getElementById('map-left').textContent = 'R';
    document.getElementById('map-right').textContent = 'L';
  }

  var stepEls = listItems(el.steps, ZONES.length);
  listItems(document.getElementById('steps-done'), ZONES.length);
  var tickEls = [];

  listItems(document.getElementById('legend'), ZONES.length).forEach(function (li, i) {
    li.style.background = ZONES[i].colour;
  });

  var surfaces = Object.keys(SECONDS);
  document.getElementById('idle-meta').textContent =
    clock(TOTAL_SECONDS) + ' · ' + ZONES.length + ' zones · ' + surfaces.length + ' surfaces';
  document.getElementById('done-meta').textContent =
    'every surface · ' + clock(TOTAL_SECONDS) + ' · ' + ZONES.length + ' zones';
  document.getElementById('receipt-total').textContent =
    clock(TOTAL_SECONDS) + ' · ' + ZONES.length + '/' + ZONES.length;

  /* The done screen's summary: one line per surface, printed in turn. */
  var receipt = document.getElementById('receipt-rows');
  surfaces.forEach(function (surface, n) {
    var zones = ZONES.filter(function (z) { return z.surface === surface; });
    var row = receipt.appendChild(document.createElement('div'));
    row.className = 'receipt__row';
    row.style.animationDelay = (0.3 + n * 0.4) + 's';
    row.innerHTML =
      '<span class="receipt__name">' + surface + '</span>' +
      '<span class="receipt__swatches" aria-hidden="true"></span>' +
      '<span class="receipt__leader" aria-hidden="true"></span>' +
      '<span class="receipt__time">' + clock(zones.length * SECONDS[surface]) + '</span>' +
      '<span class="receipt__check">✓</span>';
    var swatches = row.querySelector('.receipt__swatches');
    zones.forEach(function (z) {
      swatches.appendChild(document.createElement('i')).style.background = z.colour;
    });
  });

  /* Pixel confetti. Negative delays start each piece part-way down, so the
   * screen is already mid-shower when it appears. */
  var CONFETTI = ['#14110f', '#ee4fa0', '#1fa0e0', '#f2612a', '#9a74f5', '#fff6e9', '#19b89c'];
  var confetti = document.getElementById('confetti');
  for (var c = 0; c < 14; c++) {
    var bit = confetti.appendChild(document.createElement('i'));
    var size = c % 3 === 0 ? 10 : 8;
    bit.style.left = (4 + c * 6.8) + '%';
    bit.style.width = bit.style.height = size + 'px';
    bit.style.background = CONFETTI[c % CONFETTI.length];
    bit.style.animationDuration = (3.2 + (c % 4) * 0.45) + 's';
    bit.style.animationDelay = -((c * 0.73) % 4).toFixed(2) + 's';
  }

  /* ── State ──────────────────────────────────────────────── */
  var state = 'idle';        // idle | running | paused | done
  var startedAt = 0;         // Date.now() when Start was pressed
  var pausedTotal = 0;       // accumulated milliseconds spent paused
  var pausedAt = 0;          // Date.now() when the current pause began
  var shownStep = -1;        // last step rendered, so a zone is drawn only on change
  var ticker = null;
  var wakeLock = null;

  function elapsed() {
    if (state === 'idle') return 0;
    if (state === 'done') return TOTAL_MS;
    var now = state === 'paused' ? pausedAt : Date.now();
    return Math.min(Math.max(now - startedAt - pausedTotal, 0), TOTAL_MS);
  }

  /* ── Rendering ──────────────────────────────────────────── */
  function pad(n) { return String(n).padStart(2, '0'); }

  function clock(s) { return Math.floor(s / 60) + ':' + pad(s % 60); }

  function mmss(ms) { return clock(Math.ceil(ms / 1000)); }

  function label(zone) {
    return (zone.jaw + ' ' + zone.surface + ' ' + zone.side).toUpperCase();
  }

  function setColour(hex) {
    document.documentElement.style.setProperty('--zone', hex);
    if (el.themeColour) el.themeColour.setAttribute('content', hex);
  }

  function flash() {
    el.flash.classList.remove('go');
    void el.flash.offsetWidth;              // restart the animation
    el.flash.classList.add('go');
  }

  /* Claude Code's thinking spinner, bouncing back and forth. */
  var SPINNER = ['·', '✢', '✶', '✻', '✽', '✻', '✶', '✢'];
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function showStep(i) {
    var zone = ZONES[i];

    zoneGroups.forEach(function (g, n) {
      g.setAttribute('class', n < i ? 'clean' : n === i ? 'now' : 'todo');
    });

    stepEls.forEach(function (s, n) {
      s.classList.toggle('done', n < i);
      s.classList.toggle('now', n === i);
    });

    el.zoneNo.textContent = pad(i + 1);
    el.jaw.textContent = zone.jaw.toUpperCase() + ' JAW';
    el.side.textContent = zone.side.toUpperCase();
    el.sideChip.setAttribute('data-side', zone.side);
    el.surface.textContent = zone.surface.toUpperCase();
    setColour(zone.colour);

    /* One block per second of this zone. */
    el.ticks.textContent = '';
    tickEls = listItems(el.ticks, SECONDS[zone.surface]);
  }

  function tick() {
    var e = elapsed();

    if (state === 'running' && e >= TOTAL_MS) { finish(); return; }

    /* No flash between zones: the background colour changes and the new zone
     * blinks in on the map, which is cue enough. */
    var i = stepAt(e);
    if (i !== shownStep) {
      shownStep = i;
      showStep(i);
    }

    var into = e - OFFSETS[i];
    var span = DURATIONS[i];
    var secs = String(Math.max(0, Math.ceil((span - into) / 1000)));
    var filled = Math.floor((into / span) * tickEls.length);

    el.secs.textContent = secs;
    tickEls.forEach(function (t, n) { t.classList.toggle('on', n < filled); });
    el.total.textContent = mmss(TOTAL_MS - e);
    el.status.textContent = VERB[ZONES[i].surface] + '… (' + secs + 's · pause to interrupt)';
    el.spinner.textContent = still && still.matches
      ? '✻'
      : SPINNER[Math.floor(Date.now() / 120) % SPINNER.length];
  }

  function setState(next) {
    state = next;
    body.setAttribute('data-state', next);
  }

  /* ── Screen wake lock (Safari 16.4+) ────────────────────── */
  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(
      function (lock) { wakeLock = lock; },
      function () { /* denied or unsupported — the screen just dims as usual */ }
    );
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }

  /* ── Transitions ────────────────────────────────────────── */
  function startTicker() {
    stopTicker();
    ticker = setInterval(tick, 100);
  }

  function stopTicker() {
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function start() {
    startedAt = Date.now();
    pausedTotal = 0;
    shownStep = -1;
    setState('running');
    requestWakeLock();
    tick();
    startTicker();
  }

  function pause() {
    pausedAt = Date.now();
    setState('paused');
    stopTicker();
    releaseWakeLock();
    var i = stepAt(elapsed());
    el.veilZone.textContent = 'zone ' + pad(i + 1) + '/' + ZONES.length + ' · ' + label(ZONES[i]);
    el.veilLeft.textContent = mmss(TOTAL_MS - elapsed()) + ' left · clock is frozen';
  }

  function resume() {
    pausedTotal += Date.now() - pausedAt;
    setState('running');
    requestWakeLock();
    tick();
    startTicker();
  }

  function stop() {
    stopTicker();
    releaseWakeLock();
    shownStep = -1;
    setState('idle');
    setColour(IDLE_COLOUR);
  }

  function finish() {
    stopTicker();
    releaseWakeLock();
    setState('done');
    setColour(DONE_COLOUR);
    flash();
  }

  /* ── Wiring ─────────────────────────────────────────────── */
  document.getElementById('btn-start').addEventListener('click', start);
  document.getElementById('btn-again').addEventListener('click', start);
  document.getElementById('btn-stop').addEventListener('click', stop);
  document.getElementById('btn-reset').addEventListener('click', stop);
  document.getElementById('btn-home').addEventListener('click', stop);
  document.getElementById('btn-pause').addEventListener('click', function () {
    if (state === 'running') pause();
  });
  document.getElementById('btn-resume').addEventListener('click', function () {
    if (state === 'paused') resume();
  });

  /* Coming back from a locked screen or another app: recompute immediately
   * from the clock, restart the ticker in case iOS cleared it rather than
   * merely throttling it, and re-take the wake lock, which iOS drops on
   * leaving. startTicker clears any existing interval, so this is safe to
   * run whether or not the old one survived. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || state !== 'running') return;
    tick();
    if (state !== 'running') return;      // tick() may have finished the session
    startTicker();
    requestWakeLock();
  });

  setColour(IDLE_COLOUR);

  /* ── Offline support ────────────────────────────────────── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });

    /* Reload once when a redeploy takes control — but not on the very first
     * install, where claiming the page is expected and a reload is pointless. */
    var hadController = !!navigator.serviceWorker.controller;
    var refreshing = false;                 // guard against a reload loop
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || refreshing) return;
      refreshing = true;
      location.reload();
    });
  }
})();
