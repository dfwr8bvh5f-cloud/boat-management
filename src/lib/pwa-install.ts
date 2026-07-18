// Chrome/Edge only fire `beforeinstallprompt` once, and only to listeners
// already attached when it fires - which can happen before a user ever
// visits the Settings page. This module attaches the listener at import
// time (from PwaBootstrap, mounted in the root layout so it's on every
// page) and holds the event in a plain module-level singleton so any
// component mounted later (like the Settings install row) can still read
// it. A tiny pub/sub set lets those components re-render when the event
// arrives or when the app finishes installing.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

export function getDeferredPrompt() {
  return deferredPrompt;
}

export function clearDeferredPrompt() {
  deferredPrompt = null;
  notify();
}

export function markInstalled() {
  installed = true;
  notify();
}

export function wasInstallEventSeen() {
  return installed;
}

export function subscribePwaInstall(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// True when the app is currently running as an installed/standalone app -
// checked independently of the `appinstalled` event, since that event only
// fires once at the moment of installation, not on every later launch.
export function isRunningStandalone() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export type PwaPlatform = "ios" | "android" | "desktop" | "other";

export function detectPwaPlatform(): PwaPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
  if (isIos) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Win|Mac|Linux/.test(navigator.platform || "")) return "desktop";
  return "other";
}
