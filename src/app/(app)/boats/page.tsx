import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";
import { Plus, Ship, Users, ClipboardCheck } from "lucide-react";

export default async function BoatsPage() {
  const profile = await requireProfile();

  if (profile.role !== "management") {
    redirect(profile.boat_id ? `/boats/${profile.boat_id}` : "/");
  }

  const supabase = await createClient();
  const [{ data: boats }, { count: crewCount }, pendingCounts] = await Promise.all([
    supabase.from("boats").select("*").order("name"),
    supabase.from("staff_visible").select("id", { count: "exact", head: true }).eq("status", "approved"),
    Promise.all(
      (["issues", "expenses", "staff", "incomes", "cash_transactions", "bookings", "documents"] as const).map(
        (table) => supabase.from(table).select("id", { count: "exact", head: true }).eq("status", "pending")
      )
    ),
  ]);
  const pendingCount = pendingCounts.reduce((sum, c) => sum + (c.count ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fleet-navy">הצי</h1>
        <Link
          href="/boats/new"
          className="flex items-center gap-1.5 rounded-full bg-fleet-navy px-3.5 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
        >
          <Plus size={15} /> סירה חדשה
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-fleet-ink">
            <Ship size={13} /> סירות בצי
          </div>
          <div className="text-lg font-bold text-fleet-navy">{boats?.length ?? 0}</div>
        </div>
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-fleet-ink">
            <Users size={13} /> סה״כ אנשי צוות
          </div>
          <div className="text-lg font-bold text-fleet-navy">{crewCount ?? 0}</div>
        </div>
        <Link
          href="/approvals"
          className="rounded-xl border border-fleet-border bg-white p-4 transition-shadow hover:shadow-sm"
        >
          <div className="mb-1 flex items-center gap-1.5 text-xs text-fleet-ink">
            <ClipboardCheck size={13} /> ממתינים לאישור בצי
          </div>
          <div className={`text-lg font-bold ${pendingCount > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
            {pendingCount}
          </div>
        </Link>
      </div>

      {boats && boats.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boats.map((boat) => (
            <Link
              key={boat.id}
              href={`/boats/${boat.id}`}
              className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
                    <Ship size={17} className="text-fleet-brass" />
                  </div>
                  <h2 className="font-bold text-fleet-navy">{boat.name}</h2>
                </div>
                <StatusBadge value={boat.status} />
              </div>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-fleet-ink">
                {boat.model && (
                  <>
                    <dt>דגם</dt>
                    <dd className="text-fleet-navy">{boat.model}</dd>
                  </>
                )}
                {boat.home_port && (
                  <>
                    <dt>נמל בית</dt>
                    <dd className="text-fleet-navy">{boat.home_port}</dd>
                  </>
                )}
                {boat.registration_number && (
                  <>
                    <dt>מספר רישוי</dt>
                    <dd className="text-fleet-navy">{boat.registration_number}</dd>
                  </>
                )}
              </dl>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-10 text-center text-sm text-fleet-ink">
          עדיין לא נוספו סירות לצי.
        </p>
      )}
    </div>
  );
}
