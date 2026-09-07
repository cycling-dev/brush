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

  /* "Left" means your own left side, and the diagram is drawn from your
   * perspective — your left on the screen's left. Set MIRROR to true to swap
   * the highlighted halves if you'd rather read it as a mirror image. */
  var MIRROR = false;

  /* The 12 zones, grouped by surface: insides, then outsides, then chewing. */
  var ZONES = [
    { jaw: 'lower', surface: 'inside',  side: 'left',  colour: '#12666b' },
    { jaw: 'lower', surface: 'inside',  side: 'right', colour: '#0a4245' },
    { jaw: 'upper', surface: 'inside',  side: 'left',  colour: '#14607f' },
    { jaw: 'upper', surface: 'inside',  side: 'right', colour: '#0b3f55' },
    { jaw: 'lower', surface: 'outside', side: 'left',  colour: '#8a5313' },
    { jaw: 'lower', surface: 'outside', side: 'right', colour: '#5e370a' },
    { jaw: 'upper', surface: 'outside', side: 'left',  colour: '#8c3a1a' },
    { jaw: 'upper', surface: 'outside', side: 'right', colour: '#5f250f' },
    { jaw: 'lower', surface: 'chewing', side: 'left',  colour: '#513479' },
    { jaw: 'lower', surface: 'chewing', side: 'right', colour: '#362252' },
    { jaw: 'upper', surface: 'chewing', side: 'left',  colour: '#6d2e65' },
    { jaw: 'upper', surface: 'chewing', side: 'right', colour: '#4a1f45' }
  ];

  /* Seconds per zone, by surface. The insides and outsides carry most of the
   * plaque and get the time the chewing surfaces give up; with four zones of
   * each surface this balances exactly, so the session is still 3:00:
   * 4x17 + 4x18 + 4x10 = 68 + 72 + 40 = 180. */
  var SECONDS = { inside: 17, outside: 18, chewing: 10 };

  /* ?x=15 runs everything 15 times faster, so the whole session can be watched
   * in 12 seconds while testing. It scales the durations rather than flattening
   * them, so the uneven zone lengths are still exercised. Not surfaced in the UI. */
  var speed = parseFloat(new URLSearchParams(location.search).get('x'));
  if (!(speed > 0)) speed = 1;

  /* Zone lengths and the running start time of each, worked out once up front. */
  var DURATIONS = ZONES.map(function (z) { return SECONDS[z.surface] * 1000 / speed; });
  var OFFSETS = [];
  var TOTAL_MS = DURATIONS.reduce(function (acc, ms) { OFFSETS.push(acc); return acc + ms; }, 0);

  /* Which zone is running at a given elapsed time. Twelve entries, so a plain
   * scan from the end is both the clearest and the fastest thing here. */
  function stepAt(ms) {
    for (var i = ZONES.length - 1; i > 0; i--) {
      if (ms >= OFFSETS[i]) return i;
    }
    return 0;
  }

  var IDLE_COLOUR = '#0d1117';

  /* ── Elements ───────────────────────────────────────────── */
  var body = document.body;
  var el = {
    flash: document.getElementById('flash'),
    dots: document.getElementById('dots'),
    zone: document.getElementById('zone'),
    side: document.getElementById('side'),
    secs: document.getElementById('secs'),
    bar: document.getElementById('bar-fill'),
    total: document.getElementById('total'),
    pause: document.getElementById('btn-pause'),
    themeColour: document.querySelector('meta[name="theme-color"]')
  };

  var dotEls = ZONES.map(function () {
    var li = document.createElement('li');
    el.dots.appendChild(li);
    return li;
  });

  /* ── State ──────────────────────────────────────────────── */
  var state = 'idle';        // idle | running | paused | done
  var startedAt = 0;         // Date.now() when Start was pressed
  var pausedTotal = 0;       // accumulated milliseconds spent paused
  var pausedAt = 0;          // Date.now() when the current pause began
  var shownStep = -1;        // last step rendered, so we flash only on change
  var ticker = null;
  var wakeLock = null;

  function elapsed() {
    if (state === 'idle') return 0;
    if (state === 'done') return TOTAL_MS;
    var now = state === 'paused' ? pausedAt : Date.now();
    return Math.min(Math.max(now - startedAt - pausedTotal, 0), TOTAL_MS);
  }

  /* ── Rendering ──────────────────────────────────────────── */
  function label(zone) {
    var jaw = zone.jaw === 'upper' ? 'Upper' : 'Lower';
    var surface = zone.surface.charAt(0).toUpperCase() + zone.surface.slice(1);
    return jaw + ' ' + surface;
  }

  function segmentFor(zone) {
    var half = zone.side;
    if (MIRROR) half = half === 'left' ? 'right' : 'left';
    return document.getElementById('seg-' + zone.jaw + '-' + zone.surface + '-' + half);
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

  function mmss(ms) {
    var s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function showStep(i) {
    var zone = ZONES[i];

    Array.prototype.forEach.call(
      document.querySelectorAll('.seg.on'),
      function (s) { s.classList.remove('on'); }
    );
    var seg = segmentFor(zone);
    if (seg) seg.classList.add('on');

    el.zone.textContent = label(zone);
    el.side.textContent = zone.side === 'left' ? 'Left' : 'Right';
    setColour(zone.colour);

    dotEls.forEach(function (d, n) {
      d.classList.toggle('done', n < i);
      d.classList.toggle('now', n === i);
    });
  }

  function tick() {
    var e = elapsed();

    if (state === 'running' && e >= TOTAL_MS) { finish(); return; }

    var i = stepAt(e);
    if (i !== shownStep) {
      shownStep = i;
      showStep(i);
      flash();
    }

    var into = e - OFFSETS[i];
    var span = DURATIONS[i];
    el.secs.textContent = String(Math.max(0, Math.ceil((span - into) / 1000)));
    el.bar.style.width = (into / span) * 100 + '%';
    el.total.textContent = mmss(TOTAL_MS - e) + ' left';
  }

  function setState(next) {
    state = next;
    body.setAttribute('data-state', next);
    el.pause.textContent = next === 'paused' ? 'Resume' : 'Pause';
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
    setColour('#0f5132');
    flash();
  }

  /* ── Wiring ─────────────────────────────────────────────── */
  document.getElementById('btn-start').addEventListener('click', start);
  document.getElementById('btn-again').addEventListener('click', start);
  document.getElementById('btn-stop').addEventListener('click', stop);
  el.pause.addEventListener('click', function () {
    if (state === 'running') pause();
    else if (state === 'paused') resume();
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
