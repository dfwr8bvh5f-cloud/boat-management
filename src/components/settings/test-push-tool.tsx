"use client";

import { useState, useTransition } from "react";
import { FlaskConical } from "lucide-react";
import { sendTestPush } from "@/lib/actions/push";
import { CustomSelect } from "@/components/custom-select";
import { RippleLoader } from "@/components/ripple-loader";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS } from "@/lib/ui-classes";
import type { PushSendResult } from "@/lib/push";

// Developer tool: send one real push notification to a chosen user right
// now, so the whole pipeline (VAPID config, that user's stored
// subscription(s), actual delivery) can be confirmed on demand instead of
// waiting for a cron or a real charter/document-expiry event to trigger it.
export function TestPushTool({ users, currentUserId }: { users: { id: string; label: string }[]; currentUserId: string }) {
  // Defaults to whoever is actually using this tool right now, not an
  // arbitrary pick - the dropdown's own list is ordered alphabetically by
  // name (see settings/page.tsx), so defaulting to its first entry meant
  // this almost always opened on a random unrelated person instead of the
  // management user standing here to test their own device. That's a real
  // way to draw the wrong conclusion: the result then describes someone
  // else's subscription, not the one actually being diagnosed. Falls back
  // to the first entry only if the current user isn't in the list for some
  // reason (shouldn't happen - this tool only renders for management).
  const [userId, setUserId] = useState(users.some((u) => u.id === currentUserId) ? currentUserId : (users[0]?.id ?? ""));
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PushSendResult | null>(null);
  // Captured at send time, not read from userId when rendering the result -
  // the dropdown can be changed while a result from a previous, different
  // user is still on screen, which would otherwise silently relabel that
  // older result as if it were about whoever is currently selected.
  const [testedLabel, setTestedLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    if (!userId) return;
    setResult(null);
    setError(null);
    setTestedLabel(users.find((u) => u.id === userId)?.label ?? "");
    startTransition(async () => {
      try {
        const r = await sendTestPush(userId);
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-fleet-brass bg-fleet-paper p-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-fleet-ink">
        <FlaskConical size={14} /> Test push (dev tool)
      </div>
      <CustomSelect
        value={userId}
        onChange={setUserId}
        options={users.map((u) => ({ value: u.id, label: u.label }))}
        className={INPUT_CLASS}
      />
      <button type="button" onClick={send} disabled={pending || !userId} className={`flex items-center justify-center gap-2 ${PRIMARY_BUTTON_CLASS}`}>
        {pending && <RippleLoader size="sm" />}
        Send test push
      </button>
      {result && (
        <p className={`text-xs ${result.delivered > 0 ? "text-fleet-moss-text" : "text-fleet-coral-text"}`}>
          {testedLabel}:{" "}
          {result.targetedDevices === 0
            ? "no push subscription (device) on file - never enabled notifications."
            : `${result.delivered}/${result.targetedDevices} device(s) delivered, ${result.failed} failed, ${result.staleRemoved} stale removed.`}
        </p>
      )}
      {error && <p className="text-xs text-fleet-coral-text">{error}</p>}
    </div>
  );
}
