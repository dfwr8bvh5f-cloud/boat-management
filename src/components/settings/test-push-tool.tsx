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
export function TestPushTool({ users }: { users: { id: string; label: string }[] }) {
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PushSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    if (!userId) return;
    setResult(null);
    setError(null);
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
          {result.targetedDevices === 0
            ? "This user has no push subscription (device) on file - they've never enabled notifications."
            : `${result.delivered}/${result.targetedDevices} device(s) delivered, ${result.failed} failed, ${result.staleRemoved} stale removed.`}
        </p>
      )}
      {error && <p className="text-xs text-fleet-coral-text">{error}</p>}
    </div>
  );
}
