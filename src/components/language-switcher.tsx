"use client";

import { useTransition } from "react";
import { setLocale } from "@/lib/actions/locale";
import { LOCALE_INFO } from "@/lib/i18n/constants";
import type { Locale } from "@/lib/i18n/dictionaries";

export function LanguageSwitcher({ current, dark = false }: { current: Locale; dark?: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-0.5">
      {(Object.keys(LOCALE_INFO) as Locale[]).map((locale) => (
        <button
          key={locale}
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setLocale(locale))}
          className={`rounded-full border px-1 py-0.5 text-[9px] font-bold leading-none transition-colors disabled:opacity-60 ${
            current === locale
              ? dark
                ? "border-fleet-brass bg-fleet-brass/20 text-fleet-paper"
                : "border-fleet-navy bg-fleet-navy text-fleet-paper"
              : dark
                ? "border-fleet-paper/20 text-fleet-paper/60 hover:text-fleet-paper"
                : "border-fleet-border text-fleet-ink hover:text-fleet-navy"
          }`}
        >
          {LOCALE_INFO[locale].label}
        </button>
      ))}
    </div>
  );
}
