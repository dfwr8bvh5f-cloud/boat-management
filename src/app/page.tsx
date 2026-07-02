import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";

export default async function Home() {
  const profile = await requireProfile();

  if (profile.role === "management") {
    redirect("/boats");
  }

  if (profile.boat_id) {
    redirect(`/boats/${profile.boat_id}`);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16 text-center">
      <div className="max-w-md rounded-xl border border-fleet-brass/40 bg-white p-8">
        <h1 className="text-lg font-bold text-fleet-navy">לא משויכת סירה לחשבון שלך</h1>
        <p className="mt-2 text-sm text-fleet-ink">פנה/י לצוות הניהול כדי לשייך אותך לסירה.</p>
      </div>
    </div>
  );
}
