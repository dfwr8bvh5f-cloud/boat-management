import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createBoat } from "@/lib/actions/boats";
import { BoatForm } from "@/components/boat-form";

export default async function NewBoatPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">סירה חדשה</h1>
      <form action={createBoat} className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6">
        <BoatForm />
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            צור סירה
          </button>
        </div>
      </form>
    </div>
  );
}
