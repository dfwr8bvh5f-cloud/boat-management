import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";

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
        <h1 className="text-2xl font-bold text-slate-900">כל הסירות</h1>
        <Link
          href="/boats/new"
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          + סירה חדשה
        </Link>
      </div>

      {boats && boats.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boats.map((boat) => (
            <Link
              key={boat.id}
              href={`/boats/${boat.id}`}
              className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{boat.name}</h2>
                <StatusBadge value={boat.status} />
              </div>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm text-slate-500">
                {boat.model && (
                  <>
                    <dt>דגם</dt>
                    <dd className="text-slate-700">{boat.model}</dd>
                  </>
                )}
                {boat.home_port && (
                  <>
                    <dt>נמל בית</dt>
                    <dd className="text-slate-700">{boat.home_port}</dd>
                  </>
                )}
                {boat.registration_number && (
                  <>
                    <dt>מספר רישוי</dt>
                    <dd className="text-slate-700">{boat.registration_number}</dd>
                  </>
                )}
              </dl>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          עדיין לא נוספו סירות לצי.
        </p>
      )}
    </div>
  );
}
