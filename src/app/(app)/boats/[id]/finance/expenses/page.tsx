import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCachedSignedUrls, getCachedThumbUrls } from "@/lib/storage-cache";
import { isPdfUrl } from "@/lib/upload";
import { ExpensesManager } from "@/components/expenses-manager";
import { getLocale } from "@/lib/i18n/locale";
import type { Expense } from "@/lib/types/database";

export default async function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  // Paginated: a boat with a couple of years of history can genuinely pass
  // 1000 expense rows, and an unbounded select() silently caps there -
  // dropping the oldest expenses off the bottom of this list without error.
  // The secondary created_at order here doesn't control what the user sees
  // (the .sort() below, closer to display, is what actually decides
  // same-date order) - it exists so range()-based pagination itself is
  // deterministic across pages.
  const expenses = await fetchAllRows<Expense>((from, to) =>
    supabase
      .from("expenses")
      .select("*")
      .eq("boat_id", boat.id)
      .is("archived_at", null)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to)
  );

  const expenseIds = (expenses ?? []).map((e) => e.id);
  const { data: attachments } = expenseIds.length
    ? await supabase.from("expense_attachments").select("*").in("expense_id", expenseIds).order("created_at")
    : { data: [] };

  // Batched into one request for every receipt/photo instead of one
  // signed-URL call per expense - with hundreds of expenses that N+1
  // pattern was by far the slowest part of loading this page. Run in
  // parallel with the statement-order lookup below - neither depends on
  // the other's result, only on `expenses` (already fetched).
  const receiptPaths = [
    ...new Set([
      ...(expenses ?? []).flatMap((e) => [e.receipt_path, e.photo_path].filter((p): p is string => Boolean(p))),
      ...(attachments ?? []).map((a) => a.file_path),
    ]),
  ];
  // Expenses linked to a bank statement line (via reconciliation) sort by
  // the statement's own order within the same date, instead of insertion
  // order - cash expenses (never linked) just keep sorting by their date.
  const statementLineIds = [
    ...new Set((expenses ?? []).flatMap((e) => (e.bank_statement_line_id ? [e.bank_statement_line_id] : []))),
  ];
  // Receipts (unlike photos) can be PDFs - the image-transform thumbnail
  // service can't resize those, so only image paths get a thumb variant.
  const imagePaths = receiptPaths.filter((p) => !isPdfUrl(p));
  const [signedUrlByPath, thumbUrlByPath, { data: lines }] = await Promise.all([
    getCachedSignedUrls("receipts", receiptPaths),
    getCachedThumbUrls("receipts", imagePaths),
    statementLineIds.length > 0
      ? supabase.from("bank_statement_lines").select("id, statement_order").in("id", statementLineIds)
      : Promise.resolve({ data: null }),
  ]);
  const statementOrderById = new Map<string, number>();
  for (const l of lines ?? []) statementOrderById.set(l.id, l.statement_order);

  const withUrls = (expenses ?? [])
    .map((e) => ({
      ...e,
      receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
      receiptThumbUrl: (e.receipt_path && thumbUrlByPath.get(e.receipt_path)) ?? null,
      photoUrl: (e.photo_path && signedUrlByPath.get(e.photo_path)) ?? null,
      photoThumbUrl: (e.photo_path && thumbUrlByPath.get(e.photo_path)) ?? null,
      attachments: (attachments ?? [])
        .filter((a) => a.expense_id === e.id && signedUrlByPath.has(a.file_path))
        .map((a) => ({ id: a.id, kind: a.kind, path: a.file_path, url: signedUrlByPath.get(a.file_path)! })),
      statementOrder: e.bank_statement_line_id ? (statementOrderById.get(e.bank_statement_line_id) ?? null) : null,
    }))
    .sort((a, b) => {
      // Pending expenses stay pinned at the top regardless of date, so they
      // don't get buried under approved history and are easy to find/act
      // on - the moment one gets approved (or rejected), it drops out of
      // this group and takes its normal date-sorted position below.
      const aPending = a.status === "pending" ? 0 : 1;
      const bPending = b.status === "pending" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      // Same date: expenses linked to the statement follow its exact row
      // order for that date, swapping places with each other if that's what
      // the statement shows - this mirrors exactly how the statement's own
      // lines are displayed elsewhere (date desc, then statement row order).
      const byDate = (b.expense_date ?? "").localeCompare(a.expense_date ?? "");
      if (byDate !== 0) return byDate;
      if (a.statementOrder != null && b.statementOrder != null) return a.statementOrder - b.statementOrder;
      // A cash expense (or anything not linked to a statement line) has no
      // statement position - the one entered into the system most recently
      // (highest created_at) shows first among same-date entries.
      return b.created_at.localeCompare(a.created_at);
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
