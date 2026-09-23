"use client";

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
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = readLocale();
  const stale = isStaleServerActionError(error.message);

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
        <button
          onClick={stale ? () => window.location.reload() : reset}
          className="mt-5 rounded-lg bg-fleet-teal px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          {translate(locale, "try_again")}
        </button>
      </div>
    </div>
  );
}
