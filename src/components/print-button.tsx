"use client";

import { Printer } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/dictionaries";

export function PrintButton({ locale }: { locale: Locale }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer size={16} /> {translate(locale, "export_print")}
    </Button>
  );
}
