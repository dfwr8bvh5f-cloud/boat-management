import Link from "next/link";
import Image from "next/image";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslator } from "@/lib/i18n/locale";

export default async function ForgotPasswordPage() {
  const { t, locale } = await getTranslator();

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center px-6 py-16 text-fleet-paper"
      style={{ background: "linear-gradient(180deg, #132B49 0%, #19365C 100%)" }}
    >
      <div className="absolute top-4 end-4">
        <LanguageSwitcher current={locale} dark />
      </div>
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white p-1">
        <Image src="/mys-logo.png" alt="" width={64} height={64} className="h-full w-full object-contain" />
      </div>
      <h1 className="mt-4 text-2xl font-light tracking-[0.15em]">{t("forgot_password_title")}</h1>
      <div className="my-3 h-px w-9 bg-fleet-brass opacity-70" />
      <p className="mb-8 max-w-xs text-center text-sm opacity-75">{t("forgot_password_subtitle")}</p>

      <div className="w-full max-w-sm rounded-xl border border-fleet-brass/40 bg-white/[0.08] p-6">
        <ForgotPasswordForm
          labels={{
            email: t("login_email"),
            submit: t("forgot_password_submit"),
            sending: t("forgot_password_sending"),
            sent: t("forgot_password_sent"),
          }}
        />
      </div>

      <Link href="/login" className="mt-6 text-sm text-fleet-paper/70 hover:text-fleet-paper hover:underline">
        ← {t("back_to_login")}
      </Link>
    </div>
  );
}
