"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { login, type LoginState } from "@/app/login/actions";
import { RippleLoader } from "@/components/ripple-loader";

const initialState: LoginState = { error: null };

const fieldClass =
  "rounded-lg border border-fleet-brass/40 bg-white/10 px-3 py-2.5 text-sm text-fleet-paper placeholder:text-fleet-paper/40 outline-none focus:border-fleet-brass";

export function LoginForm({
  redirectTo,
  labels,
}: {
  redirectTo: string;
  labels: { email: string; password: string; submit: string; submitting: string; showPassword: string; hidePassword: string };
}) {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs text-fleet-paper/70">
          {labels.email}
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
          {labels.password}
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className={`${fieldClass} w-full pe-10`}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? labels.hidePassword : labels.showPassword}
            className="absolute inset-y-0 end-2 flex items-center text-fleet-paper/50 hover:text-fleet-paper"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg border border-fleet-coral/50 bg-fleet-coral/10 px-3 py-2 text-sm text-fleet-coral-text">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-fleet-brass px-4 py-2.5 text-sm font-bold text-fleet-navy transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending && <RippleLoader size="sm" />}
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
