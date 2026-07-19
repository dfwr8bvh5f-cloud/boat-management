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
    <div className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3">
      <UserEditForm user={user} boats={boats} locale={locale} />
      <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-fleet-border pt-2">
        <ResetPasswordButton userId={user.id} locale={locale} />
        {!isSelf && (
          <form action={deleteAction}>
            <ConfirmSubmitButton
              locale={locale}
              confirmMessage={t("delete_user_confirm")}
              className="py-2 text-xs font-medium text-fleet-coral hover:underline"
            >
              {t("delete_word")}
            </ConfirmSubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
