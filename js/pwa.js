/** Home-screen install + status. Updates are handled by the service worker. */

let deferredPrompt = null;

function $(id) {
  return document.getElementById(id);
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || "");
}

export function paintPwa() {
  const status = $("pwa-status");
  const btn = $("pwa-install");
  if (!status || !btn) return;

  if (isStandalone()) {
    status.textContent =
      "You’re in the app. New versions arrive on their own — no uninstall, no new download.";
    btn.hidden = true;
    return;
  }

  if (isIos()) {
    status.textContent =
      "On iPhone: tap Share, then Add to Home Screen. After the first wake, they stay on this phone offline.";
    btn.hidden = true;
    return;
  }

  if (deferredPrompt) {
    status.textContent =
      "Add Howl like an app. It updates itself. After the first start, chat works without the site.";
    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = "Add to phone";
    return;
  }

  status.textContent =
    "Chrome or Edge can add Howl to your home screen. When the browser is ready, the button lights up. HTTPS or this computer both work.";
  btn.hidden = false;
  btn.disabled = true;
  btn.textContent = "Waiting…";
}

export function initPwa() {
  paintPwa();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    paintPwa();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    paintPwa();
  });
  const btn = $("pwa-install");
  if (btn) {
    btn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      paintPwa();
    });
  }
}
