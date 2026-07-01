import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { createMaintenanceRecord, deleteMaintenanceRecord } from "@/lib/actions/maintenance";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export default async function MaintenancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit } = await getBoatContext(id);

  const supabase = await createClient();
  const { data: records } = await supabase
    .from("maintenance_records")
    .select("*")
    .eq("boat_id", boat.id)
    .order("scheduled_date", { ascending: false, nullsFirst: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-start text-slate-500">
              <th className="px-4 py-3 font-medium">כותרת</th>
              <th className="px-4 py-3 font-medium">סטטוס</th>
              <th className="px-4 py-3 font-medium">תאריך מתוכנן</th>
              <th className="px-4 py-3 font-medium">תאריך סיום</th>
              <th className="px-4 py-3 font-medium">עלות</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {records?.map((record) => (
              <tr key={record.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{record.title}</div>
                  {record.description && (
                    <div className="text-xs text-slate-500">{record.description}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge value={record.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">{record.scheduled_date ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{record.completed_date ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {record.cost != null ? `₪${record.cost.toLocaleString("he-IL")}` : "—"}
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <form action={deleteMaintenanceRecord.bind(null, boat.id, record.id)}>
                      <ConfirmSubmitButton
                        confirmMessage="למחוק את רשומת התחזוקה?"
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        מחק
                      </ConfirmSubmitButton>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {(!records || records.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  אין רשומות תחזוקה עדיין.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form
          action={createMaintenanceRecord.bind(null, boat.id)}
          className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <h2 className="text-sm font-semibold text-slate-900 sm:col-span-2 lg:col-span-3">
            הוספת רשומת תחזוקה
          </h2>
          <input name="title" placeholder="כותרת *" required className={inputClass} />
          <select name="status" defaultValue="planned" className={inputClass}>
            <option value="planned">מתוכננת</option>
            <option value="in_progress">בביצוע</option>
            <option value="completed">הושלם</option>
          </select>
          <input name="cost" type="number" step="0.01" placeholder="עלות (₪)" className={inputClass} />
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            תאריך מתוכנן
            <input name="scheduled_date" type="date" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            תאריך סיום
            <input name="completed_date" type="date" className={inputClass} />
          </label>
          <input
            name="description"
            placeholder="תיאור"
            className={`${inputClass} sm:col-span-2 lg:col-span-3`}
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              הוסף
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
