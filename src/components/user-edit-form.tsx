"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil, CheckCircle2 } from "lucide-react";
import { updateUserAccount } from "@/lib/actions/users";
import { CustomSelect } from "@/components/custom-select";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS_INLINE } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Profile, UserRole } from "@/lib/types/database";

const fieldClass = INPUT_CLASS_INLINE;

// updateUserAccount throws on validation failure (missing boat for a role,
// duplicate email) - calling it from a client onSubmit instead of a bare
// <form action> lets that throw be caught here and shown inline, instead of
// propagating up to the app's root error boundary and taking over the whole
// page for a single row's edit.
export function UserEditForm({
  user,
  boats,
  locale,
}: {
  user: Profile;
  boats: { id: string; name: string }[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [roleValue, setRoleValue] = useState<UserRole>(user.role);
  const [boatValue, setBoatValue] = useState(user.boat_id ?? "");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateUserAccount(user.id, formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error_generic_title"));
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
        <input
          name="full_name"
          defaultValue={user.full_name ?? ""}
          placeholder={t("name_word")}
          className={`${fieldClass} w-full sm:w-28`}
        />
        <input
          name="email"
          type="email"
          required
          defaultValue={user.email ?? ""}
          placeholder={t("login_email")}
          dir="ltr"
          className={`${fieldClass} w-full sm:w-40`}
        />
        <CustomSelect
          name="role"
          value={roleValue}
          onChange={(v) => setRoleValue(v as UserRole)}
          options={[
            { value: "management", label: t("role_short_management") },
            { value: "captain", label: t("role_short_captain") },
            { value: "owner", label: t("role_short_owner") },
          ]}
          className={fieldClass}
        />
        <CustomSelect
          name="boat_id"
          value={boatValue}
          onChange={setBoatValue}
          options={[{ value: "", label: t("no_boat_option") }, ...boats.map((b) => ({ value: b.id, label: b.name }))]}
          className={fieldClass}
        />
        <button
          type="submit"
          disabled={pending}
          aria-label={t("update_word")}
          title={t("update_word")}
          className={`-m-2 p-2 text-fleet-ink hover:text-fleet-navy ${pending ? "opacity-50" : ""}`}
        >
          <Pencil size={16} />
        </button>
        {saved && <CheckCircle2 size={16} className="text-fleet-moss" aria-label={t("saved_word")} />}
      </form>
      {error && <p className="text-xs text-fleet-coral">{error}</p>}
    </div>
  );
}
