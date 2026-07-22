const SIZES = {
  sm: 16,
  md: 32,
  lg: 64,
} as const;

// The app's one shared loading indicator - a solid circle that continuously
// breathes (expands and shrinks) with a soft ring rippling outward from it,
// a half-cycle behind. Used inline in buttons (sm), inside cards/panels
// (md), and for full-page/route loading (lg via LoadingSpinner).
// currentColor by default so it always matches the surrounding text color
// (white inside a filled navy button, navy/ink on a white card).
export function RippleLoader({
  size = "md",
  className,
  label,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  label?: string;
}) {
  const px = SIZES[size];
  return (
    <span
      role="status"
      aria-label={label ?? "Loading"}
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
      style={{ width: px, height: px }}
    >
      <span className="animate-ripple-wave absolute inset-0 rounded-full border-2 border-current" />
      <span className="animate-ripple-wave absolute inset-0 rounded-full border-2 border-current [animation-delay:-0.8s]" />
      <span className="animate-ripple-core relative rounded-full bg-current" style={{ width: px * 0.4, height: px * 0.4 }} />
    </span>
  );
}
