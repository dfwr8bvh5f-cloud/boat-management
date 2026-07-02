"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/login/actions";

const initialState: LoginState = { error: null };

const fieldClass =
  "rounded-lg border border-fleet-brass/40 bg-white/10 px-3 py-2.5 text-sm text-fleet-paper placeholder:text-fleet-paper/40 outline-none focus:border-fleet-brass";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs text-fleet-paper/70">
          אימייל
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={fieldClass}
          placeholder="you@example.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs text-fleet-paper/70">
          סיסמה
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={fieldClass}
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <p className="rounded-lg border border-fleet-coral/50 bg-fleet-coral/10 px-3 py-2 text-sm text-fleet-coral">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-fleet-brass px-4 py-2.5 text-sm font-bold text-fleet-navy transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "מתחבר..." : "התחברות"}
      </button>
    </form>
  );
}
