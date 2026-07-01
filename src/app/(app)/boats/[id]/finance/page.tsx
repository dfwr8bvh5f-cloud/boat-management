import { redirect } from "next/navigation";

export default async function FinanceIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/boats/${id}/finance/expenses`);
}
