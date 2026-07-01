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
      <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8">
        <h1 className="text-lg font-semibold text-amber-900">לא משויכת סירה לחשבון שלך</h1>
        <p className="mt-2 text-sm text-amber-800">פנה/י לצוות הניהול כדי לשייך אותך לסירה.</p>
      </div>
    </div>
  );
}
