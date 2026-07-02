import Link from "next/link";
import Image from "next/image";
import { requireProfile } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/locale";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const { t, locale } = await getTranslator();

  let myBoatName: string | null = null;

  const supabase = await createClient();

  if (profile.boat_id) {
    const { data: boat } = await supabase
      .from("boats")
      .select("name")
      .eq("id", profile.boat_id)
      .single();
    myBoatName = boat?.name ?? null;
  }

  const roleLabel: Record<string, string> = {
    management: t("role_short_management"),
    captain: t("role_short_captain"),
    owner: t("role_short_owner"),
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-fleet-navy text-fleet-paper print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-wide">
              <Image src="/mys-logo.png" alt="" width={22} height={22} className="rounded-sm bg-white object-contain" />
              <span>{t("app_title")}</span>
            </Link>

            <nav className="flex items-center gap-4 text-sm font-medium text-fleet-paper/70">
              {profile.role === "management" ? (
                <>
                  <Link href="/boats" className="hover:text-fleet-paper">
                    {t("nav_all_boats")}
                  </Link>
                  <Link href="/users" className="hover:text-fleet-paper">
                    {t("nav_users")}
                  </Link>
                </>
              ) : profile.boat_id ? (
                <Link href={`/boats/${profile.boat_id}`} className="hover:text-fleet-paper">
                  {myBoatName ?? t("my_boat_fallback")}
                </Link>
              ) : null}
            </nav>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            <LanguageSwitcher current={locale} dark />
            <div className="text-end text-sm leading-tight">
              <div className="font-medium text-fleet-paper">{profile.full_name ?? t("user_fallback")}</div>
              <div className="text-xs text-fleet-paper/60">{roleLabel[profile.role]}</div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-fleet-brass/40 px-3 py-1.5 text-sm font-medium text-fleet-paper/80 hover:bg-white/10"
              >
                {t("logout")}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
