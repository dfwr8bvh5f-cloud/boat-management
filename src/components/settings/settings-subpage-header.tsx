import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function SettingsSubpageHeader({ title, backLabel }: { title: string; backLabel: string }) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/settings"
        aria-label={backLabel}
        title={backLabel}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fleet-brass hover:bg-fleet-paper"
      >
        {/* A "back" chevron - correct pointing left by default (LTR
            convention), flipped for RTL (Hebrew) where back reads the
            other way. */}
        <ChevronLeft size={16} className="rtl:rotate-180" />
      </Link>
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{title}</h1>
    </div>
  );
}
