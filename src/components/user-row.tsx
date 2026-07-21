import { Trash2 } from "lucide-react";
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
    <div className="rounded-xl border border-fleet-border bg-white p-3">
      <UserEditForm
        user={user}
        boats={boats}
        locale={locale}
        actions={
          <>
            {!isSelf && (
              <form action={deleteAction}>
                <ConfirmSubmitButton
                  locale={locale}
                  confirmMessage={t("delete_user_confirm")}
                  ariaLabel={t("delete_word")}
                  className="-m-2 flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral"
                >
                  <Trash2 size={16} />
                </ConfirmSubmitButton>
              </form>
            )}
            <ResetPasswordButton userId={user.id} locale={locale} />
          </>
        }
      />
    </div>
  );
}
