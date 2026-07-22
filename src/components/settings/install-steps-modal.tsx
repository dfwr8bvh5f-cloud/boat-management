"use client";

import { X, type LucideIcon } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

export function InstallStepsModal({
  locale,
  title,
  steps,
  onClose,
}: {
  locale: Locale;
  title: string;
  steps: { icon: LucideIcon; text: string }[];
  onClose: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-fleet-navy">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close_word")}
            className="rounded-lg p-1 text-fleet-ink hover:bg-fleet-paper"
          >
            <X size={16} />
          </button>
        </div>

        <ol className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fleet-paper text-sm font-bold text-fleet-brass">
                {i + 1}
              </div>
              <step.icon size={16} className="shrink-0 text-fleet-brass" />
              <span className="text-sm text-fleet-navy">{step.text}</span>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-fleet-border py-2.5 text-sm font-bold text-fleet-ink hover:bg-fleet-paper"
        >
          {t("close_word")}
        </button>
      </div>
    </div>
  );
}
