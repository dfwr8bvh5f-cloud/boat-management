"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SegLink({ href, label, block }: { href: string; label: string; block?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
        block ? "w-full text-start" : "shrink-0 text-center"
      } ${active ? "bg-fleet-navy text-fleet-paper" : "text-fleet-ink hover:bg-white/60"}`}
    >
      {label}
    </Link>
  );
}
