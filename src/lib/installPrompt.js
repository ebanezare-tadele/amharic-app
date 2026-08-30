// Chrome/Edge/Android fire "beforeinstallprompt" once per page load, and
// it can fire before React even mounts — captured here at module scope
// (imported first thing in main.jsx) so a listener registered later by a
// component can't miss it. iOS Safari never fires this event at all and
// has no programmatic install API whatsoever (a deliberate WebKit
// restriction, not something any web app can work around) — the only
// path there is the manual Share -> Add to Home Screen menu, which is
// why isIOSDevice() exists: to show instructions instead of a button.

let deferred = null;
const listeners = new Set();

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e;
  listeners.forEach((fn) => fn(e));
});

window.addEventListener("appinstalled", () => {
  deferred = null;
});

export function getDeferredInstallPrompt() {
  return deferred;
}

// Returns an unsubscribe function. Calls `fn` immediately if the event
// already fired before this was called.
export function onInstallPromptAvailable(fn) {
  if (deferred) fn(deferred);
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isStandalone() {
  return (
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true // iOS Safari's own (non-standard) flag
  );
}

// iPadOS 13+ masks its user agent as a desktop Mac, so UA sniffing alone
// misses iPads — multi-touch is the giveaway a "Mac" is actually an iPad.
export function isIOSDevice() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
