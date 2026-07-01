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
        className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <BoatForm boat={boat} disabled={!canEdit} />
        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              שמור שינויים
            </button>
          </div>
        )}
      </form>

      {profile.role === "management" && (
        <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-5">
          <div>
            <h2 className="font-semibold text-red-900">מחיקת סירה</h2>
            <p className="text-sm text-red-700">פעולה זו תמחק לצמיתות את הסירה ואת כל הנתונים המקושרים אליה.</p>
          </div>
          <form action={deleteBoat.bind(null, boat.id)}>
            <ConfirmSubmitButton
              confirmMessage="למחוק את הסירה לצמיתות? הפעולה בלתי הפיכה."
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              מחק סירה
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
