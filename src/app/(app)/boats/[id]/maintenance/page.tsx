import { redirect } from "next/navigation";

export default async function MaintenanceIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/boats/${id}/maintenance/issues`);
}
