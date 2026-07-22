import Link from "next/link";
import Image from "next/image";
import { Settings, Users } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/locale";
import { NotificationPrompt } from "@/components/notification-prompt";

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
      <header
        className="fleet-hero-gradient pt-[env(safe-area-inset-top)] text-fleet-paper print:hidden"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-4">
              <Image
                src="/mys-logo.png"
                alt=""
                width={40}
                height={40}
                className="h-9 w-9 shrink-0 object-contain invert mix-blend-screen"
              />
              <div className="h-9 w-px shrink-0 bg-fleet-paper/20" />
              <div className="text-end">
                <Link href="/" className="whitespace-nowrap font-brand text-xl font-light tracking-[0.08em] sm:text-2xl">
                  {t("app_title")}
                </Link>
                <div className="mt-0.5 text-xs leading-tight text-fleet-paper/70">{roleLabel[profile.role]}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/settings"
                aria-label={t("nav_settings")}
                title={t("nav_settings")}
                className="rounded-lg border border-fleet-brass/40 p-2 text-fleet-paper/80 hover:bg-white/10"
              >
                <Settings size={16} />
              </Link>
            </div>
          </div>

          <nav className="flex items-center gap-4 text-sm font-medium text-fleet-paper/70">
            {profile.role === "management" ? (
              <>
                <Link href="/boats" className="py-1.5 hover:text-fleet-paper">
                  {t("nav_all_boats")}
                </Link>
                <Link
                  href="/users"
                  aria-label={t("nav_users")}
                  title={t("nav_users")}
                  className="-m-2 p-2 hover:text-fleet-paper"
                >
                  <Users size={16} />
                </Link>
              </>
            ) : profile.boat_id ? (
              <Link href={`/boats/${profile.boat_id}`} className="py-1.5 hover:text-fleet-paper">
                {myBoatName ?? t("my_boat_fallback")}
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <NotificationPrompt locale={locale} />
        {children}
      </main>
    </div>
  );
}
