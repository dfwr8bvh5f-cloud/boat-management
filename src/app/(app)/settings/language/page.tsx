import { requireProfile } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/locale";
import { SettingsSubpageHeader } from "@/components/settings/settings-subpage-header";
import { LanguageList } from "@/components/settings/language-list";

export default async function SettingsLanguagePage() {
  await requireProfile();
  const { t, locale } = await getTranslator();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <SettingsSubpageHeader title={t("settings_language_row")} backLabel={t("nav_settings")} />
      <LanguageList current={locale} />
    </div>
  );
}
