"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Wraps the common "run a server action, then router.refresh() to pull the
// updated data" pattern used throughout the app's manager components.
//
// Two real bugs come from calling router.refresh() bare inside a plain
// onClick handler (confirmed across the app - see the loading-states audit):
//
// 1. router.refresh() has signature `refresh(): void` - it schedules a
//    re-fetch of the current route's Server Components and returns
//    immediately, with no way to await the resulting re-render. A handler
//    that clears its own busy/pending flag right after calling it (the
//    universal shape before this hook existed) clears the indicator before
//    the refreshed data has actually painted - a 100-600ms window where the
//    button looks idle again but the screen is still showing stale data.
// 2. Next.js's loading.tsx creates a real Suspense boundary around the whole
//    route. A bare router.refresh() re-suspends that boundary exactly like a
//    first navigation does, which swaps the ENTIRE page to its loading.tsx
//    skeleton and back - this is the "the page flickers/reloads" bug,
//    including why react-virtuoso lists lose their scroll position (the
//    whole subtree unmounts, not just the data that changed).
//
// Wrapping both the refresh call and the busy-flag clear inside
// startTransition fixes both at once: React keeps the current UI visible
// and interactive for the duration of the transition instead of showing the
// Suspense fallback (this is React's own documented mechanism for exactly
// this situation - a form <action> gets this for free automatically, which
// is why that pattern never showed either bug; a plain onClick handler
// doesn't, which is why this hook exists), and because the busy-flag clear
// is itself a transition update, it only actually commits once the
// refreshed Server Component payload is ready to paint - never before.
//
// Usage (single global busy flag - the common case):
//
//   const { pending, run } = useRefreshTransition();
//   <Button loading={pending} onClick={() => run(() => deleteThing(id))}>
//
// Usage (per-row busy tracking in a list - keep your own id-keyed state,
// only the refresh+clear needs to move inside startTransition):
//
//   const [busyId, setBusyId] = useState<string | null>(null);
//   const { startTransition } = useRefreshTransition();
//   const onDelete = async (id: string) => {
//     setBusyId(id);
//     try {
//       await deleteThing(id);
//       startTransition(() => { router.refresh(); setBusyId(null); });
//     } catch (e) {
//       setBusyId(null);
//       setError(...);
//     }
//   };
//   // render: loading={busyId === row.id}
export function useRefreshTransition() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Runs `action`, then refreshes the route and clears `busy` together in
  // one transition. Rethrows on failure so the caller's own catch block can
  // show an error - `busy` is always cleared first so a failed action never
  // leaves a button stuck disabled.
  const run = useCallback(
    async (action: () => Promise<void>, onSettled?: () => void) => {
      setBusy(true);
      try {
        await action();
        startTransition(() => {
          router.refresh();
          onSettled?.();
          setBusy(false);
        });
      } catch (e) {
        setBusy(false);
        throw e;
      }
    },
    [router]
  );

  return { pending: busy || isPending, run, startTransition, router };
}
