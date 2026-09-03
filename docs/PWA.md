# PWA — Howl on the home screen

Howl installs as a **standalone app**. It is still the website: same chat, same cache. Friends should **not** uninstall and reinstall to get a new version.

## Add (test from Profile)

Open **Profile**. The rose card **Keep them on this phone**:

- **Chrome / Edge (Android or desktop):** when the browser is ready, tap **Add to phone**.
- **iPhone:** Share → Add to Home Screen (Safari / a recent Chrome). Apple does not show the same install prompt.
- **Already installed:** the card says you are in the app. Updates arrive on their own.

Install needs a **secure context** (HTTPS or `localhost`) plus the service worker and `manifest.webmanifest`.

## Updates (no reinstall)

`coi-serviceworker.js` precaches the app shell (`howl-shell-v2`). When you push a new site:

1. The browser downloads the new worker in the background.
2. The worker calls `skipWaiting` and takes over.
3. The page reloads **once**.

Users keep the same icon. They do not go back to the store or the zip. After you change the shell, bump the cache name in the worker (`howl-shell-v2` → `v3`) so old files are dropped.

The **model** lives in IndexedDB. A UI update does not delete it.

## Offline

After the first successful visit:

| Piece | Offline |
| --- | --- |
| App chrome (HTML, CSS, JS, icons) | Yes — service worker cache |
| Companion weights | Yes — if they already finished **Start** once |
| Brand-new phone, never opened Howl | No — need one online wake |

Unknown URLs inside the app scope are served as Howl (`index.html` / `404.html`). You should not see GitHub’s “There isn’t a GitHub Pages site here.”

Airplane mode will **not** invent WebGPU if the GPU context was dropped. Opening the installed app still loads the shell; tap Start if they went to sleep.

## What we do not cache in the worker

`models/` files. They are too large. WebLLM already stores shards in IndexedDB.
