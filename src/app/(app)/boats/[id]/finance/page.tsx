import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { createFinancialRecord, deleteFinancialRecord } from "@/lib/actions/finance";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

function formatCurrency(n: number) {
  return `₪${n.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}

export default async function FinancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit } = await getBoatContext(id);

  const supabase = await createClient();
  const { data: records } = await supabase
    .from("financial_records")
    .select("*")
    .eq("boat_id", boat.id)
    .order("record_date", { ascending: false });

  const income = records?.filter((r) => r.type === "income").reduce((sum, r) => sum + r.amount, 0) ?? 0;
  const expense = records?.filter((r) => r.type === "expense").reduce((sum, r) => sum + r.amount, 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500">הכנסות</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{formatCurrency(income)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500">הוצאות</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{formatCurrency(expense)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500">מאזן</div>
          <div className={`mt-1 text-2xl font-bold ${income - expense >= 0 ? "text-slate-900" : "text-red-700"}`}>
            {formatCurrency(income - expense)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-start text-slate-500">
              <th className="px-4 py-3 font-medium">תאריך</th>
              <th className="px-4 py-3 font-medium">סוג</th>
              <th className="px-4 py-3 font-medium">קטגוריה</th>
              <th className="px-4 py-3 font-medium">תיאור</th>
              <th className="px-4 py-3 font-medium">סכום</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {records?.map((record) => (
              <tr key={record.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-600">{record.record_date}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={record.type} />
                </td>
                <td className="px-4 py-3 text-slate-600">{record.category ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{record.description ?? "—"}</td>
                <td
                  className={`px-4 py-3 font-medium ${
                    record.type === "income" ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {formatCurrency(record.amount)}
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <form action={deleteFinancialRecord.bind(null, boat.id, record.id)}>
                      <ConfirmSubmitButton
                        confirmMessage="למחוק את הרשומה הכספית?"
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
                  אין רשומות כספיות עדיין.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form
          action={createFinancialRecord.bind(null, boat.id)}
          className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <h2 className="text-sm font-semibold text-slate-900 sm:col-span-2 lg:col-span-3">
            הוספת רשומה כספית
          </h2>
          <select name="type" defaultValue="expense" className={inputClass}>
            <option value="income">הכנסה</option>
            <option value="expense">הוצאה</option>
          </select>
          <input name="category" placeholder="קטגוריה" className={inputClass} />
          <input name="amount" type="number" step="0.01" required placeholder="סכום (₪) *" className={inputClass} />
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            תאריך
            <input name="record_date" type="date" className={inputClass} />
          </label>
          <input
            name="description"
            placeholder="תיאור"
            className={`${inputClass} sm:col-span-2 lg:col-span-2`}
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
