// Generic route-level loading placeholder (used from every top-level
// loading.tsx) - a page title bar plus a few card-shaped blocks, all with
// the shimmer sweep from globals.css. Not shaped to any one page's exact
// layout (there are ~13 different routes using this) - the point is just
// to read as "real content is arriving, shaped roughly like a page" instead
// of a blank canvas with a spinner floating in the middle of it.
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="animate-shimmer h-7 w-40 rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        <div className="animate-shimmer h-[76px] rounded-xl" />
        <div className="animate-shimmer h-[76px] rounded-xl" />
      </div>
      <div className="animate-shimmer h-24 rounded-xl" />
      <div className="animate-shimmer h-24 rounded-xl" />
      <div className="animate-shimmer h-24 rounded-xl" />
    </div>
  );
}
