import { formatDateDisplay } from "@/lib/date-format";

const ROLE_LABEL: Record<string, string> = {
  management: "Management",
  captain: "Captain",
  owner: "Owner",
};

export type PushSubscriberRow = {
  id: string;
  label: string;
  role: string;
  boatName: string | null;
  deviceCount: number;
  lastRegistered: string | null;
};

// Management-only diagnostic view (Settings) - a fleet-wide answer to "who
// actually has push enabled right now", one row per person, instead of
// checking one user at a time through the Test Push tool above. Read-only:
// this only reflects what's already in push_subscriptions (see
// settings/page.tsx for the query), it doesn't send anything.
export function PushSubscribersList({ rows }: { rows: PushSubscriberRow[] }) {
  const zeroCount = rows.filter((r) => r.deviceCount === 0).length;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-fleet-brass bg-fleet-paper p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-fleet-ink">Who has push enabled</div>
        <div className="text-2xs text-fleet-ink">
          {rows.length - zeroCount}/{rows.length} enabled
        </div>
      </div>
      <div className="flex flex-col gap-1.5 overflow-hidden rounded-lg border border-fleet-border bg-white">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 border-b border-fleet-border/60 px-3 py-2 text-xs last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-fleet-navy">{r.label}</div>
              <div className="text-2xs text-fleet-ink">
                {ROLE_LABEL[r.role] ?? r.role}
                {r.boatName ? ` · ${r.boatName}` : ""}
                {r.lastRegistered ? ` · since ${formatDateDisplay(r.lastRegistered)}` : ""}
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold ${
                r.deviceCount > 0 ? "bg-fleet-moss/20 text-fleet-moss-text" : "bg-fleet-coral/20 text-fleet-coral-text"
              }`}
            >
              {r.deviceCount} {r.deviceCount === 1 ? "device" : "devices"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
