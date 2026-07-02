"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/locale";
import type { FinancialSnapshot, TechnicalSnapshot } from "@/lib/types/database";

async function assertManagement() {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_reports"));
  }
  return profile;
}

export async function issueFinancialReport(boatId: string, from: string, to: string) {
  const profile = await assertManagement();
  const supabase = await createClient();

  const [{ data: expenses }, { data: incomes }, { data: cashTx }] = await Promise.all([
    supabase
      .from("expenses")
      .select("category, amount, payment_method")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .gte("expense_date", from)
      .lte("expense_date", to),
    supabase
      .from("incomes")
      .select("amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .eq("type", "actual")
      .gte("income_date", from)
      .lte("income_date", to),
    supabase
      .from("cash_transactions")
      .select("type, amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .in("type", ["withdrawal", "received"])
      .gte("tx_date", from)
      .lte("tx_date", to),
  ]);

  const totalExpenses = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const totalIncome = (incomes ?? []).reduce((s, i) => s + i.amount, 0);
  const cashWithdrawals = (cashTx ?? []).reduce((s, c) => s + c.amount, 0);
  const cashUsage = (expenses ?? [])
    .filter((e) => e.payment_method === "cash")
    .reduce((s, e) => s + e.amount, 0);

  const byCategoryMap = new Map<string, number>();
  for (const e of expenses ?? []) {
    byCategoryMap.set(e.category, (byCategoryMap.get(e.category) ?? 0) + e.amount);
  }

  const snapshot: FinancialSnapshot = {
    totalExpenses,
    totalIncome,
    net: totalIncome - totalExpenses,
    cashWithdrawals,
    cashUsage,
    byCategory: [...byCategoryMap.entries()]
      .map(([category, sum]) => ({ category: category as FinancialSnapshot["byCategory"][number]["category"], sum }))
      .sort((a, b) => b.sum - a.sum),
  };

  const { error } = await supabase
    .from("reports")
    .insert({ boat_id: boatId, type: "financial", period_start: from, period_end: to, snapshot, issued_by: profile.id });
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/reports`);
}

export async function issueTechnicalReport(boatId: string, from: string, to: string) {
  const profile = await assertManagement();
  const supabase = await createClient();

  const [{ data: periodIssues }, { data: openIssues }, { data: documents }] = await Promise.all([
    supabase
      .from("issues")
      .select("title, op_status")
      .eq("boat_id", boatId)
      .gte("created_at", from)
      .lte("created_at", `${to}T23:59:59`),
    supabase.from("issues").select("id").eq("boat_id", boatId).not("op_status", "in", "(completed,cancelled)"),
    supabase.from("documents").select("name, doc_type, expiry_date").eq("boat_id", boatId).not("expiry_date", "is", null),
  ]);

  const today = new Date();
  const docAlerts = (documents ?? [])
    .filter((d) => {
      if (!d.expiry_date) return false;
      const days = (new Date(d.expiry_date).getTime() - today.getTime()) / 86_400_000;
      return days <= 30;
    })
    .map((d) => ({ name: d.name, docType: d.doc_type, expiryDate: d.expiry_date as string }));

  const snapshot: TechnicalSnapshot = {
    newIssues: periodIssues?.length ?? 0,
    resolvedThisMonth: (periodIssues ?? []).filter((i) => i.op_status === "completed").length,
    stillOpen: openIssues?.length ?? 0,
    issueList: (periodIssues ?? []).map((i) => ({ title: i.title, status: i.op_status })),
    docAlerts,
  };

  const { error } = await supabase
    .from("reports")
    .insert({ boat_id: boatId, type: "technical", period_start: from, period_end: to, snapshot, issued_by: profile.id });
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/reports`);
}

export async function deleteReport(boatId: string, reportId: string) {
  await assertManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/reports`);
}
