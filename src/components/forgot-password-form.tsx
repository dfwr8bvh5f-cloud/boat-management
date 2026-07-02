"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const fieldClass =
  "rounded-lg border border-fleet-brass/40 bg-white/10 px-3 py-2.5 text-sm text-fleet-paper placeholder:text-fleet-paper/40 outline-none focus:border-fleet-brass";

export function ForgotPasswordForm({
  labels,
}: {
  labels: { email: string; submit: string; sending: string; sent: string };
}) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
        if (!email) return;
        setPending(true);
        const supabase = createClient();
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
        });
        setPending(false);
        setSent(true);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs text-fleet-paper/70">
          {labels.email}
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={fieldClass} placeholder="you@example.com" />
      </div>

      {sent && (
        <p className="rounded-lg border border-fleet-moss/50 bg-fleet-moss/10 px-3 py-2 text-sm text-fleet-paper">
          {labels.sent}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-fleet-brass px-4 py-2.5 text-sm font-bold text-fleet-navy transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? labels.sending : labels.submit}
      </button>
    </form>
  );
}
