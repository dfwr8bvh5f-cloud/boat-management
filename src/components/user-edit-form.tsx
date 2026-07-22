"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Pencil, CheckCircle2, X } from "lucide-react";
import { updateUserAccount } from "@/lib/actions/users";
import { CustomSelect } from "@/components/custom-select";
import { RippleLoader } from "@/components/ripple-loader";
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
  actions,
}: {
  user: Profile;
  boats: { id: string; name: string }[];
  locale: Locale;
  actions?: ReactNode;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [roleValue, setRoleValue] = useState<UserRole>(user.role);
  const [boatValue, setBoatValue] = useState(user.boat_id ?? "");

  const roleLabels: Record<UserRole, string> = {
    management: t("role_short_management"),
    captain: t("role_short_captain"),
    owner: t("role_short_owner"),
  };
  const boatName = boats.find((b) => b.id === user.boat_id)?.name ?? null;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateUserAccount(user.id, formData);
        setSaved(true);
        setEditing(false);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error_generic_title"));
      }
    });
  };

  const cancelEdit = () => {
    setRoleValue(user.role);
    setBoatValue(user.boat_id ?? "");
    setError(null);
    setEditing(false);
  };

  const formId = `user-edit-${user.id}`;

  if (!editing) {
    // Read-only by default, same "text first, pencil to edit" pattern as
    // every other list in the app (documents, cash transactions) - this row
    // used to be permanently-open <input> fields with no labels at all,
    // the one screen that didn't match how everywhere else presents a list.
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full min-w-0 sm:w-36 sm:shrink-0">
            <div className="truncate text-sm font-semibold text-fleet-navy">{user.full_name || "—"}</div>
          </div>
          <div className="min-w-0 flex-1 truncate text-sm text-fleet-ink sm:w-64 sm:flex-none" dir="ltr">
            {user.email}
          </div>
          <div className="text-sm text-fleet-ink">{roleLabels[user.role]}</div>
          <div className="text-sm text-fleet-ink">{boatName ?? t("no_boat_option")}</div>
          <div className="ms-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t("update_word")}
              title={t("update_word")}
              className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-navy"
            >
              <Pencil size={16} />
            </button>
            {saved && <CheckCircle2 size={16} className="text-fleet-moss-text" aria-label={t("saved_word")} />}
            {actions}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <form id={formId} onSubmit={onSubmit} className="flex flex-1 flex-wrap items-center gap-2">
          <input
            name="full_name"
            defaultValue={user.full_name ?? ""}
            placeholder={t("name_word")}
            className={`${fieldClass} w-full sm:w-36`}
          />
          <input
            name="email"
            type="email"
            required
            defaultValue={user.email ?? ""}
            placeholder={t("login_email")}
            dir="ltr"
            className={`${fieldClass} w-full sm:w-64`}
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
        </form>
        {/* Grouped after the (flex-1) form, not inside it, so every action
            icon - including this submit button - sits together at the true
            end of the row instead of right after the boat select with a gap
            of empty space trailing it. The form= attribute keeps this a real
            submit button for #formId despite living outside its <form> tag. */}
        <div className="ms-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={cancelEdit}
            aria-label={t("cancel_word")}
            title={t("cancel_word")}
            className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
          >
            <X size={16} />
          </button>
          <button
            type="submit"
            form={formId}
            disabled={pending}
            aria-label={t("update_word")}
            title={t("update_word")}
            className={`flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-navy ${pending ? "opacity-50" : ""}`}
          >
            {pending ? <RippleLoader size="sm" /> : <Pencil size={16} />}
          </button>
          {actions}
        </div>
      </div>
      {error && <p className="text-xs text-fleet-coral-text">{error}</p>}
    </div>
  );
}
