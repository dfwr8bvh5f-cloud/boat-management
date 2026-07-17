import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { UserEditForm } from "@/components/user-edit-form";
import { getTranslator } from "@/lib/i18n/locale";
import type { Profile } from "@/lib/types/database";

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
        <UserEditForm user={user} boats={boats} locale={locale} />
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
