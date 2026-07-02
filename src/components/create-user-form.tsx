"use client";

import { useRef, useState, useTransition } from "react";
import { createUserAccount } from "@/lib/actions/users";

const inputClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-2 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

export function CreateUserForm({ boats }: { boats: { id: string; name: string }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            await createUserAccount(formData);
            formRef.current?.reset();
          } catch (e) {
            setError(e instanceof Error ? e.message : "שגיאה ביצירת משתמש");
          }
        });
      }}
      className="grid grid-cols-1 gap-4 rounded-xl border border-fleet-border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      <h2 className="text-sm font-bold text-fleet-navy sm:col-span-2 lg:col-span-3">
        יצירת משתמש חדש
      </h2>
      <input name="full_name" placeholder="שם מלא" className={inputClass} />
      <input name="email" type="email" required placeholder="אימייל *" className={inputClass} />
      <input
        name="password"
        type="text"
        required
        minLength={8}
        placeholder="סיסמה זמנית (לפחות 8 תווים) *"
        className={inputClass}
      />
      <select name="role" defaultValue="captain" className={inputClass}>
        <option value="management">ניהול</option>
        <option value="captain">קפטן</option>
        <option value="owner">בעלים</option>
      </select>
      <select name="boat_id" defaultValue="" className={inputClass}>
        <option value="">— ללא סירה (לתפקיד ניהול) —</option>
        {boats.map((boat) => (
          <option key={boat.id} value={boat.id}>
            {boat.name}
          </option>
        ))}
      </select>
      {error && (
        <p className="sm:col-span-2 lg:col-span-3 rounded-lg border border-fleet-coral/50 bg-fleet-coral/10 px-3 py-2 text-sm text-fleet-coral">
          {error}
        </p>
      )}
      <div className="sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-fleet-teal px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "יוצר…" : "צור משתמש"}
        </button>
      </div>
    </form>
  );
}
