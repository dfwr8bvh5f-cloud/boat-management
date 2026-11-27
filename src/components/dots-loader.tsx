const SIZES = {
  sm: 16,
  md: 32,
  lg: 64,
} as const;

// The app's one shared loading indicator for actions in progress - three
// dots that hop one after another (the "dots" pairing chosen together with
// the static page skeleton, see PageSkeleton). Used inline in buttons (sm)
// and inside cards/panels (md/lg) whose own data is still loading. Route-level
// page loads show PageSkeleton with the same dots centered over it.
// currentColor by default so it always matches the surrounding text color
// (white inside a filled navy button, navy/ink on a white card).
export function DotsLoader({
  size = "md",
  className,
  label,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  label?: string;
}) {
  const px = SIZES[size];
  const dot = Math.round(px * 0.3);
  return (
    <span
      role="status"
      aria-label={label ?? "Loading"}
      className={`inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
      style={{ height: px, gap: Math.max(2, Math.round(px * 0.1)), ["--dot" as string]: `${dot}px` }}
    >
      {/* The stagger is an inline style on purpose: .animate-dot (globals.css,
          outside Tailwind's layers) sets the `animation` shorthand, which
          resets animation-delay and beat the old [animation-delay:...] utility
          classes - so all three dots hopped together instead of in turn. */}
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="animate-dot rounded-full bg-current" style={{ width: dot, height: dot, animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}
