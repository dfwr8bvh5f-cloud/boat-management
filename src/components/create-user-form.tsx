"use client";

import { useRef, useState, useTransition } from "react";
import { createUserAccount } from "@/lib/actions/users";
import { CustomSelect } from "@/components/custom-select";
import { RippleLoader } from "@/components/ripple-loader";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { UserRole } from "@/lib/types/database";

const inputClass = INPUT_CLASS;

export function CreateUserForm({ boats, locale }: { boats: { id: string; name: string }[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roleValue, setRoleValue] = useState<UserRole | "">("");
  const [boatValue, setBoatValue] = useState("");
  const [roleError, setRoleError] = useState(false);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        if (!roleValue) {
          setRoleError(true);
          return;
        }
        startTransition(async () => {
          try {
            const result = await createUserAccount(formData);
            if (result.error) {
              setError(result.error);
            } else {
              formRef.current?.reset();
              setRoleValue("");
              setBoatValue("");
            }
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
      <div className="flex flex-col gap-1">
        <CustomSelect
          name="role"
          value={roleValue}
          onChange={(v) => {
            setRoleValue(v as UserRole);
            setRoleError(false);
          }}
          options={[
            { value: "management", label: t("role_short_management") },
            { value: "captain", label: t("role_short_captain") },
            { value: "owner", label: t("role_short_owner") },
          ]}
          placeholder={t("choose_role")}
          emphasizeEmpty
          className={inputClass}
        />
        {roleError && <p className="text-xs text-fleet-coral-text">{t("choose_role")}</p>}
      </div>
      <CustomSelect
        name="boat_id"
        value={boatValue}
        onChange={setBoatValue}
        options={[{ value: "", label: t("create_user_no_boat_option") }, ...boats.map((b) => ({ value: b.id, label: b.name }))]}
        className={inputClass}
      />
      {error && (
        <p className="sm:col-span-2 lg:col-span-3 rounded-lg border border-fleet-coral/50 bg-fleet-coral/10 px-3 py-2 text-sm text-fleet-coral-text">
          {error}
        </p>
      )}
      <div className="sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-fleet-teal px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending && <RippleLoader size="sm" />}
          {pending ? t("create_user_submitting") : t("create_user_submit")}
        </button>
      </div>
    </form>
  );
}
