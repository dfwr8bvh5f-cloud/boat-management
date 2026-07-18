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
        <ChevronLeft size={18} />
      </Link>
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{title}</h1>
    </div>
  );
}
