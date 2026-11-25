import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// The one "back" link used everywhere in the app: an arrow icon plus a text
// label, teal. The arrow is a real icon (not a "←" character) so it mirrors
// under RTL (Hebrew) and always points toward "back". Pass `className` only to
// recolor it for a dark background (e.g. the login screens).
export function BackLink({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex w-fit items-center gap-1.5 text-sm font-medium text-fleet-teal hover:underline ${className}`}
    >
      <ArrowLeft size={16} className="shrink-0 rtl:rotate-180" aria-hidden="true" />
      {label}
    </Link>
  );
}
