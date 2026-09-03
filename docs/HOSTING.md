# Hosting Howl on GitHub

The git repo should stay **small**. Friends clone or open Pages. They should not commit `models/`.

## What goes in git

Commit the app: HTML, CSS, JS, icons, manifest, `coi-serviceworker.js`, `404.html`, `.nojekyll`, docs.

Do **not** commit:

- `models/` (~670 MB)
- Hugging Face `.cache`

`.gitignore` already excludes those.

## GitHub Pages

1. Settings → Pages → Deploy from branch (`main`, `/` root).
2. `.nojekyll` is required so GitHub does not skip `vendor/` or underscore paths.
3. `404.html` sends unknown paths back to Howl so the installed app never shows a GitHub 404.

**Project site** (`https://USER.github.io/REPO/`): relative URLs (`./css/…`) already work. Do not use a leading `/css` absolute path.

**HTTPS** is required for the service worker and for “Add to phone.”

## Model files (Releases or Hugging Face)

Git LFS and repo files are a poor place for 670 MB. Use:

1. **Hugging Face** (recommended for WebLLM):  
   `https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC`  
   Set `window.LIORA_MODEL_BASE` in `index.html` or `?modelBase=`.
2. **GitHub Release** assets, if you tested that the browser can fetch them with **COEP** (`Cross-Origin-Resource-Policy`). Many Release CDNs fail this. If the companion never wakes on Pages but works locally, the host headers are the usual cause.

Also attach **Meta’s Llama 3.2 license** next to any weights you redistribute.

## Isolation (WebGPU)

Howl needs **COOP / COEP** so WebLLM can use SharedArrayBuffer. Locally, `serve.py` sends those headers. On Pages, `coi-serviceworker.js` injects them and caches the app shell.

First visit on Pages may reload once when the worker takes over. That is expected.

## Privacy

Pages is static. Howl does not send chats to GitHub. Friends’ messages stay in **their** browser (IndexedDB + localStorage).

## Checklist before you share the link

- [ ] Pages URL opens in Chrome/Edge
- [ ] Profile shows the home-screen banner
- [ ] Companion wakes (progress bar finishes)
- [ ] Airplane mode: app shell still opens; chat works if the model already cached
- [ ] A fake path like `/nope` returns Howl, not GitHub’s 404
- [ ] Sharing the Pages URL on WhatsApp shows the night-sky card (`docs/assets/howl-og.jpg`)
