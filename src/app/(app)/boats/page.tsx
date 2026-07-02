import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";
import { Plus, Ship } from "lucide-react";

export default async function BoatsPage() {
  const profile = await requireProfile();

  if (profile.role !== "management") {
    redirect(profile.boat_id ? `/boats/${profile.boat_id}` : "/");
  }

  const supabase = await createClient();
  const { data: boats } = await supabase.from("boats").select("*").order("name");

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
