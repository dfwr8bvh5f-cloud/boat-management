const SIZES = {
  sm: 16,
  md: 32,
  lg: 56,
} as const;

// The app's one shared loading indicator - two rings expanding outward and
// fading, staggered a half-cycle apart. Used inline in buttons (sm), inside
// cards/panels (md), and for full-page/route loading (lg via LoadingSpinner).
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
      className={`relative inline-block shrink-0 ${className ?? ""}`}
      style={{ width: px, height: px }}
    >
      <span className="animate-ripple absolute inset-0 rounded-full border-2 border-current" />
      <span className="animate-ripple absolute inset-0 rounded-full border-2 border-current [animation-delay:-0.6s]" />
    </span>
  );
}
