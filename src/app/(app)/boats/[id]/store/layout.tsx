import { getBoatContext } from "@/lib/boat-access";
import { SegLink } from "@/components/seg-link";
import { getTranslator } from "@/lib/i18n/locale";

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getBoatContext(id);
  const { t } = await getTranslator();

  const SUB_TABS = [
    { href: "/store/shopping", label: t("store_shopping") },
    { href: "/store/transfer", label: t("store_transfer") },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-xl bg-[#EAEDF2] p-1">
        {SUB_TABS.map((tab) => (
          <SegLink key={tab.href} href={`/boats/${id}${tab.href}`} label={tab.label} />
        ))}
      </div>
      {children}
    </div>
  );
}
