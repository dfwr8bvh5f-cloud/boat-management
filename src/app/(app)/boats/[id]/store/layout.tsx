import { getBoatContext } from "@/lib/boat-access";
import { SegLink } from "@/components/seg-link";

const SUB_TABS = [
  { href: "/store/shopping", label: "רשימת קניות" },
  { href: "/store/transfer", label: "הזמנת הסעה" },
] as const;

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getBoatContext(id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-xl bg-slate-200/60 p-1">
        {SUB_TABS.map((tab) => (
          <SegLink key={tab.href} href={`/boats/${id}${tab.href}`} label={tab.label} />
        ))}
      </div>
      {children}
    </div>
  );
}
