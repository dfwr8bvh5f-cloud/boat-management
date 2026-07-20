import Link from "next/link";
import { ChevronLeft, type LucideIcon } from "lucide-react";

// One shared visual shell for every Settings row - a link (navigates to a
// sub-page), a button (triggers an action in place, e.g. the install
// prompt), a form (a server action, e.g. logout), or a plain disabled row
// (the "App Installed" state). Callers only ever hand this icon/label/one
// of href|onClick|formAction|disabled - the chevron/trailing content is
// derived, so every row stays visually identical without re-typing the
// row shell each time.
export function SettingsRow({
  icon: Icon,
  label,
  href,
  onClick,
  formAction,
  disabled,
  trailing,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  formAction?: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  const content = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
        <Icon size={18} className="text-fleet-brass" />
      </div>
      <div className="flex-1 text-sm font-semibold text-fleet-navy">{label}</div>
      {trailing !== undefined
        ? trailing
        : !disabled &&
          (href || onClick || formAction) && <ChevronLeft size={16} className="shrink-0 text-fleet-ink" />}
    </>
  );

  const className = `flex w-full items-center gap-3 rounded-xl border border-fleet-border bg-white p-3 text-start transition-shadow ${
    disabled ? "opacity-60" : "hover:shadow-sm"
  }`;

  if (disabled) {
    return <div className={className}>{content}</div>;
  }
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  if (formAction) {
    return (
      <form action={formAction}>
        <button type="submit" className={className}>
          {content}
        </button>
      </form>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }
  // No href/onClick/formAction (e.g. NotificationsRow, which supplies its
  // own interactive toggle as `trailing`) - render a plain, non-interactive
  // row. A <button> here would make that trailing control invalid nested
  // interactive HTML.
  return <div className={className}>{content}</div>;
}
