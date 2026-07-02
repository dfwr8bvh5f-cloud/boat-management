import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/locale";

export default async function Home() {
  const profile = await requireProfile();

  if (profile.role === "management") {
    redirect("/boats");
  }

  if (profile.boat_id) {
    redirect(`/boats/${profile.boat_id}`);
  }

  const { t } = await getTranslator();

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16 text-center">
      <div className="max-w-md rounded-xl border border-fleet-brass/40 bg-white p-8">
        <h1 className="text-lg font-bold text-fleet-navy">{t("no_boat_assigned")}</h1>
        <p className="mt-2 text-sm text-fleet-ink">{t("contact_management")}</p>
      </div>
    </div>
  );
}
