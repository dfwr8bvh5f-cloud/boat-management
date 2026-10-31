"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createUserAccount } from "@/lib/actions/users";
import { CustomSelect } from "@/components/custom-select";
import { RippleLoader } from "@/components/ripple-loader";
import { Button } from "@/components/ui/button";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS_COMPACT } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { UserRole } from "@/lib/types/database";

const inputClass = INPUT_CLASS_COMPACT;
const labelClass = "text-xs text-fleet-ink";

export function CreateUserForm({ boats, locale }: { boats: { id: string; name: string }[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [roleValue, setRoleValue] = useState<UserRole | "">("");
  const [boatValue, setBoatValue] = useState("");
  const [roleError, setRoleError] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpen((o) => !o)}>
          {open ? (
            <>
              <X size={14} /> {t("close_word")}
            </>
          ) : (
            <>
              <Plus size={14} /> {t("create_user_submit")}
            </>
          )}
        </Button>
      </div>

      {open && (
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
                  setSaved(true);
                  setTimeout(() => {
                    setSaved(false);
                    setOpen(false);
                  }, 1400);
                }
              } catch (e) {
                setError(e instanceof Error ? e.message : t("create_user_error"));
              }
            });
          }}
          className="mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
        >
          <h2 className="text-sm font-bold text-fleet-navy">{t("create_user_title")}</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="full_name" className={labelClass}>
                {t("create_user_full_name_placeholder")}
              </label>
              <input id="full_name" name="full_name" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className={labelClass}>
                {t("create_user_email_placeholder")}
              </label>
              <input id="email" name="email" type="email" required className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className={labelClass}>
                {t("create_user_password_placeholder")}
              </label>
              <input id="password" name="password" type="text" required minLength={8} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{t("choose_role")} *</label>
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
              {roleError && <p className="text-2xs text-fleet-coral-text">{t("choose_role")}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{t("boat_word")}</label>
              <CustomSelect
                name="boat_id"
                value={boatValue}
                onChange={setBoatValue}
                options={[{ value: "", label: t("create_user_no_boat_option") }, ...boats.map((b) => ({ value: b.id, label: b.name }))]}
                className={inputClass}
              />
            </div>
          </div>

          {error && <p className="text-xs text-fleet-coral-text">{error}</p>}
          <div>
            <Button type="submit" disabled={pending || saved} className="px-6">
              {pending ? (
                <>
                  <RippleLoader size="sm" /> {t("create_user_submitting")}
                </>
              ) : saved ? (
                <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
              ) : (
                t("create_user_submit")
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
