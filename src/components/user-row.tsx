import { updateUserAccount } from "@/lib/actions/users";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ResetPasswordButton } from "@/components/reset-password-button";
import type { Profile } from "@/lib/types/database";

const fieldClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-2 py-1.5 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

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
    <tr className="border-b border-fleet-border last:border-0 align-top">
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
            className="rounded-lg border border-fleet-navy px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
          >
            עדכן
          </button>
        </form>
      </td>
      <td className="px-4 py-3 text-end">
        <div className="flex flex-col items-end gap-2">
          <ResetPasswordButton userId={user.id} />
          {!isSelf && (
            <form action={deleteAction}>
              <ConfirmSubmitButton
                confirmMessage="למחוק את המשתמש לצמיתות?"
                className="text-xs font-medium text-fleet-coral hover:underline"
              >
                מחק
              </ConfirmSubmitButton>
            </form>
          )}
        </div>
      </td>
    </tr>
  );
}
