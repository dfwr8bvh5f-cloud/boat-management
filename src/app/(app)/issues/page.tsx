import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { FleetIssuesList } from "@/components/fleet-issues-list";
import { getTranslator } from "@/lib/i18n/locale";
import type { Issue } from "@/lib/types/database";

export default async function FleetIssuesPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();

  const [{ data: boats }, issues] = await Promise.all([
    supabase.from("boats").select("id, name").neq("boat_type", "for_sale").order("name"),
    fetchAllRows<Issue>((from, to) =>
      supabase
        .from("issues")
        .select("*")
        .not("op_status", "in", "(completed,cancelled)")
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
  ]);

  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));
  const issuesWithBoat = issues.map((i) => ({ ...i, boatName: boatNameById.get(i.boat_id) ?? "" }));

  return <FleetIssuesList issues={issuesWithBoat} boats={boats ?? []} locale={locale} />;
}
