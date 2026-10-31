"use client";

import { useEffect } from "react";
import { translate } from "@/lib/i18n/translate";
import { LOCALE_COOKIE } from "@/lib/i18n/constants";
import type { Locale } from "@/lib/i18n/dictionaries";

function readLocale(): Locale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  const value = match?.[1];
  return value === "he" || value === "en" || value === "el" ? value : "en";
}

// Next.js identifies a server action by a hash of its compiled id, which
// changes on every deploy - a tab left open across a deploy still holds the
// old hash in its JS bundle, so submitting any form action in it throws
// exactly this "Server Action ... was not found on the server" message.
// reset() re-renders the same (still-stale) client bundle, so it can never
// fix this - only a real reload, fetching the current bundle, can. Confirmed
// live: a management user hit this mid-edit after several deploys landed
// while her tab stayed open.
function isStaleServerActionError(message: string): boolean {
  return message.includes("Server Action") && message.includes("was not found");
}

export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  // Next 16.2+: re-fetches the segment's server data before re-rendering,
  // which is what actually recovers from a transient failed query - reset()
  // alone re-renders without refetching, so it would just throw again.
  unstable_retry?: () => void;
}) {
  const locale = readLocale();
  const stale = isStaleServerActionError(error.message);

  // In production, Next.js replaces error.message with a fixed, unhelpful
  // boilerplate string for any Server Component render error and keeps the
  // real detail only in error.digest - logging it here (and showing it
  // below) is the only way to ever recover a trace-able reference, since
  // nothing on this screen otherwise survives to be reported back.
  useEffect(() => {
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-lg rounded-xl border border-fleet-coral/40 bg-white p-8 text-center">
        <h1 className="text-lg font-bold text-fleet-coral-text">
          {translate(locale, stale ? "error_stale_version_title" : "error_generic_title")}
        </h1>
        {stale ? (
          <p className="mt-2 text-sm text-fleet-ink">{translate(locale, "error_stale_version_body")}</p>
        ) : (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-fleet-ink" dir="ltr">
            {error.message}
          </p>
        )}
        {error.digest && (
          <p className="mt-2 font-mono text-2xs text-fleet-ink/60" dir="ltr">
            {translate(locale, "error_code_label")}: {error.digest}
          </p>
        )}
        <button
          onClick={stale ? () => window.location.reload() : (unstable_retry ?? reset)}
          className="mt-5 rounded-lg bg-fleet-teal px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          {translate(locale, "try_again")}
        </button>
      </div>
    </div>
  );
}
