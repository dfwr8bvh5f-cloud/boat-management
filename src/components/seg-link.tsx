"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SegLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

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
