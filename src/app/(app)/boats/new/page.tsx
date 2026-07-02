import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createBoat } from "@/lib/actions/boats";
import { BoatForm } from "@/components/boat-form";

export default async function NewBoatPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-fleet-navy">סירה חדשה</h1>
      <form action={createBoat} className="flex flex-col gap-6 rounded-xl border border-fleet-border bg-white p-5">
        <BoatForm />
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-fleet-teal px-6 py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            צור סירה
          </button>
        </div>
      </form>
    </div>
  );
}
