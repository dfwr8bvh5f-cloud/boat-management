"use client";

import { useEffect } from "react";
import "@/lib/pwa-install";

// Renders nothing - just makes sure the service worker is registered and
// the beforeinstallprompt/appinstalled listeners (see lib/pwa-install.ts)
// are attached as early as possible on every page load, not only once a
// user happens to open Settings. Chrome's install-eligibility check and
// the beforeinstallprompt event both depend on this having already run.
export function PwaBootstrap() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
