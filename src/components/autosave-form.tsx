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
  onSaved,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  className?: string;
  debounceMs?: number;
  locale: Locale;
  // Only fires for the explicit submit-button click, not for the
  // onChange-triggered auto-save - closing a panel mid-edit just because a
  // field changed would be a jarring surprise.
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const formRef = useRef<HTMLFormElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSave = async () => {
    const form = formRef.current;
    if (!form) return false;
    const formData = new FormData(form);
    setError(null);
    try {
      await action(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("save_failed"));
      return false;
    }
  };

  const scheduleSave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (debounceMs === 0) {
      startTransition(async () => {
        await doSave();
      });
    } else {
      timeoutRef.current = setTimeout(() => {
        startTransition(async () => {
          await doSave();
        });
      }, debounceMs);
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
        startTransition(async () => {
          const ok = await doSave();
          if (ok) onSaved?.();
        });
      }}
    >
      {children}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-fleet-teal px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitLabel ?? t("save_changes_button")}
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
