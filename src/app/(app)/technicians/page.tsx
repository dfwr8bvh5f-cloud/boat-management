import { redirect } from "next/navigation";

// Moved under /technical so the Technical section's own tab bar (Defect
// List / Calendar / Technicians) stays visible while on this page too,
// instead of disappearing the moment she clicked into it. Kept as a
// redirect so the old URL still lands somewhere real.
export default async function TechniciansPage() {
  redirect("/technical/technicians");
}
