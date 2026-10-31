"use client";

import { useState, useTransition } from "react";
import { FlaskConical } from "lucide-react";
import { sendTestPush, sendTestTechnicianVisitPush } from "@/lib/actions/push";
import { CustomSelect } from "@/components/custom-select";
import { RippleLoader } from "@/components/ripple-loader";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { INPUT_CLASS } from "@/lib/ui-classes";
import type { PushSendResult } from "@/lib/push";

type PreviewKind = "generic" | "tech_visit_week" | "tech_visit_day";
const PREVIEW_OPTIONS: { value: PreviewKind; label: string }[] = [
  { value: "generic", label: "Generic test push" },
  { value: "tech_visit_week", label: "Preview: technician visit, week-before" },
  { value: "tech_visit_day", label: "Preview: technician visit, day-before" },
];

type UserResult = { label: string; result?: PushSendResult; error?: string };

// Developer tool: send one real push notification to one or more chosen
// users right now, so the whole pipeline (VAPID config, a user's stored
// subscription(s), actual delivery) can be confirmed on demand instead of
// waiting for a cron or a real charter/document-expiry event to trigger it.
export function TestPushTool({ users, currentUserId }: { users: { id: string; label: string }[]; currentUserId: string }) {
  // Defaults to whoever is actually using this tool right now, not an
  // arbitrary pick - the list is ordered alphabetically by name (see
  // settings/page.tsx), so defaulting to its first entry meant this almost
  // always opened on a random unrelated person instead of the management
  // user standing here to test their own device. Falls back to the first
  // entry only if the current user isn't in the list for some reason
  // (shouldn't happen - this tool only renders for management).
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(users.some((u) => u.id === currentUserId) ? [currentUserId] : users[0] ? [users[0].id] : [])
  );
  const [previewKind, setPreviewKind] = useState<PreviewKind>("generic");
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<UserResult[]>([]);

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const send = () => {
    if (selectedUserIds.size === 0) return;
    setResults([]);
    const targets = users.filter((u) => selectedUserIds.has(u.id));
    startTransition(async () => {
      // Sequential, not Promise.all - this is a one-off dev tool, not a
      // real bulk-send path, and sequential keeps the per-user results
      // settling in the same order the user picked them rather than
      // racing in whatever order each push service happens to respond.
      const collected: UserResult[] = [];
      for (const u of targets) {
        try {
          const result =
            previewKind === "generic"
              ? await sendTestPush(u.id)
              : await sendTestTechnicianVisitPush(u.id, previewKind === "tech_visit_week" ? "week" : "day");
          collected.push({ label: u.label, result });
        } catch (e) {
          collected.push({ label: u.label, error: e instanceof Error ? e.message : "failed" });
        }
        setResults([...collected]);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-fleet-brass bg-fleet-paper p-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-fleet-ink">
        <FlaskConical size={14} /> Test push (dev tool)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {users.map((u) => (
          <Chip key={u.id} active={selectedUserIds.has(u.id)} onClick={() => toggleUser(u.id)}>
            {u.label}
          </Chip>
        ))}
      </div>
      <CustomSelect ordered
        value={previewKind}
        onChange={(v) => setPreviewKind(v as PreviewKind)}
        options={PREVIEW_OPTIONS}
        className={INPUT_CLASS}
      />
      <Button type="button" onClick={send} disabled={pending || selectedUserIds.size === 0}>
        {pending && <RippleLoader size="sm" />}
        Send test push{selectedUserIds.size > 1 ? ` (${selectedUserIds.size} users)` : ""}
      </Button>
      {results.length > 0 && (
        <div className="flex flex-col gap-1">
          {results.map((r, i) => (
            <p key={i} className={`text-xs ${r.result && r.result.delivered > 0 ? "text-fleet-moss-text" : "text-fleet-coral-text"}`}>
              {r.label}:{" "}
              {r.error
                ? r.error
                : r.result!.targetedDevices === 0
                  ? "no push subscription (device) on file - never enabled notifications."
                  : `${r.result!.delivered}/${r.result!.targetedDevices} device(s) delivered, ${r.result!.failed} failed, ${r.result!.staleRemoved} stale removed.`}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
