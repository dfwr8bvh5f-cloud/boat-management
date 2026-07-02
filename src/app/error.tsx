"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-lg rounded-xl border border-fleet-coral/40 bg-white p-8 text-center">
        <h1 className="text-lg font-bold text-fleet-coral">משהו השתבש</h1>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-fleet-ink" dir="ltr">
          {error.message}
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-lg bg-fleet-teal px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          נסה שוב
        </button>
      </div>
    </div>
  );
}
