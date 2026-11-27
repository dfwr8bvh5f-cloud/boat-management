// Seasonal header decoration (see src/lib/seasonal.ts for when it shows):
// a gentle snowfall of six-armed snowflakes over the top bar, and a Santa hat
// worn on the logo. Purely decorative - hidden from assistive tech, never
// captures clicks, clipped to the bar, and the falling is switched off for
// people who asked for reduced motion (globals.css).

const CREAM = "#f6ecd6";

// Fixed sizes/positions/timings (no randomness) so the server render is
// stable. `left` is a percentage of the snow zone, which only covers the part
// of the bar that is free of the logo/title (see .xmas-snow-zone in
// globals.css); flakes from index 9 up are hidden on phones to keep it light.
const FLAKES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37 + 9) % 100,
  size: 8 + ((i * 5) % 7),
  duration: 9 + ((i * 7) % 9),
  delay: -((i * 5) % 13),
  restTop: 12 + ((i * 23) % 70),
}));

export function ChristmasSnow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ color: CREAM }}>
      {/* One flake shape, reused by every <use>: three crossing lines with a
          small V feather near each tip - thin, even strokes. */}
      <svg width="0" height="0" className="absolute">
        <symbol id="xmas-flake-shape" viewBox="-10 -10 20 20">
          <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
            <g id="xmas-flake-arm">
              <path d="M0 -9V9" />
              <path d="M-2.4 -7.2L0 -4.8L2.4 -7.2" />
              <path d="M-2.4 7.2L0 4.8L2.4 7.2" />
            </g>
            <use href="#xmas-flake-arm" transform="rotate(60)" />
            <use href="#xmas-flake-arm" transform="rotate(120)" />
          </g>
        </symbol>
      </svg>
      <div className="xmas-snow-zone absolute inset-y-0">
        {FLAKES.map((f, i) => (
          <svg
            key={i}
            width={f.size}
            height={f.size}
            className={`xmas-flake ${i >= 9 ? "max-sm:hidden" : ""}`}
            style={
              {
                left: `${f.left}%`,
                animationDuration: `${f.duration}s`,
                animationDelay: `${f.delay}s`,
                "--rest-top": `${f.restTop}%`,
              } as React.CSSProperties
            }
          >
            <use href="#xmas-flake-shape" />
          </svg>
        ))}
      </div>
    </div>
  );
}

// Worn on the logo: drawn in the logo's own coordinate space (the overlay
// covers the logo box exactly, so it scales with the logo on every screen).
// The logo circle has radius ~45 around (50,50); the cream brim is an arc
// laid on that circle's upper rim, overlapping it slightly, and the deep-red
// cap sits on that same arc (its lower edge follows the rim, so nothing hangs
// inside the circle) with a cream pompom at the tip. Tilted a little.
export function SantaHat() {
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <g transform="rotate(-9 50 50)">
        <path d="M14.3 21.6 C14 0 36 -16 62 -14 C76 -13 85 5 85.7 21.6 A45.5 45.5 0 0 0 14.3 21.6 Z" fill="#a31d2d" />
        <path d="M14.3 21.6 C14 0 36 -16 62 -14 C54 -8 48 2 46 4.7 A45.5 45.5 0 0 0 14.3 21.6 Z" fill="#8c1727" opacity="0.6" />
        <path d="M14.3 21.6 A45.5 45.5 0 0 1 85.7 21.6" fill="none" stroke={CREAM} strokeWidth="9" strokeLinecap="round" />
        <circle cx="65" cy="-13" r="7" fill={CREAM} />
      </g>
    </svg>
  );
}
