import Link from "next/link";
import Image from "next/image";
import { LogOut, Users } from "lucide-react";
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
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href="/" className="flex items-center gap-3 whitespace-nowrap text-3xl font-bold tracking-wide">
                <Image src="/mys-logo.png" alt="" width={52} height={52} className="shrink-0 rounded-sm bg-white object-contain" />
                <span>{t("app_title")}</span>
              </Link>
              <div className="mt-1 text-xs leading-tight text-fleet-paper/70">
                <span>{roleLabel[profile.role]}</span>
              </div>
            </div>

            <form action={logout}>
              <button
                type="submit"
                aria-label={t("logout")}
                title={t("logout")}
                className="rounded-lg border border-fleet-brass/40 p-1.5 text-fleet-paper/80 hover:bg-white/10"
              >
                <LogOut size={15} />
              </button>
            </form>
          </div>

          <nav className="flex items-center gap-4 text-sm font-medium text-fleet-paper/70">
            {profile.role === "management" ? (
              <>
                <Link href="/boats" className="hover:text-fleet-paper">
                  {t("nav_all_boats")}
                </Link>
                <Link href="/users" aria-label={t("nav_users")} title={t("nav_users")} className="hover:text-fleet-paper">
                  <Users size={17} />
                </Link>
              </>
            ) : profile.boat_id ? (
              <Link href={`/boats/${profile.boat_id}`} className="hover:text-fleet-paper">
                {myBoatName ?? t("my_boat_fallback")}
              </Link>
            ) : null}
          </nav>

          <div className="flex justify-end">
            <LanguageSwitcher current={locale} dark />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
