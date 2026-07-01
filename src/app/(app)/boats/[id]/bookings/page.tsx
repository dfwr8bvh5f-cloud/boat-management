import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { createBooking, deleteBooking } from "@/lib/actions/bookings";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export default async function BookingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit } = await getBoatContext(id);

  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("boat_id", boat.id)
    .order("start_date", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-start text-slate-500">
              <th className="px-4 py-3 font-medium">לקוח</th>
              <th className="px-4 py-3 font-medium">מ־תאריך</th>
              <th className="px-4 py-3 font-medium">עד תאריך</th>
              <th className="px-4 py-3 font-medium">סטטוס</th>
              <th className="px-4 py-3 font-medium">מחיר</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {bookings?.map((booking) => (
              <tr key={booking.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{booking.customer_name}</div>
                  <div className="text-xs text-slate-500">
                    {[booking.customer_phone, booking.customer_email].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{booking.start_date}</td>
                <td className="px-4 py-3 text-slate-600">{booking.end_date}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={booking.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {booking.price != null ? `₪${booking.price.toLocaleString("he-IL")}` : "—"}
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <form action={deleteBooking.bind(null, boat.id, booking.id)}>
                      <ConfirmSubmitButton
                        confirmMessage="למחוק את ההזמנה?"
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        מחק
                      </ConfirmSubmitButton>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {(!bookings || bookings.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  אין הזמנות עדיין.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form
          action={createBooking.bind(null, boat.id)}
          className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <h2 className="text-sm font-semibold text-slate-900 sm:col-span-2 lg:col-span-3">
            הוספת הזמנה
          </h2>
          <input name="customer_name" placeholder="שם הלקוח *" required className={inputClass} />
          <input name="customer_phone" placeholder="טלפון" className={inputClass} />
          <input name="customer_email" placeholder="אימייל" type="email" className={inputClass} />
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            מתאריך *
            <input name="start_date" type="date" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            עד תאריך *
            <input name="end_date" type="date" required className={inputClass} />
          </label>
          <select name="status" defaultValue="pending" className={inputClass}>
            <option value="pending">ממתין</option>
            <option value="confirmed">מאושר</option>
            <option value="completed">הושלם</option>
            <option value="cancelled">בוטל</option>
          </select>
          <input name="price" type="number" step="0.01" placeholder="מחיר (₪)" className={inputClass} />
          <input name="notes" placeholder="הערות" className={`${inputClass} sm:col-span-2 lg:col-span-2`} />
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
