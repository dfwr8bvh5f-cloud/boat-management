"use client";

import { useState, useTransition } from "react";
import { setUserAccess } from "@/lib/actions/users";
import { CALENDAR_FREE_COLOR, USAGE_TYPE_COLORS } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// Same switch as the crew "active" toggle (staff-manager.tsx): on = the user can
// sign in, off = access is blocked but the account is kept. Flips instantly and
// rolls back if the server refuses.
export function UserAccessToggle({ userId, active: initialActive, locale }: { userId: string; active: boolean; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [active, setActive] = useState(initialActive);
  const [, startTransition] = useTransition();
  const label = active ? t("staff_active_label") : t("staff_inactive_label");

  const toggle = () => {
    const next = !active;
    setActive(next);
    startTransition(async () => {
      const res = await setUserAccess(userId, next);
      if (res.error) setActive(!next);
    });
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      dir="ltr"
      onClick={toggle}
      title={label}
      aria-label={label}
      style={{ background: active ? CALENDAR_FREE_COLOR : USAGE_TYPE_COLORS.charter }}
      className="relative h-5 w-9 shrink-0 rounded-full"
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${active ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}
