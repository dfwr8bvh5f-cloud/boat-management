"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wrench, Wallet, CalendarRange, FileText, FileBarChart, Users, ShoppingCart, Tag } from "lucide-react";

const TAB_ICONS = {
  overview: LayoutDashboard,
  maintenance: Wrench,
  finance: Wallet,
  bookings: CalendarRange,
  documents: FileText,
  reports: FileBarChart,
  staff: Users,
  store: ShoppingCart,
  catalog: Tag,
} as const;

export type TabIconName = keyof typeof TAB_ICONS;

export function TabLink({
  href,
  label,
  icon,
  exact = false,
}: {
  href: string;
  label: string;
  icon: TabIconName;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));
  const Icon = TAB_ICONS[icon];

  return (
    <Link
      href={href}
      className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-t-lg border-b-2 px-0.5 py-1.5 text-center transition-colors ${
        active
          ? "border-fleet-navy text-fleet-navy"
          : "border-transparent text-fleet-ink hover:bg-fleet-paper hover:text-fleet-navy"
      }`}
    >
      <Icon size={16} />
      <span className="w-full text-[8px] font-medium leading-[1.1]">{label}</span>
    </Link>
  );
}
