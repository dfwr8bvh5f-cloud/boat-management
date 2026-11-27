// Seasonal header decoration (see src/lib/seasonal.ts for when it shows):
// the snowfall layer for the top bar, and the Santa hat for the logo. Purely
// decorative - hidden from assistive tech, never captures clicks, and the
// animation is switched off for people who asked for reduced motion
// (globals.css).

// Fixed positions/timings (no randomness) so the server render is stable.
const FLAKES = Array.from({ length: 34 }, (_, i) => ({
  left: (i * 29 + 7) % 100,
  size: 3 + ((i * 5) % 4),
  duration: 4 + ((i * 3) % 5),
  delay: -((i * 7) % 9),
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

// Worn on the logo circle: centred on its top edge, tilted a little, with the
// white brim overlapping the circle's rim (the parent is the logo's relative box).
export function SantaHat() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 34 26"
      className="pointer-events-none absolute -top-4 start-1/2 h-[22px] w-[29px] -translate-x-1/2 -rotate-[10deg] rtl:translate-x-1/2 rtl:rotate-[10deg]"
    >
      <path d="M3 22 C6 8 16 2 28 6 C22 8 20 14 21 22 Z" fill="#b3242f" />
      <rect x="1" y="20" width="26" height="6" rx="3" fill="#fff" />
      <circle cx="29" cy="6" r="3.6" fill="#fff" />
    </svg>
  );
}
