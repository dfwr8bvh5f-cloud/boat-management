import { redirect } from "next/navigation";

export default async function StoreIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/boats/${id}/store/shopping`);
}
