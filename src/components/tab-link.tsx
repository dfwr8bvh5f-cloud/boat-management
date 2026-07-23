"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Settings, Wallet, CalendarCheck, ClipboardList, PieChart, Users, Tag } from "lucide-react";

const TAB_ICONS = {
  overview: Compass,
  maintenance: Settings,
  finance: Wallet,
  bookings: CalendarCheck,
  documents: ClipboardList,
  reports: PieChart,
  staff: Users,
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
      className={`group relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-t-lg px-0.5 py-2 text-center transition-colors sm:gap-1.5 sm:py-3 ${
        active ? "text-fleet-navy" : "text-fleet-ink hover:bg-fleet-paper hover:text-fleet-navy"
      }`}
    >
      {/* Small on mobile (fits all 6-7 tabs on one line without wrapping/
          overlapping) but back to a comfortable, legible size from sm up,
          where each tab has plenty of room on a wide screen. */}
      <Icon size={14} className={`h-3.5 w-3.5 sm:h-5 sm:w-5 ${active ? "text-fleet-navy" : undefined}`} />
      {/* break-words: a long single word (e.g. "Maintenance") has no space
          to wrap at and would otherwise overflow its own flex-1 cell into
          the neighboring tab's label instead of wrapping onto a 2nd line. */}
      <span className="w-full break-words text-3xs font-semibold leading-[1.1] [hyphens:auto] sm:text-sm">{label}</span>
      {/* A short, centered pill instead of a full-width underline - reads as
          a single deliberate indicator rather than a heavy rule spanning the
          whole tab cell. */}
      <span
        className={`absolute bottom-0 h-0.5 w-5 rounded-full bg-fleet-navy transition-opacity ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
    </Link>
  );
}
