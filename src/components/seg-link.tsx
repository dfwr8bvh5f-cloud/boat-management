"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SegLink({ href, label, fill }: { href: string; label: string; fill?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`snap-start rounded-lg px-1 py-2 text-center font-semibold transition-colors ${
        fill
          ? "min-w-0 flex-1 text-3xs leading-tight sm:text-sm sm:leading-normal"
          : "shrink-0 px-3 text-sm whitespace-nowrap"
      } ${active ? "bg-fleet-navy text-fleet-paper" : "text-fleet-ink hover:bg-white/60"}`}
    >
      {label}
    </Link>
  );
}
