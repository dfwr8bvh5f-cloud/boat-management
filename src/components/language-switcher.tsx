"use client";

import { useTransition } from "react";
import { setLocale } from "@/lib/actions/locale";
import { LOCALE_INFO } from "@/lib/i18n/constants";
import type { Locale } from "@/lib/i18n/dictionaries";

export function LanguageSwitcher({
  current,
  dark = false,
  variant = "pill",
}: {
  current: Locale;
  dark?: boolean;
  variant?: "pill" | "underline";
}) {
  const [pending, startTransition] = useTransition();
  const locales = Object.keys(LOCALE_INFO) as Locale[];

  if (variant === "underline") {
    return (
      <div className="flex items-center gap-1.5 text-[11px]">
        {locales.map((locale, i) => (
          <div key={locale} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-fleet-paper/30">|</span>}
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => setLocale(locale))}
              className={`border-b pb-0.5 font-medium transition-colors disabled:opacity-60 ${
                current === locale
                  ? "border-fleet-paper text-fleet-paper"
                  : "border-transparent text-fleet-paper/50 hover:text-fleet-paper/80"
              }`}
            >
              {LOCALE_INFO[locale].label}
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setLocale(locale))}
          className={`rounded-full border px-2.5 py-2 text-[10px] font-bold transition-colors disabled:opacity-60 ${
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
