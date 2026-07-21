"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const fieldClass =
  "rounded-lg border border-fleet-brass/40 bg-white/10 px-3 py-2.5 text-sm text-fleet-paper placeholder:text-fleet-paper/40 outline-none focus:border-fleet-brass";

export function ResetPasswordForm({
  labels,
  onDone,
}: {
  labels: { newPassword: string; submit: string; updating: string; success: string; loginNow: string };
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="rounded-lg border border-fleet-moss/50 bg-fleet-moss/10 px-3 py-2 text-sm text-fleet-paper">
          {labels.success}
        </p>
        <button
          onClick={() => (onDone ? onDone() : router.push("/"))}
          className="rounded-lg bg-fleet-brass px-4 py-2.5 text-sm font-bold text-fleet-navy hover:opacity-90"
        >
          {labels.loginNow}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const password = String(new FormData(event.currentTarget).get("password") ?? "");
        setError(null);
        setPending(true);
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({ password });
        setPending(false);
        if (error) {
          setError(error.message);
          return;
        }
        setDone(true);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs text-fleet-paper/70">
          {labels.newPassword}
        </label>
        <input id="password" name="password" type="password" required minLength={8} className={fieldClass} />
      </div>

      {error && (
        <p className="rounded-lg border border-fleet-coral/50 bg-fleet-coral/10 px-3 py-2 text-sm text-fleet-coral-text">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-fleet-brass px-4 py-2.5 text-sm font-bold text-fleet-navy transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? labels.updating : labels.submit}
      </button>
    </form>
  );
}
