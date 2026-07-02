import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { uploadDocument, deleteDocument, approveDocument } from "@/lib/actions/documents";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

function isExpiringSoon(dateStr: string | null) {
  if (!dateStr) return false;
  const days = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  return days < 30;
}

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const isManagement = profile.role === "management";

  const supabase = await createClient();
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("boat_id", boat.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      {profile.role === "owner" && (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
          מוצגים רק מסמכים שאושרו על ידי הניהול.
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-start text-slate-500">
              <th className="px-4 py-3 font-medium">שם</th>
              <th className="px-4 py-3 font-medium">סוג</th>
              <th className="px-4 py-3 font-medium">תוקף</th>
              <th className="px-4 py-3 font-medium">סטטוס</th>
              <th className="px-4 py-3 font-medium" />
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {documents?.map((doc) => (
              <tr key={doc.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{doc.name}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={doc.doc_type} />
                </td>
                <td className="px-4 py-3">
                  {doc.expiry_date ? (
                    <span className={isExpiringSoon(doc.expiry_date) ? "font-medium text-red-600" : "text-slate-600"}>
                      {doc.expiry_date}
                      {isExpiringSoon(doc.expiry_date) ? " (בקרוב פג תוקף)" : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge value={doc.status} />
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/boats/${boat.id}/documents/${doc.id}/download`}
                    className="text-xs font-medium text-teal-700 hover:underline"
                  >
                    הורדה
                  </a>
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {isManagement && doc.status === "pending" && (
                        <form action={approveDocument.bind(null, boat.id, doc.id)}>
                          <button type="submit" className="text-xs font-medium text-emerald-700 hover:underline">
                            אשר
                          </button>
                        </form>
                      )}
                      <form action={deleteDocument.bind(null, boat.id, doc.id, doc.file_path)}>
                        <ConfirmSubmitButton
                          confirmMessage="למחוק את המסמך?"
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          מחק
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {(!documents || documents.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  אין מסמכים עדיין.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form
          action={uploadDocument.bind(null, boat.id)}
          encType="multipart/form-data"
          className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <h2 className="text-sm font-semibold text-slate-900 sm:col-span-2 lg:col-span-3">
            העלאת מסמך
          </h2>
          <input name="name" placeholder="שם המסמך" className={inputClass} />
          <select name="doc_type" defaultValue="other" className={inputClass}>
            <option value="insurance">ביטוח</option>
            <option value="license">רישיון</option>
            <option value="registration">רישום</option>
            <option value="other">אחר</option>
          </select>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            תאריך תפוגה
            <input name="expiry_date" type="date" className={inputClass} />
          </label>
          <input name="file" type="file" required className={`${inputClass} sm:col-span-2 lg:col-span-3`} />
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              העלה
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
