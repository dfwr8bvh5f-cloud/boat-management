"use client";

import { useRef, useState, useTransition } from "react";
import { createUserAccount } from "@/lib/actions/users";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

const inputClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-2 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

export function CreateUserForm({ boats, locale }: { boats: { id: string; name: string }[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
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
            setError(e instanceof Error ? e.message : t("create_user_error"));
          }
        });
      }}
      className="grid grid-cols-1 gap-4 rounded-xl border border-fleet-border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      <h2 className="text-sm font-bold text-fleet-navy sm:col-span-2 lg:col-span-3">
        {t("create_user_title")}
      </h2>
      <input name="full_name" placeholder={t("create_user_full_name_placeholder")} className={inputClass} />
      <input name="email" type="email" required placeholder={t("create_user_email_placeholder")} className={inputClass} />
      <input
        name="password"
        type="text"
        required
        minLength={8}
        placeholder={t("create_user_password_placeholder")}
        className={inputClass}
      />
      <select name="role" defaultValue="captain" className={inputClass}>
        <option value="management">{t("role_short_management")}</option>
        <option value="captain">{t("role_short_captain")}</option>
        <option value="owner">{t("role_short_owner")}</option>
      </select>
      <select name="boat_id" defaultValue="" className={inputClass}>
        <option value="">{t("create_user_no_boat_option")}</option>
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
          {pending ? t("create_user_submitting") : t("create_user_submit")}
        </button>
      </div>
    </form>
  );
}
