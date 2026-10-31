import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createBoat } from "@/lib/actions/boats";
import { BoatForm } from "@/components/boat-form";
import { Button } from "@/components/ui/button";
import { getTranslator } from "@/lib/i18n/locale";

export default async function NewBoatPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { t } = await getTranslator();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("add_boat")}</h1>
      <form action={createBoat} className="flex flex-col gap-4 rounded-xl border border-fleet-border bg-white p-5">
        <BoatForm />
        <div className="flex justify-end">
          <Button type="submit" variant="primary">
            {t("create_boat_button")}
          </Button>
        </div>
      </form>
    </div>
  );
}
