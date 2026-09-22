// Plain hand-drawn SVG donut, no recharts - recharts' <PieChart> renders
// nothing at all in server HTML (confirmed directly: the wrapper div comes
// back from the server completely empty, no <svg>, no paths - it only
// draws once client JS mounts and runs). That's a real problem here: this
// document can be printed the instant the page's initial HTML arrives,
// before React has even hydrated, whether via this app's own Print button
// (clicking it implies hydration already happened) or native Cmd+P, which
// nothing in this app can delay or intercept. A plain SVG path computed
// straight from props needs no JS at all to appear correctly, so it's
// present in the very first byte of HTML the server sends.
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function donutSegmentPath(cx: number, cy: number, innerR: number, outerR: number, startAngle: number, endAngle: number) {
  const startOuter = polarToCartesian(cx, cy, outerR, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerR, startAngle);
  const startInner = polarToCartesian(cx, cy, innerR, endAngle);
  const endInner = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    "M", startOuter.x, startOuter.y,
    "A", outerR, outerR, 0, largeArc, 0, endOuter.x, endOuter.y,
    "L", endInner.x, endInner.y,
    "A", innerR, innerR, 0, largeArc, 1, startInner.x, startInner.y,
    "Z",
  ].join(" ");
}

export function CategoryPieChartFixed({
  data,
  size = 256,
}: {
  data: { name: string; value: number; color?: string }[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  // Same fixed 50/80px radii (against the same 256px default box) the
  // recharts version drew, kept proportional for other sizes.
  const innerR = (50 / 256) * size;
  const outerR = (80 / 256) * size;
  const paddingDeg = 2;

  const { segments } = data.filter((d) => d.value > 0).reduce<{
    cumulativeAngle: number;
    segments: { name: string; value: number; color?: string; startAngle: number; endAngle: number }[];
  }>(
    (acc, d) => {
      // A single 100%-share category would otherwise degenerate into a
      // zero-length arc (start === end after the full 360deg sweep) -
      // capped just under a full circle so it still draws visibly.
      const sweep = total > 0 ? Math.min((d.value / total) * 360, 359.99) : 0;
      const startAngle = acc.cumulativeAngle;
      return {
        cumulativeAngle: acc.cumulativeAngle + sweep,
        segments: [...acc.segments, { ...d, startAngle, endAngle: startAngle + Math.max(sweep - paddingDeg, 0) }],
      };
    },
    { cumulativeAngle: 0, segments: [] }
  );

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg) => (
        <path key={seg.name} d={donutSegmentPath(cx, cy, innerR, outerR, seg.startAngle, seg.endAngle)} fill={seg.color} />
      ))}
    </svg>
  );
}
