"use client";

import { useRef, useState, useTransition } from "react";
import { resetUserPassword } from "@/lib/actions/users";

const fieldClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-2 py-1.5 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDone(false);
          setError(null);
        }}
        className="text-xs font-medium text-fleet-teal hover:underline"
      >
        איפוס סיסמה
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            await resetUserPassword(userId, formData);
            setDone(true);
            formRef.current?.reset();
          } catch (e) {
            setError(e instanceof Error ? e.message : "שגיאה באיפוס הסיסמה");
          }
        });
      }}
      className="flex flex-col gap-1"
    >
      <div className="flex items-center gap-1.5">
        <input
          name="password"
          type="text"
          required
          minLength={8}
          placeholder="סיסמה זמנית חדשה"
          className={`${fieldClass} w-40`}
        />
        <button type="submit" disabled={pending} className="rounded-lg border border-fleet-teal px-2.5 py-1.5 text-xs font-bold text-fleet-teal disabled:opacity-60">
          {pending ? "…" : "עדכן"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-fleet-ink">
          ✕
        </button>
      </div>
      {error && <p className="text-xs text-fleet-coral">{error}</p>}
      {done && <p className="text-xs text-fleet-moss">הסיסמה עודכנה ✓</p>}
    </form>
  );
}
