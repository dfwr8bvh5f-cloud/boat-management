import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteUserAccount } from "@/lib/actions/users";
import { uploadCompanyLogo, removeCompanyLogo, updateCompanyLogoPosition } from "@/lib/actions/company-settings";
import { UserRow } from "@/components/user-row";
import { CreateUserForm } from "@/components/create-user-form";
import { AutoSaveForm } from "@/components/autosave-form";
import { LogoPositionAdjuster } from "@/components/logo-position-adjuster";
import { getTranslator } from "@/lib/i18n/locale";

export default async function UsersPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { t, locale } = await getTranslator();
  const supabase = await createClient();
  const [{ data: users }, { data: boats }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("boats").select("id, name").order("name"),
    supabase
      .from("app_settings")
      .select("company_logo_path, company_logo_position_x, company_logo_position_y")
      .eq("id", true)
      .single(),
  ]);

  let companyLogoUrl: string | null = null;
  if (settings?.company_logo_path) {
    const { data } = await supabase.storage.from("company-assets").createSignedUrl(settings.company_logo_path, 3600);
    companyLogoUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("nav_users")}</h1>

      <div className="flex items-start gap-3 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper p-3">
        {companyLogoUrl && settings ? (
          <LogoPositionAdjuster
            imageUrl={companyLogoUrl}
            x={settings.company_logo_position_x}
            y={settings.company_logo_position_y}
            onPositionChange={updateCompanyLogoPosition}
            onRemove={removeCompanyLogo}
            frameClassName="h-16 w-16 rounded-md"
            locale={locale}
          />
        ) : null}
        <AutoSaveForm action={uploadCompanyLogo} debounceMs={0} locale={locale} className="flex items-center gap-2">
          <span className="text-xs font-bold text-fleet-navy">{t("company_logo_field")}</span>
          <input name="logo" type="file" accept="image/*" className="min-w-0 flex-1 text-xs" />
        </AutoSaveForm>
      </div>

      <div className="overflow-x-auto rounded-xl border border-fleet-border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-fleet-border text-start text-fleet-ink">
              <th className="px-4 py-3 font-medium">{t("users_col_name")}</th>
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

      <CreateUserForm boats={boats ?? []} locale={locale} />
    </div>
  );
}
