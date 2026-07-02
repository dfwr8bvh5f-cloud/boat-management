"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export function TabLink({
  href,
  label,
  icon: Icon,
  exact = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={`flex shrink-0 flex-col items-center gap-1 rounded-t-lg border-b-2 px-3 py-2 text-center transition-colors ${
        active
          ? "border-fleet-navy text-fleet-navy"
          : "border-transparent text-fleet-ink hover:bg-fleet-paper hover:text-fleet-navy"
      }`}
    >
      <Icon size={18} />
      <span className="whitespace-nowrap text-[11px] font-medium">{label}</span>
    </Link>
  );
}
