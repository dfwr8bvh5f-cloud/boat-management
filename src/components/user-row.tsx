import { updateUserAccount } from "@/lib/actions/users";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { getTranslator } from "@/lib/i18n/locale";
import { INPUT_CLASS_INLINE } from "@/lib/ui-classes";
import type { Profile } from "@/lib/types/database";

const fieldClass = INPUT_CLASS_INLINE;

export async function UserRow({
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
  const { t, locale } = await getTranslator();

  return (
    <tr className="border-b border-fleet-border last:border-0 align-top">
      <td className="px-4 py-3">
        <form action={updateUserAccount.bind(null, user.id)} className="flex flex-wrap items-center gap-2">
          <input
            name="full_name"
            defaultValue={user.full_name ?? ""}
            placeholder={t("name_word")}
            className={`${fieldClass} w-28`}
          />
          <select name="role" defaultValue={user.role} className={fieldClass}>
            <option value="management">{t("role_short_management")}</option>
            <option value="captain">{t("role_short_captain")}</option>
            <option value="owner">{t("role_short_owner")}</option>
          </select>
          <select name="boat_id" defaultValue={user.boat_id ?? ""} className={fieldClass}>
            <option value="">{t("no_boat_option")}</option>
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
            {t("update_word")}
          </button>
        </form>
      </td>
      <td className="px-4 py-3 text-end">
        <div className="flex flex-col items-end gap-2">
          <ResetPasswordButton userId={user.id} locale={locale} />
          {!isSelf && (
            <form action={deleteAction}>
              <ConfirmSubmitButton
                locale={locale}
                confirmMessage={t("delete_user_confirm")}
                className="text-xs font-medium text-fleet-coral hover:underline"
              >
                {t("delete_word")}
              </ConfirmSubmitButton>
            </form>
          )}
        </div>
      </td>
    </tr>
  );
}
