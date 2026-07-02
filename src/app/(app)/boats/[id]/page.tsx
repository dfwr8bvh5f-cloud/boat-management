import { getBoatContext } from "@/lib/boat-access";
import { updateBoat, deleteBoat } from "@/lib/actions/boats";
import { BoatForm } from "@/components/boat-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export default async function BoatOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit, profile } = await getBoatContext(id);

  return (
    <div className="flex flex-col gap-6">
      <form
        action={updateBoat.bind(null, boat.id)}
        className="flex flex-col gap-6 rounded-xl border border-fleet-border bg-white p-5"
      >
        <BoatForm boat={boat} disabled={!canEdit} />
        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-fleet-teal px-6 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              שמור שינויים
            </button>
          </div>
        )}
      </form>

      {profile.role === "management" && (
        <div className="flex items-center justify-between rounded-xl border border-fleet-coral/40 bg-fleet-coral/10 p-4">
          <div>
            <h2 className="text-sm font-bold text-fleet-coral">מחיקת סירה</h2>
            <p className="text-xs text-fleet-coral/80">פעולה זו תמחק לצמיתות את הסירה ואת כל הנתונים המקושרים אליה.</p>
          </div>
          <form action={deleteBoat.bind(null, boat.id)}>
            <ConfirmSubmitButton
              confirmMessage="למחוק את הסירה לצמיתות? הפעולה בלתי הפיכה."
              className="rounded-lg border border-fleet-coral/50 bg-white px-4 py-2 text-xs font-bold text-fleet-coral hover:bg-fleet-coral/10"
            >
              מחק סירה
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
