"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// A header navigation link that shows which section the current page
// belongs to: full-strength text plus a 2px underline and aria-current on
// the active one, a quieter tone on the others. `match` lists the path
// prefixes that count as "inside this section" (a section's sub-pages keep
// it lit).
export function HeaderNavLink({
  href,
  match,
  children,
  className = "",
  ...rest
}: {
  href: string;
  match: string[];
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
  title?: string;
}) {
  const pathname = usePathname();
  const active = match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} border-b-2 ${active ? "border-fleet-paper text-fleet-paper" : "border-transparent hover:text-fleet-paper"}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
