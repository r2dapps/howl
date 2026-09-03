/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT
 *  Howl: same-origin cache for the app shell, COOP/COEP headers, offline fallback.
 *  Model weights are never cached here (IndexedDB / WebLLM).
 */
let coepCredentialless = false;
if (typeof window === "undefined") {
  const SHELL = "howl-shell-v3";
  const PRECACHE = [
    "./",
    "./index.html",
    "./404.html",
    "./css/app.css",
    "./js/app.js",
    "./js/engine.js",
    "./js/markdown.js",
    "./js/storage.js",
    "./js/db.js",
    "./js/icons.js",
    "./js/personas.js",
    "./js/models.js",
    "./js/config.js",
    "./js/stars.js",
    "./js/pwa.js",
    "./manifest.webmanifest",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable.png",
    "./icons/apple-touch.png",
    "./docs/assets/howl-mark_Logo.png",
    "./docs/assets/howl-banner.png",
    "./vendor/web-llm.js",
  ];

  function scopeUrl(rel) {
    return new URL(rel, self.registration.scope).href;
  }

  function shouldCache(url) {
    try {
      const u = new URL(url);
      if (u.origin !== self.location.origin) return false;
      if (u.pathname.includes("/models/")) return false;
      if (u.pathname.includes("/vendor/web-llm")) return true;
      return (
        /\.(html|css|js|mjs|png|jpe?g|webmanifest|svg|json|ico)$/.test(u.pathname) ||
        u.pathname.endsWith("/")
      );
    } catch {
      return false;
    }
  }

  function withIsolation(response) {
    const headers = new Headers(response.headers);
    headers.set(
      "Cross-Origin-Embedder-Policy",
      coepCredentialless ? "credentialless" : "require-corp"
    );
    if (!coepCredentialless) {
      headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    }
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  async function fromCache(request) {
    const cache = await caches.open(SHELL);
    const exact = await cache.match(request);
    if (exact) return exact;
    return cache.match(request, { ignoreSearch: true });
  }

  async function appShell() {
    const cache = await caches.open(SHELL);
    return (
      (await cache.match(scopeUrl("./index.html"))) ||
      (await cache.match(scopeUrl("./"))) ||
      new Response(
        "<!DOCTYPE html><meta charset=utf-8><title>Howl</title><p>Howl is offline. Open this page once while online.</p>",
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      )
    );
  }

  self.addEventListener("install", (event) => {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SHELL);
        await Promise.all(
          PRECACHE.map(async (rel) => {
            try {
              const req = new Request(scopeUrl(rel), { cache: "reload" });
              const res = await fetch(req);
              if (res.ok) await cache.put(req, res.clone());
            } catch {
              /* skip a missing file; others still cache */
            }
          })
        );
        await self.skipWaiting();
      })()
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)));
        await self.clients.claim();
      })()
    );
  });

  self.addEventListener("message", (ev) => {
    if (!ev.data) return;
    if (ev.data.type === "deregister") {
      self.registration.unregister().then(() => self.clients.matchAll()).then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      });
    } else if (ev.data.type === "coepCredentialless") {
      coepCredentialless = ev.data.value;
    } else if (ev.data.type === "skipWaiting") {
      self.skipWaiting();
    }
  });

  self.addEventListener("fetch", (event) => {
    const r = event.request;
    if (r.method !== "GET") return;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;

    const request =
      coepCredentialless && r.mode === "no-cors"
        ? new Request(r, { credentials: "omit" })
        : r;

    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        const navigate = request.mode === "navigate";

        try {
          const response = await fetch(request);
          if (response.status === 0) return response;
          if (navigate && response.status === 404) {
            return withIsolation(await appShell());
          }
          if (response.ok && shouldCache(request.url)) {
            cache.put(request, response.clone());
          }
          return withIsolation(response);
        } catch {
          const hit = await fromCache(request);
          if (hit) return withIsolation(hit);
          if (navigate) return withIsolation(await appShell());
          return new Response("", { status: 503, statusText: "Offline" });
        }
      })()
    );
  });
} else {
  (() => {
    const coi = {
      shouldRegister: () => !window.crossOriginIsolated,
      shouldDeregister: () => false,
      coepCredentialless: () => !(window.chrome || window.netscape),
      doReload: () => window.location.reload(),
      quiet: true,
      ...window.coi,
    };

    const n = navigator;
    if (!n.serviceWorker || !coi.shouldRegister()) return;

    if (n.serviceWorker.controller) {
      n.serviceWorker.controller.postMessage({
        type: "coepCredentialless",
        value: coi.coepCredentialless(),
      });
      if (coi.shouldDeregister()) {
        n.serviceWorker.controller.postMessage({ type: "deregister" });
      }
    }

    if (!window.isSecureContext) return;

    let refreshing = false;
    n.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing || window.crossOriginIsolated) return;
      refreshing = true;
      coi.doReload();
    });

    n.serviceWorker.register(window.document.currentScript.src).then((registration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && n.serviceWorker.controller) {
            worker.postMessage({ type: "skipWaiting" });
          }
        });
      });
      if (registration.waiting && n.serviceWorker.controller) {
        registration.waiting.postMessage({ type: "skipWaiting" });
      }
    });
  })();
}
