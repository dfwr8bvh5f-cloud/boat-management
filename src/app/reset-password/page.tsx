import Image from "next/image";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslator } from "@/lib/i18n/locale";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { t, locale } = await getTranslator();

  return (
    <div
      className="fleet-hero-gradient relative flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-[calc(4rem+env(safe-area-inset-top))] text-fleet-paper"
    >
      <div className="absolute top-4 end-4">
        <LanguageSwitcher current={locale} dark />
      </div>
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white p-1">
        <Image src="/mys-logo.png" alt="" width={64} height={64} className="h-full w-full object-contain" />
      </div>
      <h1 className="mt-4 text-2xl font-light tracking-[0.15em]">{t("reset_password_title")}</h1>
      <div className="my-3 h-px w-9 bg-fleet-brass opacity-70" />
      <p className="mb-8 max-w-xs text-center text-sm opacity-75">{t("reset_password_subtitle")}</p>

      <div className="w-full max-w-sm rounded-xl border border-fleet-brass/40 bg-white/[0.08] p-6">
        {error ? (
          <p className="rounded-lg border border-fleet-coral/50 bg-fleet-coral/10 px-3 py-2 text-sm text-fleet-coral">
            {t("reset_password_invalid_link")}
          </p>
        ) : (
          <ResetPasswordForm
            labels={{
              newPassword: t("reset_password_new_label"),
              submit: t("reset_password_submit"),
              updating: t("reset_password_updating"),
              success: t("reset_password_success"),
              loginNow: t("reset_password_login_now"),
            }}
          />
        )}
      </div>
    </div>
  );
}
