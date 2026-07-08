"use client";

import { useRef, useState, useTransition } from "react";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

export function AutoSaveForm({
  action,
  children,
  className,
  debounceMs = 800,
  locale,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  className?: string;
  debounceMs?: number;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const formRef = useRef<HTMLFormElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("save_failed"));
      }
    });
  };

  const scheduleSave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (debounceMs === 0) {
      save();
    } else {
      timeoutRef.current = setTimeout(save, debounceMs);
    }
  };

  return (
    <form
      ref={formRef}
      className={className}
      onChange={scheduleSave}
      onSubmit={(e) => {
        e.preventDefault();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        save();
      }}
    >
      {children}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-fleet-teal px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {t("save_changes_button")}
        </button>
        {(pending || saved || error) && (
          <div className={`text-xs ${error ? "text-fleet-coral" : "text-fleet-moss"}`}>
            {error ? error : pending ? t("saving_word") : t("saved_word")}
          </div>
        )}
      </div>
    </form>
  );
}
