# Brush

A silent, guided 3-minute toothbrushing timer, built as a Progressive Web App
so it can live on the iPhone home screen without an App Store account.

Press **Start** and it walks through **12 zones in 3 minutes**. At every switch
the screen flashes and the background colour changes; a diagram of the two tooth
arches highlights the exact surface, jaw and side to brush. No sound, ever.

Zones are not all the same length — the insides and outsides carry most of the
plaque, so the chewing surfaces give time up to them:

| Surface | Zones | Each | Subtotal |
|---|---|---|---|
| Inside | 4 | 17s | 68s |
| Outside | 4 | 18s | 72s |
| Chewing | 4 | 10s | 40s |
| | | | **180s = 3:00** |

| # | Zone | Length | # | Zone | Length |
|---|---|---|---|---|---|
| 1 | Lower Inside — Left | 17s | 7 | Upper Outside — Left | 18s |
| 2 | Lower Inside — Right | 17s | 8 | Upper Outside — Right | 18s |
| 3 | Upper Inside — Left | 17s | 9 | Lower Chewing — Left | 10s |
| 4 | Upper Inside — Right | 17s | 10 | Lower Chewing — Right | 10s |
| 5 | Lower Outside — Left | 18s | 11 | Upper Chewing — Left | 10s |
| 6 | Lower Outside — Right | 18s | 12 | Upper Chewing — Right | 10s |

To retune, edit the one `SECONDS` table at the top of `app.js`; everything else
follows from it.

## Files

| File | What it does |
|---|---|
| `index.html` | Markup, iOS meta tags, the inline SVG mouth diagram |
| `styles.css` | Layout, zone palette, flash animation, safe-area insets |
| `app.js` | Timer, zone sequence, diagram highlighting, screen wake lock |
| `manifest.json` | Makes it installable: name, icons, fullscreen display |
| `sw.js` | Service worker — caches everything so it works offline |
| `icons/` | App icons |
| `tools/make-icons.py` | Regenerates the icons. Development only, never runs in the app. |

No build step, no dependencies. The files you upload are the files that run.

## Running it locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. `localhost` counts as a secure origin, so the
service worker and offline behaviour work there just like on the live site.

Add `?x=15` to the URL (<http://localhost:8000/?x=15>) to run everything 15 times
faster — the whole session in 12 seconds instead of three minutes. It scales the
zone lengths rather than flattening them, so the uneven timings still apply.

## Deploying an update

1. Edit the files.
2. Upload the changed files to the GitHub repo, replacing the old ones.
3. Wait a minute for GitHub Pages to rebuild.

The phone picks the update up on its own. The service worker serves the cached
copy instantly and refetches in the background, so the launch *after* next shows
the new version — open the app twice to see a change straight away.

Only bump `CACHE` in `sw.js` (`brush-v1` → `brush-v2`) if you ever need every
phone to throw its copy away immediately. Day to day you can ignore it.

## Installing on an iPhone

Open the live URL **in Safari** (Chrome on iOS cannot install PWAs) → **Share** →
**Add to Home Screen** → **Add**.

## Notes

- iOS Safari has no vibration API, so the app cannot buzz the phone. All feedback
  is visual by necessity.
- The countdown is computed from a wall-clock timestamp rather than by counting
  interval ticks, because iOS suspends timers when the screen sleeps. Come back
  to the app mid-session and it shows the correct zone immediately.
- "Left" means *your own* left, and the diagram is drawn from your perspective,
  not mirrored. Flip the `MIRROR` constant at the top of `app.js` to swap it.
