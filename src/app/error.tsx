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

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = readLocale();

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-lg rounded-xl border border-fleet-coral/40 bg-white p-8 text-center">
        <h1 className="text-lg font-bold text-fleet-coral-text">{translate(locale, "error_generic_title")}</h1>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-fleet-ink" dir="ltr">
          {error.message}
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-lg bg-fleet-teal px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          {translate(locale, "try_again")}
        </button>
      </div>
    </div>
  );
}
