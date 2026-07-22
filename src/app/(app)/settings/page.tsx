import { ChevronLeft, KeyRound, Languages, LogOut } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/locale";
import { LOCALE_INFO } from "@/lib/i18n/constants";
import { SettingsRow } from "@/components/settings/settings-row";
import { NotificationsRow } from "@/components/settings/notifications-row";
import { InstallAppRow } from "@/components/settings/install-app-row";
import { TestPushTool } from "@/components/settings/test-push-tool";

// Open to every role (unlike /users or /technicians) - just requireProfile,
// no management-only gate.
export default async function SettingsPage() {
  const profile = await requireProfile();
  const { t, locale } = await getTranslator();

  let pushTestUsers: { id: string; label: string }[] = [];
  if (profile.role === "management") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name");
    pushTestUsers = (data ?? []).map((p) => ({ id: p.id, label: p.full_name ? `${p.full_name} (${p.email})` : p.email ?? p.id }));
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

      {profile.role === "management" && pushTestUsers.length > 0 && <TestPushTool users={pushTestUsers} />}
    </div>
  );
}
