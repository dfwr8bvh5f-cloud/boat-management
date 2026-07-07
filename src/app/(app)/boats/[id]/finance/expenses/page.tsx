import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { ExpensesManager } from "@/components/expenses-manager";
import { getLocale } from "@/lib/i18n/locale";

export default async function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("boat_id", boat.id)
    .order("expense_date", { ascending: false });

  // Batched into one request for every receipt/photo instead of one
  // signed-URL call per expense - with hundreds of expenses that N+1
  // pattern was by far the slowest part of loading this page.
  const receiptPaths = [
    ...new Set((expenses ?? []).flatMap((e) => [e.receipt_path, e.photo_path].filter((p): p is string => Boolean(p)))),
  ];
  const signedUrlByPath = new Map<string, string>();
  if (receiptPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage.from("receipts").createSignedUrls(receiptPaths, 3600);
    for (const s of signedUrls ?? []) {
      if (s.signedUrl) signedUrlByPath.set(s.path ?? "", s.signedUrl);
    }
  }
  // Expenses linked to a bank statement line (via reconciliation) sort by
  // the statement's own order within the same date, instead of insertion
  // order - cash expenses (never linked) just keep sorting by their date.
  const statementLineIds = [
    ...new Set((expenses ?? []).flatMap((e) => (e.bank_statement_line_id ? [e.bank_statement_line_id] : []))),
  ];
  const statementOrderById = new Map<string, number>();
  if (statementLineIds.length > 0) {
    const { data: lines } = await supabase
      .from("bank_statement_lines")
      .select("id, statement_order")
      .in("id", statementLineIds);
    for (const l of lines ?? []) statementOrderById.set(l.id, l.statement_order);
  }

  const withUrls = (expenses ?? [])
    .map((e) => ({
      ...e,
      receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
      photoUrl: (e.photo_path && signedUrlByPath.get(e.photo_path)) ?? null,
      statementOrder: e.bank_statement_line_id ? (statementOrderById.get(e.bank_statement_line_id) ?? null) : null,
    }))
    .sort((a, b) => {
      // Same date: expenses linked to the statement follow its exact row
      // order for that date, swapping places with each other if that's what
      // the statement shows - this mirrors exactly how the statement's own
      // lines are displayed elsewhere (date desc, then statement row order).
      const byDate = (b.expense_date ?? "").localeCompare(a.expense_date ?? "");
      if (byDate !== 0) return byDate;
      if (a.statementOrder != null && b.statementOrder != null) return a.statementOrder - b.statementOrder;
      // A cash expense (or anything not linked to a statement line) has no
      // statement position - it keeps the order it was entered in.
      return a.created_at.localeCompare(b.created_at);
    });

  return (
    <ExpensesManager
      boatId={boat.id}
      boatType={boat.boat_type}
      boatName={boat.name}
      expenses={withUrls}
      canAdd={canEdit}
      isManagement={profile.role === "management"}
      locale={locale}
    />
  );
}
