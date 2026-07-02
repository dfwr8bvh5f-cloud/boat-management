import { Users, Ship, Clock, CheckCircle2 } from "lucide-react";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { createTransferRequest, markTransferArranged, deleteTransferRequest } from "@/lib/actions/transfers";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { TRANSFER_VEHICLE_LABELS } from "@/lib/labels";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export default async function TransferRequestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile } = await getBoatContext(id);
  const canCreate = profile.role === "owner" || profile.role === "management";
  const isManagement = profile.role === "management";

  const supabase = await createClient();
  const { data: transfers } = await supabase
    .from("transfer_requests")
    .select("*")
    .eq("boat_id", boat.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <form action={createTransferRequest.bind(null, boat.id)} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <h2 className="text-sm font-semibold text-fleet-navy">הזמנת הסעה חדשה</h2>
          <p className="rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-xs text-fleet-ink">
            שימו לב: לא ניתן להתחבר אוטומטית ללוח הטיסות בזמן אמת — יש להזין את מספר הטיסה וזמן הנחיתה ידנית.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-fleet-ink">
              כמות אנשים
              <input name="people_count" type="number" min={1} defaultValue={1} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fleet-ink">
              תאריך
              <input name="transfer_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fleet-ink">
              מספר טיסה
              <input name="flight_number" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fleet-ink">
              זמן נחיתה
              <input name="landing_time" type="time" className={inputClass} />
            </label>
          </div>
          <select name="vehicle" defaultValue="van" className={inputClass}>
            <option value="van">ואן</option>
            <option value="taxi">מונית רגילה</option>
          </select>
          <input name="pickup" required placeholder="מיקום איסוף *" className={inputClass} />
          <input name="dropoff" required placeholder="מיקום הורדה *" className={inputClass} />
          <textarea name="notes" rows={2} placeholder="הערות" className={inputClass} />
          <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            שלח בקשה
          </button>
        </form>
      )}

      {!transfers || transfers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          אין הזמנות הסעה עדיין.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {transfers.map((tr) => (
            <div key={tr.id} className="rounded-xl border border-fleet-border bg-white p-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
                  {tr.vehicle === "van" ? (
                    <Users size={17} className="text-fleet-brass" />
                  ) : (
                    <Ship size={17} className="text-fleet-brass" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">
                    {tr.pickup} → {tr.dropoff}
                  </div>
                  <div className="text-xs text-fleet-ink">
                    {tr.people_count} אנשים · {TRANSFER_VEHICLE_LABELS[tr.vehicle]} · {tr.transfer_date}
                    {tr.landing_time ? ` · ${tr.landing_time}` : ""}
                  </div>
                  {tr.flight_number && <div className="text-xs text-fleet-ink">מספר טיסה: {tr.flight_number}</div>}
                  {tr.notes && <div className="mt-0.5 text-xs text-fleet-ink">{tr.notes}</div>}
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                {isManagement && !tr.arranged ? (
                  <form action={markTransferArranged.bind(null, boat.id, tr.id)}>
                    <button
                      type="submit"
                      className="rounded-full border border-fleet-brass px-2.5 py-1 text-xs font-bold text-fleet-brass"
                    >
                      סמן כתואם
                    </button>
                  </form>
                ) : (
                  <span
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${
                      tr.arranged ? "border-fleet-moss text-fleet-moss" : "border-fleet-brass text-fleet-brass"
                    }`}
                  >
                    {tr.arranged ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                    {tr.arranged ? "תואם" : "ממתין לתיאום"}
                  </span>
                )}
                {canCreate && (
                  <form action={deleteTransferRequest.bind(null, boat.id, tr.id)}>
                    <ConfirmSubmitButton confirmMessage="למחוק את ההזמנה?" className="text-xs font-medium text-fleet-coral hover:underline">
                      מחק
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
