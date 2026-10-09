"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// matchPrefix keeps a tab lit on its own sub-pages too (e.g. Financial Reports
// stays active on /finance/report/owner-trip).
export function SegLink({ href, label, matchPrefix = false }: { href: string; label: string; matchPrefix?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || (matchPrefix && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={`snap-start shrink-0 rounded-lg px-3 py-2 text-center text-sm font-semibold whitespace-nowrap transition-colors ${
        active ? "bg-fleet-navy text-fleet-paper" : "text-fleet-ink hover:bg-white/60"
      }`}
    >
      {label}
    </Link>
  );
}
