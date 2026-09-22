import { ChevronLeft, KeyRound, Languages, LogOut } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/locale";
import { LOCALE_INFO } from "@/lib/i18n/constants";
import { SettingsRow } from "@/components/settings/settings-row";
import { NotificationsRow } from "@/components/settings/notifications-row";
import { InstallAppRow } from "@/components/settings/install-app-row";
import { TestPushTool } from "@/components/settings/test-push-tool";
import { PushSubscribersList, type PushSubscriberRow } from "@/components/settings/push-subscribers-list";

// Open to every role (unlike /users or /technicians) - just requireProfile,
// no management-only gate.
export default async function SettingsPage() {
  const profile = await requireProfile();
  const { t, locale } = await getTranslator();

  let pushTestUsers: { id: string; label: string }[] = [];
  let pushSubscriberRows: PushSubscriberRow[] = [];
  if (profile.role === "management") {
    const supabase = await createClient();
    // push_subscriptions RLS only lets a user see their own row
    // (see 0018_push_subscriptions.sql) - the regular client would silently
    // return every other user's row as empty here, making this admin-only
    // overview lie (confirmed live: it showed 0 devices for a captain whose
    // notifications actually work). The admin client bypasses RLS - safe
    // here since this whole block is already gated on profile.role ===
    // "management" above, and this is a read-only diagnostic query.
    const admin = createAdminClient();
    const [{ data: profiles }, { data: boats }, { data: subscriptions }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role, boat_id").order("full_name"),
      supabase.from("boats").select("id, name"),
      admin.from("push_subscriptions").select("user_id, created_at"),
    ]);

    pushTestUsers = (profiles ?? []).map((p) => ({ id: p.id, label: p.full_name ? `${p.full_name} (${p.email})` : p.email ?? p.id }));

    const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));
    // One profile can have several devices (endpoints) - grouped down to a
    // count plus the most recent registration date, not a full device list
    // (nobody needs to tell two subscriptions on the same phone apart here).
    const byUser = new Map<string, { count: number; latest: string | null }>();
    for (const s of subscriptions ?? []) {
      const entry = byUser.get(s.user_id) ?? { count: 0, latest: null };
      entry.count += 1;
      if (!entry.latest || s.created_at > entry.latest) entry.latest = s.created_at;
      byUser.set(s.user_id, entry);
    }
    pushSubscriberRows = (profiles ?? []).map((p) => {
      const sub = byUser.get(p.id);
      return {
        id: p.id,
        label: p.full_name ? `${p.full_name} (${p.email})` : (p.email ?? p.id),
        role: p.role,
        boatName: p.boat_id ? (boatNameById.get(p.boat_id) ?? null) : null,
        deviceCount: sub?.count ?? 0,
        lastRegistered: sub?.latest ?? null,
      };
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("nav_settings")}</h1>

      <div className="flex flex-col gap-2.5">
        <SettingsRow icon={KeyRound} label={t("change_password")} href="/settings/change-password" />
        <SettingsRow
          icon={Languages}
          label={t("settings_language_row")}
          href="/settings/language"
          trailing={
            <>
              <span className="text-sm text-fleet-ink">{LOCALE_INFO[locale].label}</span>
              <ChevronLeft size={16} className="shrink-0 text-fleet-ink" />
            </>
          }
        />
        <NotificationsRow locale={locale} />
        <InstallAppRow locale={locale} />
        <SettingsRow icon={LogOut} label={t("logout")} formAction={logout} />
      </div>

      {profile.role === "management" && pushSubscriberRows.length > 0 && <PushSubscribersList rows={pushSubscriberRows} />}

      {profile.role === "management" && pushTestUsers.length > 0 && (
        <TestPushTool users={pushTestUsers} currentUserId={profile.id} />
      )}
    </div>
  );
}
