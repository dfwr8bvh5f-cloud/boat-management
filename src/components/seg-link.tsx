"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SegLink({ href, label, fill }: { href: string; label: string; fill?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors ${
        fill ? "min-w-0 flex-1 truncate px-1 text-xs sm:text-sm" : "shrink-0 whitespace-nowrap"
      } ${active ? "bg-fleet-navy text-fleet-paper" : "text-fleet-ink hover:bg-white/60"}`}
    >
      {label}
    </Link>
  );
}
