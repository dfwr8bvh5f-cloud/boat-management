import { RippleLoader } from "@/components/ripple-loader";

export function LoadingSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-fleet-navy">
      <RippleLoader size="lg" />
    </div>
  );
}
