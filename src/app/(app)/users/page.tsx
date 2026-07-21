import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteUserAccount } from "@/lib/actions/users";
import { UserRow } from "@/components/user-row";
import { CreateUserForm } from "@/components/create-user-form";
import { getTranslator } from "@/lib/i18n/locale";

export default async function UsersPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { t, locale } = await getTranslator();
  const supabase = await createClient();
  const [{ data: users }, { data: boats }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("boats").select("id, name").order("name"),
  ]);

  // Fleet managers (no boat) first, then everyone else grouped by their
  // boat's name - matches how the fleet itself is organized, instead of
  // creation-date order.
  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));
  const sortedUsers = [...(users ?? [])].sort((a, b) => {
    if (a.role === "management" && b.role !== "management") return -1;
    if (b.role === "management" && a.role !== "management") return 1;
    const boatA = a.boat_id ? (boatNameById.get(a.boat_id) ?? "") : "";
    const boatB = b.boat_id ? (boatNameById.get(b.boat_id) ?? "") : "";
    return boatA.localeCompare(boatB, locale) || (a.full_name ?? "").localeCompare(b.full_name ?? "", locale);
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("nav_users")}</h1>

      <div className="flex flex-col gap-2">
        {sortedUsers.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            boats={boats ?? []}
            isSelf={user.id === profile.id}
            deleteAction={deleteUserAccount.bind(null, user.id)}
          />
        ))}
      </div>

      <CreateUserForm boats={boats ?? []} locale={locale} />
    </div>
  );
}
