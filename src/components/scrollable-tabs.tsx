"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SegLink } from "@/components/seg-link";

// The finance sub-tab row (expenses/bank/cash/invoices/future/report/budget/
// reconciliation) doesn't fit on a phone screen - it was a bare
// overflow-x-auto strip with no visible way to reach the tabs scrolled off
// to the side beyond a swipe gesture, which read as "there's a little arrow
// here that does nothing" rather than "swipe to see more tabs". These
// buttons make that scrolling an actual, tappable control.
export function ScrollableTabs({ tabs, dir }: { tabs: { href: string; label: string }[]; dir: "rtl" | "ltr" }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToStart = () => scrollRef.current?.scrollBy({ left: dir === "rtl" ? 120 : -120, behavior: "smooth" });
  const scrollToEnd = () => scrollRef.current?.scrollBy({ left: dir === "rtl" ? -120 : 120, behavior: "smooth" });

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={scrollToStart}
        aria-label="scroll"
        className="shrink-0 rounded-lg p-1.5 text-fleet-ink hover:bg-fleet-tabs"
      >
        <ChevronLeft size={16} />
      </button>
      <div ref={scrollRef} className="flex flex-1 justify-center gap-1 overflow-x-auto rounded-xl bg-fleet-tabs p-1 scroll-smooth">
        {tabs.map((tab) => (
          <SegLink key={tab.href} href={tab.href} label={tab.label} />
        ))}
      </div>
      <button
        type="button"
        onClick={scrollToEnd}
        aria-label="scroll"
        className="shrink-0 rounded-lg p-1.5 text-fleet-ink hover:bg-fleet-tabs"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
