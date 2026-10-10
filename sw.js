/* Offline cache for the app shell.
 *
 * Strategy: stale-while-revalidate. A request is answered from the cache
 * immediately — that is what makes the app open instantly and work with no
 * signal in the bathroom — while the same request is refetched in the
 * background and the cached copy replaced. A redeploy therefore reaches the
 * phone by itself on the launch after next, with nothing to remember.
 *
 * CACHE only needs bumping to force every phone to discard its copy at once.
 */
var CACHE = 'brush-v2';

var SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './fonts/pixelify-sans-latin.woff2',
  './fonts/jetbrains-mono-latin.woff2',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;

  /* Only same-origin GETs are ours to cache. */
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {

        var fresh = fetch(req).then(function (res) {
          /* Store only genuine successes, never a 404 page or an opaque response. */
          if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        }).catch(function () {
          return null;                       // offline: fall through to the cache
        });

        if (hit) return hit;                 // instant, then refreshed above

        return fresh.then(function (res) {
          if (res) return res;
          return req.mode === 'navigate' ? cache.match('./index.html') : Response.error();
        });
      });
    })
  );
});
