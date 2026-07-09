import Link from "next/link";
import { Compass } from "lucide-react";
import { getTranslator } from "@/lib/i18n/locale";

export default async function NotFound() {
  const { t } = await getTranslator();

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-lg rounded-xl border border-fleet-border bg-white p-8 text-center">
        <Compass size={32} className="mx-auto mb-3 text-fleet-brass" />
        <h1 className="text-lg font-bold text-fleet-navy">{t("not_found_title")}</h1>
        <p className="mt-2 text-sm text-fleet-ink">{t("not_found_body")}</p>
        <Link
          href="/boats"
          className="mt-5 inline-block rounded-lg bg-fleet-teal px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          {t("not_found_cta")}
        </Link>
      </div>
    </div>
  );
}
