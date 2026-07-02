"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TabLink({ href, label, exact = false }: { href: string; label: string; exact?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-fleet-navy text-fleet-navy"
          : "border-transparent text-fleet-ink hover:bg-fleet-paper hover:text-fleet-navy"
      }`}
    >
      {label}
    </Link>
  );
}
