import { DotsLoader } from "@/components/dots-loader";

// Generic route-level loading placeholder (used from every top-level
// loading.tsx) - a page title bar plus a few card-shaped blocks, static, with
// the shared hopping dots centered over them (the same dots the buttons show
// while saving). Not shaped to any one page's exact layout (there are ~13
// different routes using this) - the point is just to read as "real content
// is arriving, shaped roughly like a page" instead of a blank canvas.
export function PageSkeleton() {
  return (
    <div className="relative flex flex-col gap-3" aria-hidden="true">
      <div className="skeleton-block h-7 w-40 rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton-block h-[76px] rounded-xl" />
        <div className="skeleton-block h-[76px] rounded-xl" />
      </div>
      <div className="skeleton-block h-24 rounded-xl" />
      <div className="skeleton-block h-24 rounded-xl" />
      <div className="skeleton-block h-24 rounded-xl" />
      <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center text-fleet-brass">
        <DotsLoader size="md" />
      </div>
    </div>
  );
}
