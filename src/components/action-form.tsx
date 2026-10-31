"use client";

import { useRef, useState } from "react";
import { RotateCw, X } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// Drop-in replacement for `<form action={serverAction}>` on one-click
// approve/delete style forms. A bare form action that throws (network
// blip, a guarded server-side refusal) isn't caught anywhere local, so it
// bubbled to the nearest error boundary and swapped the whole page for the
// "something went wrong" card - every filter, open panel and typed value
// gone. Here the failure is caught, logged, and shown as a fixed-position
// notice (no layout shift) with a retry that re-submits the same form,
// while the rest of the screen stays exactly as it was.
export function ActionForm({
  action,
  locale,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<unknown>;
  locale: Locale;
  className?: string;
  children: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <form
      ref={formRef}
      className={className}
      action={async (formData) => {
        setFailed(false);
        try {
          await action(formData);
        } catch (err) {
          console.error("ActionForm: server action failed", err);
          setFailed(true);
        }
      }}
    >
      {children}
      {failed && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-fleet-coral/40 bg-white p-3 text-sm text-fleet-coral-text shadow-xl"
        >
          <span className="min-w-0 flex-1">{t("save_failed")}</span>
          <button
            type="button"
            className="flex items-center gap-1.5 font-bold hover:underline"
            onClick={() => {
              setFailed(false);
              formRef.current?.requestSubmit();
            }}
          >
            <RotateCw size={14} />
            {t("try_again")}
          </button>
          <button type="button" aria-label={t("dismiss_word")} className="text-fleet-ink" onClick={() => setFailed(false)}>
            <X size={14} />
          </button>
        </div>
      )}
    </form>
  );
}
