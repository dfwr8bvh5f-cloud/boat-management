// Seasonal header decoration (see src/lib/seasonal.ts for when it shows):
// the snowfall layer for the top bar, and the Santa hat for the logo. Purely
// decorative - hidden from assistive tech, never captures clicks, and the
// animation is switched off for people who asked for reduced motion
// (globals.css).

// Fixed positions/timings (no randomness) so the server render is stable.
const FLAKES = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  size: 2 + ((i * 5) % 4),
  duration: 7 + ((i * 3) % 6),
  delay: -((i * 7) % 11),
}));

export function ChristmasSnow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {FLAKES.map((f, i) => (
        <span
          key={i}
          className="xmas-flake"
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export function SantaHat() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 34 26"
      className="pointer-events-none absolute -top-2.5 -start-1.5 h-[18px] w-6 -rotate-[18deg]"
    >
      <path d="M3 22 C6 8 16 2 28 6 C22 8 20 14 21 22 Z" fill="#b3242f" />
      <rect x="1" y="20" width="26" height="6" rx="3" fill="#fff" />
      <circle cx="29" cy="6" r="3.6" fill="#fff" />
    </svg>
  );
}
