import { redirect } from "next/navigation";

// Superseded by /technical/issues (same fleet-wide issues list, now built on
// IssuesManager's own fleet mode - full filters/sort/add/edit, not just a
// read-only view). Kept as a redirect so the old URL (and any existing
// bookmark/link to it) still lands somewhere real.
export default async function FleetIssuesPage() {
  redirect("/technical/issues");
}
