import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createUserAccount, deleteUserAccount } from "@/lib/actions/users";
import { UserRow } from "@/components/user-row";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export default async function UsersPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const supabase = await createClient();
  const [{ data: users }, { data: boats }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("boats").select("id, name").order("name"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">משתמשים</h1>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-start text-slate-500">
              <th className="px-4 py-3 font-medium">אימייל</th>
              <th className="px-4 py-3 font-medium">שם, תפקיד וסירה</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users?.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                boats={boats ?? []}
                isSelf={user.id === profile.id}
                deleteAction={deleteUserAccount.bind(null, user.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <form
        action={createUserAccount}
        className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h2 className="text-sm font-semibold text-slate-900 sm:col-span-2 lg:col-span-3">
          יצירת משתמש חדש
        </h2>
        <input name="full_name" placeholder="שם מלא" className={inputClass} />
        <input name="email" type="email" required placeholder="אימייל *" className={inputClass} />
        <input
          name="password"
          type="text"
          required
          minLength={8}
          placeholder="סיסמה זמנית (לפחות 8 תווים) *"
          className={inputClass}
        />
        <select name="role" defaultValue="captain" className={inputClass}>
          <option value="management">ניהול</option>
          <option value="captain">קפטן</option>
          <option value="owner">בעלים</option>
        </select>
        <select name="boat_id" defaultValue="" className={inputClass}>
          <option value="">— ללא סירה (לתפקיד ניהול) —</option>
          {boats?.map((boat) => (
            <option key={boat.id} value={boat.id}>
              {boat.name}
            </option>
          ))}
        </select>
        <div className="sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            צור משתמש
          </button>
        </div>
      </form>
    </div>
  );
}
