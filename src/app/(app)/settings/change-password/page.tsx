import { requireProfile } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/locale";
import { SettingsSubpageHeader } from "@/components/settings/settings-subpage-header";
import { ChangePasswordForm } from "@/components/settings/change-password-form";

export default async function ChangePasswordPage() {
  const profile = await requireProfile();
  const { t, locale } = await getTranslator();

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubpageHeader title={t("change_password")} backLabel={t("nav_settings")} />
      <div className="max-w-md">
        <ChangePasswordForm email={profile.email ?? ""} locale={locale} />
      </div>
    </div>
  );
}
