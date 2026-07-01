import { updateUserAccount } from "@/lib/actions/users";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import type { Profile } from "@/lib/types/database";

const fieldClass =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export function UserRow({
  user,
  boats,
  isSelf,
  deleteAction,
}: {
  user: Profile;
  boats: { id: string; name: string }[];
  isSelf: boolean;
  deleteAction: () => Promise<void>;
}) {
  return (
    <tr className="border-b border-slate-100 last:border-0 align-top">
      <td className="px-4 py-3 text-slate-600">{user.email}</td>
      <td className="px-4 py-3">
        <form action={updateUserAccount.bind(null, user.id)} className="flex flex-wrap items-center gap-2">
          <input
            name="full_name"
            defaultValue={user.full_name ?? ""}
            placeholder="שם"
            className={`${fieldClass} w-28`}
          />
          <select name="role" defaultValue={user.role} className={fieldClass}>
            <option value="management">ניהול</option>
            <option value="captain">קפטן</option>
            <option value="owner">בעלים</option>
          </select>
          <select name="boat_id" defaultValue={user.boat_id ?? ""} className={fieldClass}>
            <option value="">— ללא —</option>
            {boats.map((boat) => (
              <option key={boat.id} value={boat.id}>
                {boat.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
          >
            עדכן
          </button>
        </form>
      </td>
      <td className="px-4 py-3 text-end">
        {!isSelf && (
          <form action={deleteAction}>
            <ConfirmSubmitButton
              confirmMessage="למחוק את המשתמש לצמיתות?"
              className="text-xs font-medium text-red-600 hover:underline"
            >
              מחק
            </ConfirmSubmitButton>
          </form>
        )}
      </td>
    </tr>
  );
}
