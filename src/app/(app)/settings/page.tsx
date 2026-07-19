import { ChevronLeft, KeyRound, Languages, LogOut } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { getTranslator } from "@/lib/i18n/locale";
import { LOCALE_INFO } from "@/lib/i18n/constants";
import { SettingsRow } from "@/components/settings/settings-row";
import { NotificationsRow } from "@/components/settings/notifications-row";
import { InstallAppRow } from "@/components/settings/install-app-row";

// Open to every role (unlike /users or /technicians) - just requireProfile,
// no management-only gate.
export default async function SettingsPage() {
  await requireProfile();
  const { t, locale } = await getTranslator();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("nav_settings")}</h1>

      <div className="flex max-w-md flex-col gap-2.5">
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
      </div>

      <div className="max-w-md">
        <SettingsRow icon={LogOut} label={t("logout")} formAction={logout} tone="destructive" trailing={null} />
      </div>
    </div>
  );
}
