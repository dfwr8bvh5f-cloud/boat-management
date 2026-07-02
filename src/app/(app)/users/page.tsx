import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteUserAccount } from "@/lib/actions/users";
import { UserRow } from "@/components/user-row";
import { CreateUserForm } from "@/components/create-user-form";

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
      <h1 className="text-2xl font-bold text-fleet-navy">משתמשים</h1>

      <div className="overflow-x-auto rounded-xl border border-fleet-border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-fleet-border text-start text-fleet-ink">
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

      <CreateUserForm boats={boats ?? []} />
    </div>
  );
}
