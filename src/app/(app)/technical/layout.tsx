import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { TabLink } from "@/components/tab-link";
import { getTranslator } from "@/lib/i18n/locale";

// Fleet-wide technical module (management only) - every boat's issues in
// one place, plus the technician visit calendar. Same persistent-tabs
// pattern as /mys/layout.tsx.
export default async function TechnicalLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { t } = await getTranslator();

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex w-full border-b border-fleet-border print:hidden">
        <TabLink href="/technical/issues" label={t("tech_issues")} icon="technicalIssues" />
        <TabLink href="/technical/calendar" label={t("tech_calendar")} icon="technicalCalendar" />
      </nav>
      {children}
    </div>
  );
}
