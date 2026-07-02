import Image from "next/image";
import { LoginForm } from "@/components/login-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslator } from "@/lib/i18n/locale";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  const { t, locale } = await getTranslator();

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center px-6 py-16 text-fleet-paper"
      style={{ background: "linear-gradient(160deg, #0B1F38 0%, #15324F 60%, #13283F 100%)" }}
    >
      <div className="absolute top-4 end-4">
        <LanguageSwitcher current={locale} dark />
      </div>
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white p-1">
        <Image src="/mys-logo.png" alt="" width={64} height={64} className="h-full w-full object-contain" />
      </div>
      <h1 className="mt-4 text-3xl font-light tracking-[0.2em]">{t("login_title")}</h1>
      <div className="my-3 h-px w-9 bg-fleet-brass opacity-70" />
      <p className="mb-8 text-sm opacity-75">{t("login_subtitle")}</p>

      <div className="w-full max-w-sm rounded-xl border border-fleet-brass/40 bg-white/[0.08] p-6">
        <LoginForm
          redirectTo={redirectTo || "/"}
          labels={{
            email: t("login_email"),
            password: t("login_password"),
            submit: t("login_submit"),
            submitting: t("login_submitting"),
          }}
        />
      </div>
    </div>
  );
}
