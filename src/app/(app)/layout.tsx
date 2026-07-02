import Link from "next/link";
import Image from "next/image";
import { requireProfile } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";

const ROLE_LABELS: Record<string, string> = {
  management: "ניהול",
  captain: "קפטן",
  owner: "בעלים",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  let myBoatName: string | null = null;
  let pendingCount = 0;

  const supabase = await createClient();

  if (profile.boat_id) {
    const { data: boat } = await supabase
      .from("boats")
      .select("name")
      .eq("id", profile.boat_id)
      .single();
    myBoatName = boat?.name ?? null;
  }

  if (profile.role === "management") {
    const counts = await Promise.all(
      (["issues", "expenses", "staff", "incomes", "cash_transactions", "bookings", "documents"] as const).map(
        (table) => supabase.from(table).select("id", { count: "exact", head: true }).eq("status", "pending")
      )
    );
    pendingCount = counts.reduce((sum, c) => sum + (c.count ?? 0), 0);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-fleet-navy text-fleet-paper print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-wide">
              <Image src="/mys-logo.png" alt="" width={22} height={22} className="rounded-sm bg-white object-contain" />
              <span>MYS FLEET</span>
            </Link>

            <nav className="flex items-center gap-4 text-sm font-medium text-fleet-paper/70">
              {profile.role === "management" ? (
                <>
                  <Link href="/boats" className="hover:text-fleet-paper">
                    כל הסירות
                  </Link>
                  <Link href="/approvals" className="flex items-center gap-1.5 hover:text-fleet-paper">
                    אישורים
                    {pendingCount > 0 && (
                      <span className="rounded-full bg-fleet-coral px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                  <Link href="/users" className="hover:text-fleet-paper">
                    משתמשים
                  </Link>
                </>
              ) : profile.boat_id ? (
                <Link href={`/boats/${profile.boat_id}`} className="hover:text-fleet-paper">
                  {myBoatName ?? "הסירה שלי"}
                </Link>
              ) : null}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-end text-sm leading-tight">
              <div className="font-medium text-fleet-paper">{profile.full_name ?? "משתמש"}</div>
              <div className="text-xs text-fleet-paper/60">{ROLE_LABELS[profile.role]}</div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-fleet-brass/40 px-3 py-1.5 text-sm font-medium text-fleet-paper/80 hover:bg-white/10"
              >
                התנתקות
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
