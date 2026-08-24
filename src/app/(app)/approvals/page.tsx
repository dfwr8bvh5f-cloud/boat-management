import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Banknote, TrendingUp, Users, Wallet, Wrench, CalendarRange, FileText } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { approveBooking, deleteBooking } from "@/lib/actions/bookings";
import { approveStaff, deleteStaff } from "@/lib/actions/staff";
import { approveIncome, deleteIncome } from "@/lib/actions/incomes";
import { approveCashTransaction, deleteCashTransaction } from "@/lib/actions/cash";
import { approveDocument, deleteDocument } from "@/lib/actions/documents";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ExpenseApprovalList } from "@/components/expense-approval-list";
import { IssueApprovalCard } from "@/components/issue-approval-card";
import { UncontrolledCustomSelect } from "@/components/uncontrolled-custom-select";
import { formatDateDisplay } from "@/lib/date-format";
import { getCategoryLabels, getCashTxLabels, getPaymentLabels, getExpenseCategories } from "@/lib/labels";
import { getTranslator } from "@/lib/i18n/locale";
import type { Booking, BoatDocument, CashTransaction, Expense, Income, Issue, Staff } from "@/lib/types/database";
import type { Locale } from "@/lib/i18n/dictionaries";
import { formatCurrency } from "@/lib/money";

function ApprovalRow({
  icon: Icon,
  title,
  subtitle,
  by,
  approveAction,
  rejectAction,
  labels,
  locale,
}: {
  icon: typeof Wrench;
  title: string;
  subtitle: ReactNode;
  by: string;
  approveAction: () => Promise<void>;
  rejectAction: () => Promise<void>;
  labels: { submittedBy: string; approve: string; reject: string; rejectConfirm: string };
  locale: Locale;
}) {
  return (
    <div className="rounded-xl border border-fleet-border bg-white p-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
          <Icon size={16} className="text-fleet-brass" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{title}</div>
          <div className="text-xs text-fleet-ink">{subtitle}</div>
          <div className="mt-0.5 text-2xs text-fleet-ink/70">{labels.submittedBy} {by}</div>
        </div>
      </div>
      <div className="mt-2.5 flex gap-2">
        <form action={approveAction} className="flex-1">
          <button type="submit" className="w-full rounded-lg bg-fleet-teal py-2 text-xs font-bold text-white">
            {labels.approve}
          </button>
        </form>
        <form action={rejectAction} className="flex-1">
          <ConfirmSubmitButton
            locale={locale}
            confirmMessage={labels.rejectConfirm}
            className="w-full rounded-lg border border-fleet-coral py-2 text-xs font-bold text-fleet-coral-text"
          >
            {labels.reject}
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ boat?: string; type?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { boat: boatFilter, type: typeFilter } = await searchParams;
  // Coming from one of the two dashboard tiles (technical vs. financial)
  // scopes the whole page to just that category - landing here any other
  // way (e.g. the boat overview's generic "pending approvals" banner)
  // still shows every category together, same as before.
  const showTechnical = !typeFilter || typeFilter === "technical";
  const showBookings = !typeFilter;
  const showFinancial = !typeFilter || typeFilter === "financial";
  const showDocuments = !typeFilter;
  const supabase = await createClient();
  const { t, locale } = await getTranslator();
  const categoryLabels = getCategoryLabels(locale);
  const paymentLabels = getPaymentLabels(locale);
  const cashTxLabels = getCashTxLabels(locale);
  const rowLabels = {
    submittedBy: t("submitted_by"),
    approve: t("approve"),
    reject: t("reject"),
    rejectConfirm: t("approvals_reject_confirm"),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withBoatFilter = (query: any) => (boatFilter ? query.eq("boat_id", boatFilter) : query);

  const [
    { data: boats },
    { data: profiles },
    { data: technicians },
    issuesRes,
    expensesRes,
    staffRes,
    incomesRes,
    cashTxRes,
    bookingsRes,
    documentsRes,
  ] = await Promise.all([
    supabase.from("boats").select("id, name, boat_type").order("name"),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("technicians").select("*").order("name"),
    withBoatFilter(supabase.from("issues").select("*").eq("status", "pending")).order("created_at"),
    withBoatFilter(supabase.from("expenses").select("*").eq("status", "pending")).order("created_at"),
    withBoatFilter(supabase.from("staff").select("*").eq("status", "pending")).order("created_at"),
    withBoatFilter(supabase.from("incomes").select("*").eq("status", "pending")).order("created_at"),
    withBoatFilter(supabase.from("cash_transactions").select("*").eq("status", "pending")).order("created_at"),
    withBoatFilter(supabase.from("bookings").select("*").eq("status", "pending")).order("created_at"),
    withBoatFilter(supabase.from("documents").select("*").eq("status", "pending")).order("created_at"),
  ]);

  const issues = issuesRes.data as Issue[] | null;
  const expenses = expensesRes.data as Expense[] | null;
  const expenseIds = (expenses ?? []).map((e) => e.id);
  const issueIds = (issues ?? []).map((i) => i.id);
  const [{ data: expenseAttachments }, { data: issueAttachments }] = await Promise.all([
    expenseIds.length
      ? supabase.from("expense_attachments").select("*").in("expense_id", expenseIds)
      : Promise.resolve({ data: [] }),
    issueIds.length ? supabase.from("issue_attachments").select("*").in("issue_id", issueIds) : Promise.resolve({ data: [] }),
  ]);
  const staff = staffRes.data as Staff[] | null;
  const incomes = incomesRes.data as Income[] | null;
  const cashTx = cashTxRes.data as CashTransaction[] | null;
  const bookings = bookingsRes.data as Booking[] | null;
  const documents = documentsRes.data as BoatDocument[] | null;

  const boatName = (id: string) => boats?.find((b) => b.id === id)?.name ?? "";
  const submitterName = (id: string | null) => (id && profiles?.find((p) => p.id === id)?.full_name) || "—";
  const categoriesForBoat = (id: string) => {
    const b = boats?.find((boat) => boat.id === id);
    return getExpenseCategories(b?.boat_type, b?.name, locale);
  };

  const receiptPaths = [
    ...new Set([
      ...(expenses ?? []).flatMap((e) => [e.receipt_path, e.photo_path].filter((p): p is string => Boolean(p))),
      ...(expenseAttachments ?? []).map((a) => a.file_path),
    ]),
  ];
  const issuePaths = [
    ...new Set([
      ...(issues ?? []).flatMap((i) => [i.photo_path, i.quote_path].filter((p): p is string => Boolean(p))),
      ...(issueAttachments ?? []).map((a) => a.file_path),
    ]),
  ];
  const [signedUrlByPath, issueUrlByPath] = await Promise.all([
    getCachedSignedUrls("receipts", receiptPaths),
    getCachedSignedUrls("issue-attachments", issuePaths),
  ]);

  // Prefers the full multi-file list (expense_attachments / issue_attachments)
  // when any exist for that kind, falling back to the single legacy path
  // column only when there's no attachments-table row at all - same
  // precedence expenses-manager.tsx/issues-manager.tsx already use for
  // their own edit forms.
  // Always includes the legacy single-file column alongside whatever's in
  // the attachments table, rather than treating them as alternatives - an
  // expense/issue that had one file before this multi-attachment feature
  // existed, then got a second one added via edit, has its first file
  // ONLY in the legacy column and its second ONLY in the attachments
  // table, so picking just one side used to silently drop the other.
  function expenseFiles(expenseId: string, kind: "receipt" | "photo", legacyPath: string | null) {
    const fromTable = (expenseAttachments ?? []).filter((a) => a.expense_id === expenseId && a.kind === kind && signedUrlByPath.has(a.file_path));
    const legacyEntry =
      legacyPath && signedUrlByPath.has(legacyPath) && !fromTable.some((a) => a.file_path === legacyPath)
        ? [{ id: `${expenseId}-${kind}-legacy`, url: signedUrlByPath.get(legacyPath)! }]
        : [];
    return [...legacyEntry, ...fromTable.map((a) => ({ id: a.id, url: signedUrlByPath.get(a.file_path)! }))];
  }
  function issueFiles(issueId: string, kind: "photo" | "quote", legacyPath: string | null) {
    const fromTable = (issueAttachments ?? []).filter((a) => a.issue_id === issueId && a.kind === kind && issueUrlByPath.has(a.file_path));
    const legacyEntry =
      legacyPath && issueUrlByPath.has(legacyPath) && !fromTable.some((a) => a.file_path === legacyPath)
        ? [{ id: `${issueId}-${kind}-legacy`, url: issueUrlByPath.get(legacyPath)! }]
        : [];
    return [...legacyEntry, ...fromTable.map((a) => ({ id: a.id, url: issueUrlByPath.get(a.file_path)! }))];
  }

  const financialCount = (expenses?.length ?? 0) + (staff?.length ?? 0) + (incomes?.length ?? 0) + (cashTx?.length ?? 0);
  // Only counts whatever categories are actually visible under the current
  // type filter, so a category-scoped view with nothing pending shows the
  // "nothing pending" message instead of a blank page.
  const total =
    (showTechnical ? (issues?.length ?? 0) : 0) +
    (showFinancial ? financialCount : 0) +
    (showBookings ? (bookings?.length ?? 0) : 0) +
    (showDocuments ? (documents?.length ?? 0) : 0);

  // Pre-resolved into plain data here (in the server component) rather
  // than passed as functions - a client component can't receive boatName/
  // expenseFiles/etc as props, only serializable data.
  const expenseCards = (expenses ?? []).map((e) => ({
    expense: e,
    boatName: boatName(e.boat_id),
    submittedBy: submitterName(e.created_by),
    receiptFiles: expenseFiles(e.id, "receipt", e.receipt_path),
    photoFiles: expenseFiles(e.id, "photo", e.photo_path),
    categories: categoriesForBoat(e.boat_id),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-fleet-navy">
            {typeFilter === "technical" ? t("approvals_technical") : typeFilter === "financial" ? t("approvals_financial") : t("approvals_title")}
          </h1>
          {typeFilter && (
            <a href={`/approvals${boatFilter ? `?boat=${boatFilter}` : ""}`} className="text-xs text-fleet-teal underline">
              {t("approvals_view_all")}
            </a>
          )}
        </div>
        {boats && boats.length > 1 && (
          <form method="GET" className="flex items-center gap-2">
            {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
            <UncontrolledCustomSelect
              name="boat"
              defaultValue={boatFilter ?? ""}
              options={[{ value: "", label: t("all_boats") }, ...boats.map((b) => ({ value: b.id, label: b.name }))]}
              className="rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg bg-fleet-teal px-3 py-2 text-sm font-bold text-white">
              {t("approvals_filter_go")}
            </button>
          </form>
        )}
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_approvals")}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {showTechnical && issues && issues.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fleet-ink">
                <Wrench size={14} /> {t("approvals_technical")} ({issues.length})
              </h2>
              <div className="flex flex-col gap-2.5">
                {issues.map((i) => (
                  <IssueApprovalCard
                    key={i.id}
                    issue={i}
                    boatName={boatName(i.boat_id)}
                    submittedBy={submitterName(i.created_by)}
                    photoFiles={issueFiles(i.id, "photo", i.photo_path)}
                    quoteFiles={issueFiles(i.id, "quote", i.quote_path)}
                    technicians={technicians ?? []}
                    locale={locale}
                  />
                ))}
              </div>
            </section>
          )}

          {showBookings && bookings && bookings.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fleet-ink">
                <CalendarRange size={14} /> {t("approvals_bookings")} ({bookings.length})
              </h2>
              <div className="flex flex-col gap-2.5">
                {bookings.map((b) => (
                  <ApprovalRow
                    locale={locale}
                    key={b.id}
                    icon={CalendarRange}
                    title={b.customer_name}
                    subtitle={<>{boatName(b.boat_id)} · <span dir="ltr">{formatDateDisplay(b.start_date)}</span> – <span dir="ltr">{formatDateDisplay(b.end_date)}</span></>}
                    by={submitterName(b.created_by)}
                    approveAction={approveBooking.bind(null, b.boat_id, b.id)}
                    rejectAction={deleteBooking.bind(null, b.boat_id, b.id)}
                    labels={rowLabels}
                  />
                ))}
              </div>
            </section>
          )}

          {showFinancial && financialCount > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fleet-ink">
                <Wallet size={14} /> {t("approvals_financial")} ({financialCount})
              </h2>
              <div className="flex flex-col gap-2.5">
                {expenseCards.length > 0 && (
                  <ExpenseApprovalList
                    items={expenseCards}
                    categoryLabels={categoryLabels}
                    paymentLabels={paymentLabels}
                    locale={locale}
                  />
                )}
                {staff?.map((m) => (
                  <ApprovalRow
                    locale={locale}
                    key={m.id}
                    icon={Users}
                    title={m.name}
                    subtitle={`${boatName(m.boat_id)} · ${m.position ?? ""}`}
                    by={submitterName(m.created_by)}
                    approveAction={approveStaff.bind(null, m.boat_id, m.id)}
                    rejectAction={deleteStaff.bind(null, m.boat_id, m.id, m.photo_path, m.resume_path, m.id_document_path)}
                    labels={rowLabels}
                  />
                ))}
                {incomes?.map((i) => (
                  <ApprovalRow
                    locale={locale}
                    key={i.id}
                    icon={TrendingUp}
                    title={i.source}
                    subtitle={`${boatName(i.boat_id)} · ${i.type === "future" ? t("income_type_future") : t("income_type_bank")} · ${formatCurrency(i.amount)}`}
                    by={submitterName(i.created_by)}
                    approveAction={approveIncome.bind(null, i.boat_id, i.id)}
                    rejectAction={deleteIncome.bind(null, i.boat_id, i.id)}
                    labels={rowLabels}
                  />
                ))}
                {cashTx?.map((c) => (
                  <ApprovalRow
                    locale={locale}
                    key={c.id}
                    icon={Banknote}
                    title={cashTxLabels[c.type]}
                    subtitle={<>{boatName(c.boat_id)} · <span dir="ltr">{formatDateDisplay(c.tx_date)}</span> · {formatCurrency(c.amount)}</>}
                    by={submitterName(c.created_by)}
                    approveAction={approveCashTransaction.bind(null, c.boat_id, c.id)}
                    rejectAction={deleteCashTransaction.bind(null, c.boat_id, c.id)}
                    labels={rowLabels}
                  />
                ))}
              </div>
            </section>
          )}

          {showDocuments && documents && documents.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fleet-ink">
                <FileText size={14} /> {t("approvals_documents")} ({documents.length})
              </h2>
              <div className="flex flex-col gap-2.5">
                {documents.map((d) => (
                  <ApprovalRow
                    locale={locale}
                    key={d.id}
                    icon={FileText}
                    title={d.name}
                    subtitle={<>{boatName(d.boat_id)} · {d.doc_type}{d.expiry_date ? <> · <span dir="ltr">{formatDateDisplay(d.expiry_date)}</span></> : null}</>}
                    by={submitterName(d.uploaded_by)}
                    approveAction={approveDocument.bind(null, d.boat_id, d.id)}
                    rejectAction={deleteDocument.bind(null, d.boat_id, d.id, d.file_path)}
                    labels={rowLabels}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
