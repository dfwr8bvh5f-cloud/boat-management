import { BackLink } from "@/components/back-link";

export function SettingsSubpageHeader({ title, backLabel }: { title: string; backLabel: string }) {
  return (
    <div className="flex flex-col gap-2">
      <BackLink href="/settings" label={backLabel} />
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{title}</h1>
    </div>
  );
}
