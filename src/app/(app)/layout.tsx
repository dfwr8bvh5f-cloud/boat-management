import Link from "next/link";
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
  if (profile.boat_id) {
    const supabase = await createClient();
    const { data: boat } = await supabase
      .from("boats")
      .select("name")
      .eq("id", profile.boat_id)
      .single();
    myBoatName = boat?.name ?? null;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-bold text-teal-800">
              <span className="text-xl">⚓</span>
              <span>ניהול צי סירות</span>
            </Link>

            <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
              {profile.role === "management" ? (
                <>
                  <Link href="/boats" className="hover:text-teal-700">
                    כל הסירות
                  </Link>
                  <Link href="/users" className="hover:text-teal-700">
                    משתמשים
                  </Link>
                </>
              ) : profile.boat_id ? (
                <Link href={`/boats/${profile.boat_id}`} className="hover:text-teal-700">
                  {myBoatName ?? "הסירה שלי"}
                </Link>
              ) : null}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-end text-sm leading-tight">
              <div className="font-medium text-slate-800">{profile.full_name ?? "משתמש"}</div>
              <div className="text-xs text-slate-500">{ROLE_LABELS[profile.role]}</div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
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
