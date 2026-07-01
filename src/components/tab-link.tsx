"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TabLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-teal-700 text-teal-800"
          : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {label}
    </Link>
  );
}
