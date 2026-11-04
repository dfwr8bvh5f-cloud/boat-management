"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { copyBudgetFromYear } from "@/lib/actions/budget";
import { Button } from "@/components/ui/button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// Starts an empty year's budget from the previous year's (all categories and
// their lines). Only rendered when the target year has no budget yet, so it
// never overwrites or duplicates anything.
export function BudgetCopyButton({ boatId, toYear, locale }: { boatId: string; toYear: number; locale: Locale }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="compact"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          setError(false);
          try {
            await copyBudgetFromYear(boatId, toYear);
          } catch (err) {
            console.error("Copy budget from previous year failed", err);
            setError(true);
            setLoading(false);
          }
        }}
      >
        <Copy size={14} />
        {translate(locale, "budget_copy_from_year", { year: toYear - 1 })}
      </Button>
      {error && (
        <span role="alert" className="text-2xs font-semibold text-fleet-coral-text">
          {translate(locale, "error_subcat_save_failed")}
        </span>
      )}
    </div>
  );
}
