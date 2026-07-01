import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { createSafetyItem, deleteSafetyItem } from "@/lib/actions/safety";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

function expiryStatus(expiryDate: string | null): { label: string; className: string } {
  if (!expiryDate) return { label: "בתוקף", className: "text-fleet-moss border-fleet-moss" };
  const days = Math.round((new Date(expiryDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: "פג תוקף", className: "text-fleet-coral border-fleet-coral" };
  if (days <= 30) return { label: "פג תוקף בקרוב", className: "text-fleet-brass border-fleet-brass" };
  return { label: "בתוקף", className: "text-fleet-moss border-fleet-moss" };
}

export default async function SafetyEquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit } = await getBoatContext(id);

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("documents")
    .select("*")
    .eq("boat_id", boat.id)
    .eq("doc_type", "safety")
    .order("expiry_date", { ascending: true, nullsFirst: false });

  return (
    <div className="flex flex-col gap-4">
      {(!items || items.length === 0) ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          אין ציוד בטיחות רשום.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((item) => {
            const status = expiryStatus(item.expiry_date);
            return (
              <div key={item.id} className="rounded-xl border border-fleet-border bg-white p-3">
                <div className="flex gap-3">
                  {item.file_path && (
                    <a href={`/boats/${boat.id}/documents/${item.id}/download`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/boats/${boat.id}/documents/${item.id}/download`}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{item.name}</div>
                    {item.last_checked_date && (
                      <div className="text-xs text-fleet-ink">נבדק לאחרונה: {item.last_checked_date}</div>
                    )}
                    {item.expiry_date && <div className="text-xs text-fleet-ink">תוקף: {item.expiry_date}</div>}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${status.className}`}>
                    {status.label}
                  </span>
                  {canEdit && (
                    <form action={deleteSafetyItem.bind(null, boat.id, item.id, item.file_path || null)}>
                      <ConfirmSubmitButton
                        confirmMessage="למחוק את פריט הבטיחות?"
                        className="text-xs font-medium text-fleet-coral hover:underline"
                      >
                        מחק
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <form
          action={createSafetyItem.bind(null, boat.id)}
          encType="multipart/form-data"
          className="grid grid-cols-1 gap-4 rounded-xl border border-fleet-border bg-white p-4 sm:grid-cols-2"
        >
          <h2 className="text-sm font-semibold text-fleet-navy sm:col-span-2">הוספת ציוד בטיחות</h2>
          <input name="name" required placeholder="שם הפריט *" className={inputClass} />
          <label className="flex flex-col gap-1 text-xs text-fleet-ink">
            נבדק לאחרונה
            <input name="last_checked_date" type="date" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fleet-ink">
            תאריך פקיעת תוקף
            <input name="expiry_date" type="date" className={inputClass} />
          </label>
          <input name="file" type="file" accept="image/*" className={inputClass} />
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-fleet-teal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              שמור
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
