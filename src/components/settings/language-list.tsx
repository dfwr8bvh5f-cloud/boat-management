"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { setLocale } from "@/lib/actions/locale";
import { LOCALE_INFO } from "@/lib/i18n/constants";
import type { Locale } from "@/lib/i18n/dictionaries";

export function LanguageList({ current }: { current: Locale }) {
  const [pending, startTransition] = useTransition();
  const locales = Object.keys(LOCALE_INFO) as Locale[];

  return (
    <div className="flex flex-col gap-2">
      {locales.map((locale) => {
        const selected = locale === current;
        return (
          <button
            key={locale}
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => setLocale(locale))}
            className="flex w-full items-center justify-between rounded-xl border border-fleet-border bg-white p-3.5 text-start text-sm font-semibold text-fleet-navy transition-shadow hover:shadow-sm disabled:opacity-60"
          >
            {LOCALE_INFO[locale].label}
            {selected && <Check size={16} className="text-fleet-moss-text" />}
          </button>
        );
      })}
    </div>
  );
}
