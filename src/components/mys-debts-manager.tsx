"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp, FileText, ListChecks, Pencil, Pin, Plus, Scale, Search, Trash2, X } from "lucide-react";
import {
  addMysDebtSettlement,
  updateMysDebtSettlement,
  deleteMysDebtSettlement,
  createMysAdHocCharge,
  deleteMysAdHocCharge,
  updateMysAdHocCharge,
  createMysAdHocChargeUploadUrl,
  removeMysAdHocChargeAttachment,
  updateMysDebtCharge,
  deleteMysDebtCharge,
  createMysClient,
  updateMysInvoice,
  updateMysInvoiceLine,
  removeMysInvoiceLine,
  addMysInvoicePayment,
  updateMysInvoicePayment,
  deleteMysInvoicePayment,
  voidMysInvoice,
} from "@/lib/actions/mys";
import {
  addMysSupplierCommissionPayment,
  updateMysSupplierCommission,
  createMysSupplierUploadUrl,
  deleteMysSupplierCommission,
} from "@/lib/actions/mys-commissions";
import { AttachmentGroup } from "@/components/attachment-group";
import { ConfirmPopup } from "@/components/confirm-popup";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { FileChip } from "@/components/file-chip";
import { UploadButton } from "@/components/upload-button";
import { MysInvoiceFromDebtsForm, type SelectedDebtRow } from "@/components/mys-invoice-from-debts-form";
import { compressImageToLimit, HeicUnsupportedError } from "@/lib/image-compress";
import { useFileDrop, useMultiFileDrop } from "@/lib/use-file-drop";
import { createClient } from "@/lib/supabase/client";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/upload";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { formatCurrency, round2 } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import { getCategoryLabels, getExpenseCategories, getPaymentLabels, PAYMENT_METHODS } from "@/lib/labels";
import type { Locale } from "@/lib/i18n/dictionaries";
import type {
  BoatType,
  ExpenseCategory,
  MysCommissionPayment,
  MysDebtSettlement,
  MysInvoiceLine,
  MysInvoicePayment,
  MysInvoiceStatus,
  MysSupplierCommissionStatus,
  PaymentMethod,
} from "@/lib/types/database";
import { INPUT_CLASS, INPUT_CLASS_INLINE, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

const NEW_CLIENT_OPTION_VALUE = "__new_client__";

type BoatCharge = {
  id: string;
  boat_id: string;
  description: string;
  amount: number;
  expense_date: string | null;
  receipt_path: string | null;
  photo_path: string | null;
  boatName: string;
  // What's actually still owed (amount minus everything recorded via
  // addMysDebtSettlement) - and that history itself, for the "paid so far"
  // caption and settlement list. See 0093_mys_debt_settlements.sql.
  remainingAmount: number;
  paidSoFar: number;
  settlements: MysDebtSettlement[];
};
type AdHocCharge = {
  id: string;
  client_name: string;
  description: string;
  amount: number;
  charge_date: string;
  remainingAmount: number;
  paidSoFar: number;
  settlements: MysDebtSettlement[];
  // The invoice(s) she issued this client for this charge.
  attachments: { id: string; url: string; path: string }[];
};
type Invoice = {
  id: string;
  boat_id: string | null;
  invoice_number: string;
  client_name: string;
  client_email: string | null;
  client_company_details: string | null;
  description: string;
  status: MysInvoiceStatus;
  amount: number;
  vat_amount: number;
  // What's actually still owed on this invoice (total minus any payments
  // already recorded via addMysInvoicePayment) - precomputed on the page,
  // not the invoice's original amount/vat_amount.
  remainingAmount: number;
  issued_date: string;
  due_date: string | null;
  boatName: string | null;
  lines: MysInvoiceLine[];
  payments: MysInvoicePayment[];
};

type SupplierCommission = {
  id: string;
  supplier_name: string;
  invoice_date: string | null;
  invoice_amount: number;
  commission_percent: number;
  commission_amount: number;
  vat_percent: number | null;
  total_amount: number;
  notes: string | null;
  status: MysSupplierCommissionStatus;
  // What's actually still owed (total_amount minus everything recorded via
  // addMysSupplierCommissionPayment) - and that history itself, for the
  // "paid so far" caption. See 0101_mys_commission_payments.sql.
  remainingAmount: number;
  paidSoFar: number;
  payments: MysCommissionPayment[];
  attachments: { id: string; url: string }[];
  // The invoice she herself issues to the supplier for this commission -
  // distinct from `attachments` above (the supplier's own invoice(s)).
  // commission_invoice_url is the resolved signed URL, null until a file's
  // been uploaded. See 0094_mys_commission_invoice_path.sql.
  commission_invoice_path: string | null;
  commission_invoice_url: string | null;
};

type DebtRow =
  | { kind: "charge"; id: string; boatId: string; boatName: string; label: string; amount: number; date: string | null; isSettled: boolean }
  | { kind: "ad_hoc"; id: string; boatId: null; boatName: string; label: string; amount: number; date: string | null; isSettled: boolean }
  | { kind: "invoice"; id: string; boatId: string | null; boatName: string; label: string; amount: number; date: string | null; isSettled: boolean }
  | { kind: "commission"; id: string; boatId: null; boatName: string; label: string; amount: number; date: string | null; isSettled: boolean };

type SortBy = "date_desc" | "date_asc" | "client" | "amount";

export function MysDebtsManager({
  boats,
  charges,
  adHocCharges,
  invoices,
  commissions,
  clientNames,
  clientEmailByName,
  locale,
}: {
  boats: { id: string; name: string; boat_type: BoatType }[];
  charges: BoatCharge[];
  adHocCharges: AdHocCharge[];
  invoices: Invoice[];
  commissions: SupplierCommission[];
  clientNames: string[];
  // Known clients' saved emails (mys_clients.email, /mys/clients) - passed
  // through to the combine-into-invoice form so its email field can
  // auto-fill from the already-fixed client of the selected debts.
  clientEmailByName: Record<string, string>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const router = useRouter();
  const paymentLabels = getPaymentLabels(locale);
  const categoryLabels = getCategoryLabels(locale);
  const boatById = useMemo(() => new Map(boats.map((b) => [b.id, b])), [boats]);
  const boatIdByName = useMemo(() => new Map(boats.map((b) => [b.name, b.id])), [boats]);

  const [boatFilter, setBoatFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date_desc");
  const [search, setSearch] = useState("");
  const deferredSearchTerm = useDeferredValue(search.trim().toLowerCase());
  const [showAdHocForm, setShowAdHocForm] = useState(false);
  const [chargeDate, setChargeDate] = useState(todayLocalISO());
  const [adHocClientName, setAdHocClientName] = useState("");
  const [adHocError, setAdHocError] = useState<string | null>(null);
  const [savingAdHoc, setSavingAdHoc] = useState(false);
  // A name that matches one of the fleet's own boats gets charged straight
  // onto that boat's own expenses (see createMysAdHocCharge) instead of
  // becoming a standalone ad-hoc-charge record - shown here purely as a
  // hint; the actual routing decision is made server-side.
  const boatNameSet = useMemo(() => new Set(boats.map((b) => b.name)), [boats]);
  const adHocClientIsBoat = boatNameSet.has(adHocClientName);

  const [showAddClientForm, setShowAddClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);

  const invoicesById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);
  const chargesById = useMemo(() => new Map(charges.map((c) => [c.id, c])), [charges]);
  const adHocChargesById = useMemo(() => new Map(adHocCharges.map((c) => [c.id, c])), [adHocCharges]);
  const commissionsById = useMemo(() => new Map(commissions.map((c) => [c.id, c])), [commissions]);
  const commissionDefaultLabel = t("mys_commission_label");

  const rows: DebtRow[] = useMemo(
    () => [
      ...charges.map(
        (c): DebtRow => ({
          kind: "charge",
          id: c.id,
          boatId: c.boat_id,
          boatName: c.boatName,
          label: c.description,
          amount: c.remainingAmount,
          date: c.expense_date,
          isSettled: c.remainingAmount <= 0,
        }),
      ),
      ...adHocCharges.map(
        (c): DebtRow => ({
          kind: "ad_hoc",
          id: c.id,
          boatId: null,
          boatName: c.client_name,
          label: c.description,
          amount: c.remainingAmount,
          date: c.charge_date,
          isSettled: c.remainingAmount <= 0,
        }),
      ),
      ...invoices.map(
        (i): DebtRow => ({
          kind: "invoice",
          id: i.id,
          boatId: i.boat_id,
          boatName: i.boatName ?? i.client_name,
          label: `${i.invoice_number} - ${i.client_name}`,
          amount: i.remainingAmount,
          date: i.issued_date,
          isSettled: false,
        }),
      ),
      ...commissions.map(
        (c): DebtRow => ({
          kind: "commission",
          id: c.id,
          boatId: null,
          boatName: c.supplier_name,
          label: c.notes || commissionDefaultLabel,
          amount: c.remainingAmount,
          date: c.invoice_date,
          isSettled: c.remainingAmount <= 0,
        }),
      ),
    ],
    [charges, adHocCharges, invoices, commissions, commissionDefaultLabel],
  );

  // Billable selection for "issue invoice" - only "charge"/"ad_hoc" rows
  // can be selected (an "invoice" row is already invoiced). Every selected
  // row must share the same client: once the first pick locks in a client,
  // any row for a different one is disabled - an invoice can only ever go
  // to one client.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  // The checkboxes only render once she turns this on - hidden the rest of
  // the time so they don't clutter every row (matches the boat Expenses
  // page's own "Select from list" toggle).
  const [selectMode, setSelectMode] = useState(false);
  const toggleSelectMode = () => {
    setSelectMode((s) => !s);
    setSelectedKeys(new Set());
  };
  const rowKey = (r: DebtRow) => `${r.kind}-${r.id}`;
  const selectedRows = useMemo(() => rows.filter((r) => r.kind !== "invoice" && selectedKeys.has(rowKey(r))), [rows, selectedKeys]);
  const lockedClientName = selectedRows[0]?.boatName ?? null;
  const toggleSelected = (r: DebtRow) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const key = rowKey(r);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [showInvoicePanel, setShowInvoicePanel] = useState(false);
  const invoiceFormRows: SelectedDebtRow[] = selectedRows.map((r) => ({
    kind: r.kind as "charge" | "ad_hoc",
    id: r.id,
    description: r.label,
    amount: r.amount,
    boatId: r.boatId,
    clientName: r.boatName,
  }));

  const sortedFilteredRows = useMemo(() => {
    let filtered = boatFilter ? rows.filter((r) => r.boatName === boatFilter) : rows;
    if (deferredSearchTerm) {
      filtered = filtered.filter(
        (r) => r.boatName.toLowerCase().includes(deferredSearchTerm) || r.label.toLowerCase().includes(deferredSearchTerm)
      );
    }
    const sorted = filtered.slice();
    switch (sortBy) {
      case "date_asc":
        sorted.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
        break;
      case "client":
        sorted.sort((a, b) => a.boatName.localeCompare(b.boatName));
        break;
      case "amount":
        sorted.sort((a, b) => b.amount - a.amount);
        break;
      default:
        sorted.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    }
    // Fully-settled charge/ad-hoc rows always sink to the bottom, on top of
    // whichever sort she picked above - she wants to see what's still open
    // before scrolling past what's already paid, regardless of date/amount/
    // client ordering.
    sorted.sort((a, b) => Number(a.isSettled) - Number(b.isSettled));
    return sorted;
  }, [rows, boatFilter, sortBy, deferredSearchTerm]);
  const total = sortedFilteredRows.reduce((s, r) => s + r.amount, 0);

  // Per-boat/client overview tiles - always summed from the full,
  // unfiltered list (not sortedFilteredRows) so they stay a stable "who
  // owes what" overview regardless of which one is currently selected in
  // the filter below; clicking a tile drives that same filter.
  const totalsByClient = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.boatName, round2((totals.get(r.boatName) ?? 0) + r.amount));
    // A client whose every charge is fully settled sums to exactly 0 - no
    // longer an actual open debt, so it shouldn't take up a tile here (the
    // rows themselves still show further down, sunk to the bottom as paid).
    return [...totals.entries()].filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const doCreateAdHoc = async (formData: FormData) => {
    setAdHocError(null);
    if (!adHocClientName) {
      setAdHocError(t("mys_client_required"));
      return;
    }
    setSavingAdHoc(true);
    try {
      await createMysAdHocCharge(formData);
      setShowAdHocForm(false);
      setChargeDate(todayLocalISO());
      setAdHocClientName("");
    } catch (e) {
      setAdHocError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSavingAdHoc(false);
    }
  };

  const doAddClient = async (formData: FormData) => {
    setAddClientError(null);
    setSavingClient(true);
    try {
      await createMysClient(formData);
      setShowAddClientForm(false);
      setNewClientName("");
    } catch (e) {
      setAddClientError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSavingClient(false);
    }
  };

  // --- Edit an existing invoice (description/client/due-date always,
  // amount/vat only for a lines-less, manually-typed invoice - see
  // updateMysInvoice, src/lib/actions/mys.ts). The attached invoice file
  // itself stays managed from the Invoices page, not here. ---
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [editClientCompanyDetails, setEditClientCompanyDetails] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editVatAmount, setEditVatAmount] = useState("");
  const [editLines, setEditLines] = useState<{ id: string; description: string; amount: string; vat_percent: string }[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const startEditInvoice = (inv: Invoice) => {
    setEditingInvoiceId(inv.id);
    setEditDescription(inv.description);
    setEditClientName(inv.client_name);
    setEditClientEmail(inv.client_email ?? "");
    setEditClientCompanyDetails(inv.client_company_details ?? "");
    setEditDueDate(inv.due_date ?? "");
    setEditAmount(String(inv.amount));
    setEditVatAmount(String(inv.vat_amount));
    setEditLines(inv.lines.map((l) => ({ id: l.id, description: l.description, amount: String(l.amount), vat_percent: String(l.vat_percent) })));
    setEditError(null);
  };
  const setEditLineField = (id: string, field: "description" | "amount" | "vat_percent", value: string) =>
    setEditLines((ls) => ls.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  const closeEditInvoice = () => {
    setEditingInvoiceId(null);
    setEditError(null);
  };

  const doSaveEditInvoice = async (invoiceId: string) => {
    setEditError(null);
    setEditSaving(true);
    try {
      await Promise.all(
        editLines.map((l) => {
          const lineFd = new FormData();
          lineFd.set("description", l.description);
          lineFd.set("amount", l.amount);
          lineFd.set("vat_percent", l.vat_percent);
          return updateMysInvoiceLine(l.id, lineFd);
        })
      );
      const fd = new FormData();
      fd.set("client_name", editClientName);
      fd.set("client_email", editClientEmail);
      fd.set("client_company_details", editClientCompanyDetails);
      fd.set("description", editDescription);
      fd.set("due_date", editDueDate);
      fd.set("amount", editAmount);
      fd.set("vat_amount", editVatAmount);
      // The attached file (invoice_path) is managed from the Invoices page
      // only - omit it here so this save never touches it.
      const result = await updateMysInvoice(invoiceId, fd);
      if (result?.error) {
        setEditError(result.error);
        return;
      }
      closeEditInvoice();
      router.refresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setEditSaving(false);
    }
  };

  // --- Record a (possibly partial) payment against a 'sent'/'draft' invoice ---
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayLocalISO());
  const [payNotes, setPayNotes] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const startPayment = (inv: Invoice) => {
    setPayingInvoiceId(inv.id);
    setPayAmount(String(inv.remainingAmount));
    setPayDate(todayLocalISO());
    setPayNotes("");
    setPayError(null);
  };
  const closePayment = () => {
    setPayingInvoiceId(null);
    setPayError(null);
  };
  const doSavePayment = async (invoiceId: string) => {
    setPayError(null);
    setPaySaving(true);
    try {
      const fd = new FormData();
      fd.set("amount", payAmount);
      fd.set("paid_date", payDate);
      fd.set("notes", payNotes);
      const result = await addMysInvoicePayment(invoiceId, fd);
      if (result?.error) {
        setPayError(result.error);
        return;
      }
      closePayment();
      router.refresh();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setPaySaving(false);
    }
  };

  // --- Record a (possibly partial) payment against a "charge"/"ad_hoc"
  // debt row (see addMysDebtSettlement, src/lib/actions/mys.ts) - same
  // shape as the invoice payment form above, plus a payment method. ---
  const [payingDebtRow, setPayingDebtRow] = useState<{ kind: "charge" | "ad_hoc"; id: string; boatId: string | null } | null>(null);
  const [debtPayAmount, setDebtPayAmount] = useState("");
  const [debtPayDate, setDebtPayDate] = useState(todayLocalISO());
  const [debtPayMethod, setDebtPayMethod] = useState<PaymentMethod | "">("");
  const [debtPayNotes, setDebtPayNotes] = useState("");
  // Only meaningful (and only shown) for "charge" - a real boat expenses
  // row mirrored into existence with no category yet - see
  // addMysDebtSettlement's own comment on why this lives in the payment
  // form rather than a separate edit step.
  const [debtPayCategory, setDebtPayCategory] = useState<ExpenseCategory | "">("");
  const [debtPaySaving, setDebtPaySaving] = useState(false);
  const [debtPayError, setDebtPayError] = useState<string | null>(null);

  const startDebtPayment = (r: Extract<DebtRow, { kind: "charge" | "ad_hoc" }>) => {
    setPayingDebtRow({ kind: r.kind, id: r.id, boatId: r.boatId });
    setDebtPayAmount(String(r.amount));
    setDebtPayDate(todayLocalISO());
    setDebtPayMethod("");
    setDebtPayNotes("");
    setDebtPayCategory("");
    setDebtPayError(null);
  };
  const closeDebtPayment = () => {
    setPayingDebtRow(null);
    setDebtPayError(null);
  };
  const doSaveDebtPayment = async () => {
    if (!payingDebtRow) return;
    setDebtPayError(null);
    setDebtPaySaving(true);
    try {
      const fd = new FormData();
      fd.set("amount", debtPayAmount);
      fd.set("paid_date", debtPayDate);
      fd.set("payment_method", debtPayMethod);
      fd.set("notes", debtPayNotes);
      if (payingDebtRow.kind === "charge") fd.set("category", debtPayCategory);
      const result = await addMysDebtSettlement(payingDebtRow.kind, payingDebtRow.id, payingDebtRow.boatId, fd);
      if (result?.error) {
        setDebtPayError(result.error);
        return;
      }
      closeDebtPayment();
      router.refresh();
    } catch (e) {
      setDebtPayError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setDebtPaySaving(false);
    }
  };

  // --- Record a (possibly partial) payment against a commission (see
  // addMysSupplierCommissionPayment, src/lib/actions/mys-commissions.ts) -
  // same shape as the charge/ad_hoc payment form above. ---
  const [payingCommissionId, setPayingCommissionId] = useState<string | null>(null);
  const [commPayAmount, setCommPayAmount] = useState("");
  const [commPayDate, setCommPayDate] = useState(todayLocalISO());
  const [commPayMethod, setCommPayMethod] = useState<PaymentMethod | "">("");
  const [commPaySaving, setCommPaySaving] = useState(false);
  const [commPayError, setCommPayError] = useState<string | null>(null);

  const startCommissionPayment = (id: string) => {
    setPayingCommissionId(id);
    setCommPayAmount(String(commissionsById.get(id)?.remainingAmount ?? ""));
    setCommPayDate(todayLocalISO());
    setCommPayMethod("");
    setCommPayError(null);
  };
  const closeCommissionPayment = () => {
    setPayingCommissionId(null);
    setCommPayError(null);
  };
  const doSaveCommissionPayment = async () => {
    if (!payingCommissionId) return;
    setCommPayError(null);
    setCommPaySaving(true);
    try {
      const fd = new FormData();
      fd.set("amount", commPayAmount);
      fd.set("paid_date", commPayDate);
      fd.set("payment_method", commPayMethod);
      const result = await addMysSupplierCommissionPayment(payingCommissionId, fd);
      if (result?.error) {
        setCommPayError(result.error);
        return;
      }
      closeCommissionPayment();
      router.refresh();
    } catch (e) {
      setCommPayError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setCommPaySaving(false);
    }
  };

  // --- Expand a "charge"/"ad_hoc" row to show its full settlement history
  // (date/method/amount/notes per payment), with each one individually
  // editable - mirrors the boat expense payment-plan's PlanPaymentsSection. ---
  const [expandedDebtKey, setExpandedDebtKey] = useState<string | null>(null);
  const [editingSettlementId, setEditingSettlementId] = useState<string | null>(null);
  const [editSettleAmount, setEditSettleAmount] = useState("");
  const [editSettleDate, setEditSettleDate] = useState("");
  const [editSettleMethod, setEditSettleMethod] = useState<PaymentMethod | "">("");
  const [editSettleNotes, setEditSettleNotes] = useState("");
  const [editSettleSaving, setEditSettleSaving] = useState(false);
  const [editSettleError, setEditSettleError] = useState<string | null>(null);

  const startEditSettlement = (s: MysDebtSettlement) => {
    setEditingSettlementId(s.id);
    setEditSettleAmount(String(s.amount));
    setEditSettleDate(s.paid_date);
    setEditSettleMethod(s.payment_method ?? "");
    setEditSettleNotes(s.notes ?? "");
    setEditSettleError(null);
  };
  const closeEditSettlement = () => {
    setEditingSettlementId(null);
    setEditSettleError(null);
  };
  const doSaveEditSettlement = async (r: Extract<DebtRow, { kind: "charge" | "ad_hoc" }>) => {
    if (!editingSettlementId) return;
    setEditSettleError(null);
    setEditSettleSaving(true);
    try {
      const fd = new FormData();
      fd.set("amount", editSettleAmount);
      fd.set("paid_date", editSettleDate);
      fd.set("payment_method", editSettleMethod);
      fd.set("notes", editSettleNotes);
      const result = await updateMysDebtSettlement(editingSettlementId, r.kind, r.id, r.boatId, fd);
      if (result?.error) {
        setEditSettleError(result.error);
        return;
      }
      closeEditSettlement();
      router.refresh();
    } catch (e) {
      setEditSettleError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setEditSettleSaving(false);
    }
  };

  // Removes a single (e.g. mistaken/duplicate) settlement from a debt's
  // history - confirmed via the same fixed-modal pattern already used for
  // pendingVoidId/pendingRemoveLineId below, not a plain <form action>
  // since deleteMysDebtSettlement's caller needs the row's own
  // kind/id/boatId, not just the settlement's id.
  const [pendingDeleteSettlement, setPendingDeleteSettlement] = useState<{
    settlementId: string;
    kind: "charge" | "ad_hoc";
    targetId: string;
    boatId: string | null;
  } | null>(null);
  const [deleteSettleSaving, setDeleteSettleSaving] = useState(false);
  const doDeleteSettlement = async () => {
    if (!pendingDeleteSettlement) return;
    setDeleteSettleSaving(true);
    try {
      await deleteMysDebtSettlement(
        pendingDeleteSettlement.settlementId,
        pendingDeleteSettlement.kind,
        pendingDeleteSettlement.targetId,
        pendingDeleteSettlement.boatId
      );
      router.refresh();
    } finally {
      setDeleteSettleSaving(false);
      setPendingDeleteSettlement(null);
    }
  };

  // --- Edit a "commission" debt row directly from /mys/debts (supplier
  // name/invoice amount/commission %/VAT/notes, same fields the dedicated
  // /mys/commissions page edits) plus the invoice SHE issues to the
  // supplier for it - a single file, separate from the supplier's own
  // invoice(s) shown via AttachmentGroup on the row. ---
  const [editingCommissionId, setEditingCommissionId] = useState<string | null>(null);
  const [editCommSupplierName, setEditCommSupplierName] = useState("");
  const [editCommInvoiceDate, setEditCommInvoiceDate] = useState("");
  const [editCommInvoiceAmount, setEditCommInvoiceAmount] = useState("");
  const [editCommPricingMode, setEditCommPricingMode] = useState<"percent" | "amount">("percent");
  const [editCommPercentValue, setEditCommPercentValue] = useState("");
  const [editCommAmountValue, setEditCommAmountValue] = useState("");
  const [editCommVatEnabled, setEditCommVatEnabled] = useState(false);
  const [editCommVatPercentValue, setEditCommVatPercentValue] = useState("24");
  const [editCommNotes, setEditCommNotes] = useState("");
  // The invoice file itself: existing path/url (from the fetched row,
  // cleared to signal removal), or a freshly-uploaded replacement.
  const [editCommInvoicePath, setEditCommInvoicePath] = useState<string | null>(null);
  const [editCommInvoiceUrl, setEditCommInvoiceUrl] = useState<string | null>(null);
  const [editCommInvoiceName, setEditCommInvoiceName] = useState<string | null>(null);
  const [editCommUploading, setEditCommUploading] = useState(false);
  const [editCommUploadError, setEditCommUploadError] = useState<string | null>(null);
  const [editCommSaving, setEditCommSaving] = useState(false);
  const [editCommError, setEditCommError] = useState<string | null>(null);

  const editCommInvoiceAmountNum = Number(editCommInvoiceAmount) || 0;
  const editCommPreviewAmount = useMemo(() => {
    if (editCommPricingMode === "amount") return Number(editCommAmountValue) || 0;
    return round2(editCommInvoiceAmountNum * ((Number(editCommPercentValue) || 0) / 100));
  }, [editCommPricingMode, editCommInvoiceAmountNum, editCommPercentValue, editCommAmountValue]);
  const editCommPreviewPercent = useMemo(() => {
    if (editCommPricingMode === "percent") return Number(editCommPercentValue) || 0;
    return editCommInvoiceAmountNum > 0 ? round2(((Number(editCommAmountValue) || 0) / editCommInvoiceAmountNum) * 100) : 0;
  }, [editCommPricingMode, editCommInvoiceAmountNum, editCommPercentValue, editCommAmountValue]);
  const editCommPreviewVat = editCommVatEnabled ? round2(editCommPreviewAmount * ((Number(editCommVatPercentValue) || 0) / 100)) : 0;
  const editCommPreviewTotal = round2(editCommPreviewAmount + editCommPreviewVat);

  const startEditCommission = (c: SupplierCommission) => {
    setEditingCommissionId(c.id);
    setEditCommSupplierName(c.supplier_name);
    setEditCommInvoiceDate(c.invoice_date ?? "");
    setEditCommInvoiceAmount(String(c.invoice_amount));
    setEditCommPricingMode("percent");
    setEditCommPercentValue(String(c.commission_percent));
    setEditCommAmountValue(String(c.commission_amount));
    setEditCommVatEnabled(c.vat_percent != null);
    setEditCommVatPercentValue(c.vat_percent != null ? String(c.vat_percent) : "24");
    setEditCommNotes(c.notes ?? "");
    setEditCommInvoicePath(c.commission_invoice_path);
    setEditCommInvoiceUrl(c.commission_invoice_url);
    setEditCommInvoiceName(c.commission_invoice_path ? t("mys_commission_invoice_label") : null);
    setEditCommUploadError(null);
    setEditCommError(null);
  };
  const closeEditCommission = () => {
    setEditingCommissionId(null);
    setEditCommError(null);
  };
  const onCommInvoiceFile = async (file: File | undefined) => {
    if (!file) return;
    setEditCommUploadError(null);
    let toUpload: File;
    try {
      toUpload = file.type.startsWith("image/") ? await compressImageToLimit(file, MAX_UPLOAD_FILE_BYTES) : file;
    } catch (e) {
      setEditCommUploadError(e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      return;
    }
    if (toUpload.size > MAX_UPLOAD_FILE_BYTES) {
      setEditCommUploadError(t("doc_file_too_large"));
      return;
    }
    setEditCommUploading(true);
    try {
      const { path, token } = await createMysSupplierUploadUrl(toUpload.name);
      const supabase = createClient();
      const { error } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, toUpload);
      if (error) throw error;
      setEditCommInvoicePath(path);
      setEditCommInvoiceUrl(null);
      setEditCommInvoiceName(toUpload.name);
    } catch (e) {
      setEditCommUploadError(e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      setEditCommUploading(false);
    }
  };
  const clearCommInvoiceFile = () => {
    setEditCommInvoicePath(null);
    setEditCommInvoiceUrl(null);
    setEditCommInvoiceName(null);
  };
  const { dragging: commInvoiceDragging, dropHandlers: commInvoiceDropHandlers } = useFileDrop(onCommInvoiceFile);
  const doSaveEditCommission = async () => {
    if (!editingCommissionId) return;
    setEditCommError(null);
    setEditCommSaving(true);
    try {
      const fd = new FormData();
      fd.set("supplier_name", editCommSupplierName);
      fd.set("invoice_date", editCommInvoiceDate);
      fd.set("invoice_amount", editCommInvoiceAmount);
      fd.set("pricing_mode", editCommPricingMode);
      fd.set("commission_percent", editCommPricingMode === "percent" ? editCommPercentValue : String(editCommPreviewPercent));
      fd.set("commission_amount", editCommPricingMode === "amount" ? editCommAmountValue : String(editCommPreviewAmount));
      fd.set("vat_percent", editCommVatEnabled ? editCommVatPercentValue : "");
      fd.set("notes", editCommNotes);
      fd.set("commission_invoice_path", editCommInvoicePath ?? "");
      const result = await updateMysSupplierCommission(editingCommissionId, fd);
      if (result?.error) {
        setEditCommError(result.error);
        return;
      }
      closeEditCommission();
      router.refresh();
    } catch (e) {
      setEditCommError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setEditCommSaving(false);
    }
  };

  const [voidError, setVoidError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  // A plain click+confirm (not a <form>-submitted ConfirmSubmitButton) so a
  // refusal - e.g. voidMysInvoice refusing an invoice that already has
  // payments recorded - can be shown in-line instead of hitting the app's
  // generic error boundary. The popup itself offers a choice (reopen the
  // billed charge(s) as debts again, or delete them outright) rather than a
  // single yes/no, per her explicit ask.
  const [pendingVoidId, setPendingVoidId] = useState<string | null>(null);
  const doVoid = async (invoiceId: string, mode: "reopen" | "delete") => {
    setVoidError(null);
    setVoiding(true);
    try {
      const result = await voidMysInvoice(invoiceId, mode);
      if (result?.error) {
        setVoidError(result.error);
        return;
      }
      setPendingVoidId(null);
      router.refresh();
    } catch (e) {
      setVoidError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setVoiding(false);
    }
  };

  // --- Take one line back off an issued invoice, returning its source
  // (the boat expense/ad-hoc charge it was billed from) to the open debts
  // list - see removeMysInvoiceLine. Closes the edit panel and refetches
  // afterward rather than reconciling local editLines state by hand, since
  // removing the invoice's last line deletes the invoice itself server-side. ---
  const [removingLineId, setRemovingLineId] = useState<string | null>(null);
  const [removeLineError, setRemoveLineError] = useState<string | null>(null);
  const [pendingRemoveLineId, setPendingRemoveLineId] = useState<string | null>(null);
  const doRemoveLine = async (lineId: string) => {
    setRemoveLineError(null);
    setRemovingLineId(lineId);
    try {
      const result = await removeMysInvoiceLine(lineId);
      if (result?.error) {
        setRemoveLineError(result.error);
        return;
      }
      closeEditInvoice();
      router.refresh();
    } catch (e) {
      setRemoveLineError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setRemovingLineId(null);
    }
  };

  // --- Edit/delete a previously-recorded invoice payment - see
  // updateMysInvoicePayment/deleteMysInvoicePayment. Immediate (not batched
  // with the rest of the invoice edit), same as line removal above - unlike
  // removing the invoice's last line, removing a payment never deletes the
  // invoice itself (only its paid/sent status, kept in sync server-side),
  // so the edit panel stays open afterward instead of closing. Deleting
  // every payment here is also how a "paid" invoice becomes voidable again
  // - voidMysInvoice refuses while any payment remains. ---
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editPayAmount, setEditPayAmount] = useState("");
  const [editPayDate, setEditPayDate] = useState("");
  const [editPayNotes, setEditPayNotes] = useState("");
  const [editPaySaving, setEditPaySaving] = useState(false);
  const [editPayError, setEditPayError] = useState<string | null>(null);
  const startEditPayment = (p: MysInvoicePayment) => {
    setEditingPaymentId(p.id);
    setEditPayAmount(String(p.amount));
    setEditPayDate(p.paid_date);
    setEditPayNotes(p.notes ?? "");
    setEditPayError(null);
  };
  const closeEditPayment = () => {
    setEditingPaymentId(null);
    setEditPayError(null);
  };
  const doSaveEditPayment = async (paymentId: string) => {
    setEditPayError(null);
    setEditPaySaving(true);
    try {
      const fd = new FormData();
      fd.set("amount", editPayAmount);
      fd.set("paid_date", editPayDate);
      fd.set("notes", editPayNotes);
      const result = await updateMysInvoicePayment(paymentId, fd);
      if (result?.error) {
        setEditPayError(result.error);
        return;
      }
      closeEditPayment();
      router.refresh();
    } catch (e) {
      setEditPayError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setEditPaySaving(false);
    }
  };

  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [deletePaymentError, setDeletePaymentError] = useState<string | null>(null);
  const [pendingDeletePaymentId, setPendingDeletePaymentId] = useState<string | null>(null);
  const doDeletePayment = async (paymentId: string) => {
    setDeletePaymentError(null);
    setDeletingPaymentId(paymentId);
    try {
      const result = await deleteMysInvoicePayment(paymentId);
      if (result?.error) {
        setDeletePaymentError(result.error);
        return;
      }
      router.refresh();
    } catch (e) {
      setDeletePaymentError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setDeletingPaymentId(null);
    }
  };

  // --- Inline edit for a "charge" (real boat expense) or "ad_hoc" debt
  // row, shared between both kinds since they edit the same three fields.
  // Saving writes straight to the underlying record (the boat's own
  // expenses row, or mys_ad_hoc_charges) - see updateMysDebtCharge/
  // updateMysAdHocCharge, src/lib/actions/mys.ts. ---
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editRowDescription, setEditRowDescription] = useState("");
  const [editRowAmount, setEditRowAmount] = useState("");
  const [editRowDate, setEditRowDate] = useState("");
  const [editRowSaving, setEditRowSaving] = useState(false);
  const [editRowError, setEditRowError] = useState<string | null>(null);
  const startEditRow = (r: DebtRow) => {
    setEditingRowKey(rowKey(r));
    setEditRowDescription(r.label);
    setEditRowAmount(String(r.amount));
    setEditRowDate(r.date ?? "");
    setEditRowError(null);
  };
  const closeEditRow = () => {
    setEditingRowKey(null);
    setEditRowError(null);
    setNewAdHocFiles([]);
  };

  // --- The invoice(s) she issued the client for an "ad_hoc" row, uploaded
  // from inside the same edit panel above. Newly-picked files are staged
  // here (not yet saved) until doSaveEditRow sends their paths along with
  // the rest of the edit; existing ones (r.attachments, refreshed via
  // adHocChargesById off the `adHocCharges` prop - no stale-snapshot issue
  // since this edit form reads straight from that prop every render) are
  // removed immediately via removeMysAdHocChargeAttachment. ---
  const adHocFileRef = useRef<HTMLInputElement>(null);
  const [newAdHocFiles, setNewAdHocFiles] = useState<{ path: string; name: string }[]>([]);
  const [uploadingAdHocFile, setUploadingAdHocFile] = useState(false);
  const [adHocUploadError, setAdHocUploadError] = useState<string | null>(null);
  const [pendingRemoveAdHocAttachment, setPendingRemoveAdHocAttachment] = useState<{ id: string; path: string } | null>(null);
  const onAdHocInvoiceFile = async (file: File | undefined) => {
    if (!file) return;
    setAdHocUploadError(null);
    let toUpload: File;
    try {
      toUpload = file.type.startsWith("image/") ? await compressImageToLimit(file, MAX_UPLOAD_FILE_BYTES) : file;
    } catch (e) {
      setAdHocUploadError(e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      return;
    }
    if (toUpload.size > MAX_UPLOAD_FILE_BYTES) {
      setAdHocUploadError(t("doc_file_too_large"));
      return;
    }
    setUploadingAdHocFile(true);
    try {
      const { path, token } = await createMysAdHocChargeUploadUrl(toUpload.name);
      const supabase = createClient();
      const { error } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, toUpload);
      if (error) throw error;
      setNewAdHocFiles((prev) => [...prev, { path, name: toUpload.name }]);
    } catch (e) {
      setAdHocUploadError(e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      setUploadingAdHocFile(false);
    }
  };
  const { dragging: adHocFileDragging, dropHandlers: adHocFileDropHandlers } = useMultiFileDrop(async (files) => {
    for (const file of files) await onAdHocInvoiceFile(file);
  });
  const removeNewAdHocFile = (index: number) => setNewAdHocFiles((prev) => prev.filter((_, i) => i !== index));
  const doRemoveAdHocAttachment = async () => {
    if (!pendingRemoveAdHocAttachment) return;
    await removeMysAdHocChargeAttachment(pendingRemoveAdHocAttachment.id, pendingRemoveAdHocAttachment.path);
    setPendingRemoveAdHocAttachment(null);
    router.refresh();
  };

  const doSaveEditRow = async (r: DebtRow) => {
    setEditRowError(null);
    setEditRowSaving(true);
    try {
      const fd = new FormData();
      fd.set("description", editRowDescription);
      fd.set("amount", editRowAmount);
      fd.set("date", editRowDate);
      if (r.kind === "charge") await updateMysDebtCharge(r.boatId, r.id, fd);
      else if (r.kind === "ad_hoc") {
        for (const f of newAdHocFiles) fd.append("attachment_paths", f.path);
        await updateMysAdHocCharge(r.id, fd);
      }
      closeEditRow();
      router.refresh();
    } catch (e) {
      setEditRowError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setEditRowSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_outstanding_debts")}</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAdHocForm((s) => !s)}
            className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
          >
            {showAdHocForm ? (
              <span className="inline-flex items-center gap-1">
                <X size={14} /> {t("close_word")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Plus size={14} /> {t("mys_add_ad_hoc_charge")}
              </span>
            )}
          </button>
        </div>
      </div>

      {showAdHocForm && (
        <form action={doCreateAdHoc} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_ad_hoc_client_name")} *</label>
            <CustomSelect
              name="client_name"
              value={adHocClientName}
              onChange={(v) => {
                if (v === NEW_CLIENT_OPTION_VALUE) {
                  setShowAddClientForm(true);
                  return;
                }
                setAdHocClientName(v);
              }}
              options={[
                { value: NEW_CLIENT_OPTION_VALUE, label: t("mys_new_client_option") },
                ...clientNames.map((name) => ({ value: name, label: name })),
              ]}
              placeholder={t("mys_client_select_placeholder")}
              emphasizeEmpty
              className={INPUT_CLASS}
            />
            {adHocClientIsBoat && <p className="text-2xs text-fleet-ink">{t("mys_ad_hoc_charge_boat_hint")}</p>}
            {showAddClientForm && (
              <div className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-white p-2.5">
                <input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder={t("mys_client_name_label")}
                  className={INPUT_CLASS}
                />
                {addClientError && <p className="text-xs text-fleet-coral-text">{addClientError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingClient || !newClientName.trim()}
                    onClick={async () => {
                      const fd = new FormData();
                      fd.set("name", newClientName.trim());
                      await doAddClient(fd);
                      setAdHocClientName(newClientName.trim());
                    }}
                    className={`px-4 py-1.5 text-xs ${PRIMARY_BUTTON_CLASS}`}
                  >
                    {savingClient ? t("saving_word") : t("mys_add_client")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddClientForm(false);
                      setNewClientName("");
                      setAddClientError(null);
                    }}
                    className={`px-4 py-1.5 text-xs ${SECONDARY_BUTTON_CLASS}`}
                  >
                    {t("close_word")}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("description")} *</label>
            <input name="description" required className={INPUT_CLASS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("amount")} *</label>
              <input name="amount" type="number" step="0.01" required onWheel={(e) => e.currentTarget.blur()} className={INPUT_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("date")}</label>
              <DateInput name="charge_date" value={chargeDate} onChange={setChargeDate} locale={locale} className={INPUT_CLASS} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
            <textarea name="notes" rows={2} className={INPUT_CLASS} />
          </div>
          {adHocError && <p className="text-xs text-fleet-coral-text">{adHocError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAdHocForm(false)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button type="submit" disabled={savingAdHoc} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
              {savingAdHoc ? t("saving_word") : t("mys_add_ad_hoc_charge")}
            </button>
          </div>
        </form>
      )}

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_placeholder")}
          className="w-full rounded-lg border border-fleet-border bg-white py-2 ps-9 pe-3 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <CustomSelect
          value={sortBy}
          onChange={(v) => setSortBy(v as SortBy)}
          options={[
            { value: "date_desc", label: `${t("mys_sort_label")}: ${t("mys_sort_date_desc")}` },
            { value: "date_asc", label: `${t("mys_sort_label")}: ${t("mys_sort_date_asc")}` },
            { value: "client", label: `${t("mys_sort_label")}: ${t("mys_client_label")}` },
            { value: "amount", label: `${t("mys_sort_label")}: ${t("amount")}` },
          ]}
          className={`w-fit ${INPUT_CLASS}`}
        />
      </div>

      {totalsByClient.length > 1 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {totalsByClient.map(([name, amount]) => (
            <button
              key={name}
              type="button"
              onClick={() => setBoatFilter((prev) => (prev === name ? "" : name))}
              className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-start transition ${
                boatFilter === name
                  ? "border-fleet-navy bg-fleet-navy text-fleet-paper"
                  : "border-fleet-border bg-white text-fleet-navy hover:border-fleet-navy/40"
              }`}
            >
              <span className={`truncate text-xs font-medium ${boatFilter === name ? "text-fleet-paper/70" : "text-fleet-ink"}`}>{name}</span>
              <span className="text-sm font-bold">{formatCurrency(amount)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 rounded-xl border border-fleet-border bg-white p-4 text-sm font-bold text-fleet-navy">
        <span>
          {t("total")}: {formatCurrency(total)}
        </span>
        {/* Only shown once she's filtered down to one specific client
            (clicked their tile above) - a real fleet boat, not an ad-hoc/
            commission client with no statement page to link to. */}
        {boatFilter && boatIdByName.get(boatFilter) && (
          <Link
            href={`/mys/debts/statement/${boatIdByName.get(boatFilter)}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:border-fleet-navy/40"
          >
            <Scale size={14} /> {t("mys_statement_cta")}
          </Link>
        )}
      </div>

      <button
        type="button"
        onClick={toggleSelectMode}
        className={`flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
          selectMode ? "border-fleet-teal text-fleet-teal" : "border-fleet-border text-fleet-navy"
        }`}
      >
        <ListChecks size={14} /> {selectMode ? t("close_word") : t("select_from_list_cta")}
      </button>

      {voidError && (
        <div className="flex items-center gap-2 rounded-lg border border-fleet-coral bg-fleet-coral/10 px-3 py-2 text-xs text-fleet-coral-text">
          <span className="flex-1">{voidError}</span>
          <button type="button" onClick={() => setVoidError(null)} aria-label="dismiss" className="shrink-0 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {selectedRows.length > 0 && !showInvoicePanel && (
        <button
          type="button"
          onClick={() => setShowInvoicePanel(true)}
          className="flex w-fit items-center gap-1.5 rounded-full bg-fleet-teal px-3.5 py-2 text-xs font-bold text-white hover:opacity-90"
        >
          <FileText size={14} /> {t("mys_issue_invoice_cta")} ({selectedRows.length})
        </button>
      )}
      {showInvoicePanel && selectedRows.length > 0 && (
        <MysInvoiceFromDebtsForm
          rows={invoiceFormRows}
          clientEmailByName={clientEmailByName}
          locale={locale}
          onClose={() => setShowInvoicePanel(false)}
          onDone={() => {
            setSelectedKeys(new Set());
            setShowInvoicePanel(false);
            router.refresh();
          }}
        />
      )}

      {sortedFilteredRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_debts")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedFilteredRows.map((r) => {
            // A supplier commission is money owed to her by a supplier, not
            // a client/boat debt she could ever bill onto an MYS invoice -
            // excluded from selection the same way an already-invoiced row
            // is. A fully-settled charge/ad-hoc row has nothing left to
            // bill either.
            const selectable = r.kind !== "invoice" && r.kind !== "commission" && !r.isSettled;
            const disabledByClientLock = selectable && lockedClientName !== null && r.boatName !== lockedClientName;
            const inv = r.kind === "invoice" ? invoicesById.get(r.id) : undefined;
            const comm = r.kind === "commission" ? commissionsById.get(r.id) : undefined;
            const isEditingCommission = r.kind === "commission" && editingCommissionId === r.id;
            const isEditingInvoice = r.kind === "invoice" && editingInvoiceId === r.id;
            const isPayingInvoice = r.kind === "invoice" && payingInvoiceId === r.id;
            const isEditingRow = (r.kind === "charge" || r.kind === "ad_hoc") && editingRowKey === rowKey(r);
            const isPayingDebt = (r.kind === "charge" || r.kind === "ad_hoc") && payingDebtRow?.kind === r.kind && payingDebtRow.id === r.id;
            const isPayingCommission = r.kind === "commission" && payingCommissionId === r.id;
            const paidSoFar =
              r.kind === "charge"
                ? chargesById.get(r.id)?.paidSoFar
                : r.kind === "ad_hoc"
                  ? adHocChargesById.get(r.id)?.paidSoFar
                  : r.kind === "commission"
                    ? commissionsById.get(r.id)?.paidSoFar
                    : undefined;
            const settlements =
              r.kind === "charge"
                ? (chargesById.get(r.id)?.settlements ?? [])
                : r.kind === "ad_hoc"
                  ? (adHocChargesById.get(r.id)?.settlements ?? [])
                  : [];
            const isExpanded = expandedDebtKey === rowKey(r);
            return (
            <div key={`${r.kind}-${r.id}`} className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3">
              {isEditingRow ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("description")}</label>
                    <input value={editRowDescription} onChange={(e) => setEditRowDescription(e.target.value)} className={INPUT_CLASS} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("amount")}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editRowAmount}
                        onChange={(e) => setEditRowAmount(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("date")}</label>
                      <DateInput value={editRowDate} onChange={setEditRowDate} locale={locale} className={INPUT_CLASS} allowClear />
                    </div>
                  </div>
                  {r.kind === "ad_hoc" && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_adhoc_invoice_file_label")}</label>
                      <input
                        ref={adHocFileRef}
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []);
                          for (const file of files) await onAdHocInvoiceFile(file);
                          if (adHocFileRef.current) adHocFileRef.current.value = "";
                        }}
                      />
                      <UploadButton
                        onClick={() => adHocFileRef.current?.click()}
                        dropHandlers={adHocFileDropHandlers}
                        dragging={adHocFileDragging}
                        busy={uploadingAdHocFile}
                        done={newAdHocFiles.length > 0 || (adHocChargesById.get(r.id)?.attachments.length ?? 0) > 0}
                        icon={<FileText size={16} />}
                        label={t("mys_upload_adhoc_invoice_cta")}
                        busyLabel={t("uploading_word")}
                        doneLabel={t("add_another_file")}
                      />
                      {adHocUploadError && <p className="text-xs text-fleet-coral-text">{adHocUploadError}</p>}
                      {(adHocChargesById.get(r.id)?.attachments.length ?? 0) > 0 && (
                        <div className="flex flex-col gap-1">
                          {adHocChargesById.get(r.id)!.attachments.map((a) => (
                            <FileChip
                              key={a.id}
                              icon={<FileText size={14} className="shrink-0" />}
                              name={t("mys_adhoc_invoice_file_label")}
                              href={a.url}
                              onRemove={() => setPendingRemoveAdHocAttachment({ id: a.id, path: a.path })}
                              removeLabel={t("remove_word")}
                            />
                          ))}
                        </div>
                      )}
                      {newAdHocFiles.map((f, i) => (
                        <FileChip
                          key={f.path}
                          icon={<FileText size={14} className="shrink-0" />}
                          name={f.name}
                          onRemove={() => removeNewAdHocFile(i)}
                          removeLabel={t("remove_word")}
                        />
                      ))}
                    </div>
                  )}
                  {editRowError && <p className="text-xs text-fleet-coral-text">{editRowError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={closeEditRow} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                      {t("close_word")}
                    </button>
                    <button
                      type="button"
                      disabled={editRowSaving}
                      onClick={() => doSaveEditRow(r)}
                      className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                    >
                      {editRowSaving ? t("saving_word") : t("save_edit")}
                    </button>
                  </div>
                </div>
              ) : isEditingInvoice && inv ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_ad_hoc_client_name")}</label>
                    <input value={editClientName} onChange={(e) => setEditClientName(e.target.value)} className={INPUT_CLASS} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
                    <input value={editClientEmail} onChange={(e) => setEditClientEmail(e.target.value)} type="email" className={INPUT_CLASS} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_client_company_details_label")}</label>
                    <textarea
                      value={editClientCompanyDetails}
                      onChange={(e) => setEditClientCompanyDetails(e.target.value)}
                      placeholder={t("mys_client_company_details_placeholder")}
                      rows={3}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("description")}</label>
                    <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className={INPUT_CLASS} />
                  </div>
                  {inv.lines.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_edit_lines_label")}</label>
                      {/* Mirrors the generated invoice document's own table +
                          summary block layout (src/app/(app)/mys/invoices/[id]/page.tsx)
                          so the edit view reads like the real invoice, just with
                          inputs in place of static text. */}
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-fleet-paper">
                            <th className="rounded-s-lg px-2 py-1.5 text-start font-semibold text-fleet-ink">{t("description")}</th>
                            <th className="px-2 py-1.5 text-end font-semibold text-fleet-ink">{t("amount")}</th>
                            <th className="px-2 py-1.5 text-end font-semibold text-fleet-ink">{t("mys_vat_amount_label")}</th>
                            <th className="rounded-e-lg px-1 py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {editLines.map((l) => {
                            const hasVat = (Number(l.vat_percent) || 0) > 0;
                            return (
                              <tr key={l.id}>
                                <td className="border-b border-dotted border-fleet-border px-2 py-1.5">
                                  <input
                                    value={l.description}
                                    onChange={(e) => setEditLineField(l.id, "description", e.target.value)}
                                    className={`w-full ${INPUT_CLASS_INLINE}`}
                                  />
                                </td>
                                <td className="border-b border-dotted border-fleet-border px-2 py-1.5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={l.amount}
                                    onChange={(e) => setEditLineField(l.id, "amount", e.target.value)}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className={`w-24 text-end ${INPUT_CLASS_INLINE}`}
                                  />
                                </td>
                                <td className="border-b border-dotted border-fleet-border px-2 py-1.5 text-end">
                                  {hasVat ? (
                                    <button
                                      type="button"
                                      onClick={() => setEditLineField(l.id, "vat_percent", "0")}
                                      title={t("mys_remove_vat_cta")}
                                      className="inline-flex items-center gap-1 rounded-full bg-fleet-teal/10 px-2 py-1 text-2xs font-bold text-fleet-teal hover:bg-fleet-teal/20"
                                    >
                                      {l.vat_percent}% <X size={11} />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setEditLineField(l.id, "vat_percent", "24")}
                                      title={t("mys_add_vat_cta")}
                                      className="inline-flex items-center gap-1 rounded-full border border-fleet-border px-2 py-1 text-2xs font-bold text-fleet-ink hover:bg-fleet-paper"
                                    >
                                      <Plus size={11} /> 24%
                                    </button>
                                  )}
                                </td>
                                <td className="border-b border-dotted border-fleet-border px-1 py-1.5 text-end">
                                  <button
                                    type="button"
                                    disabled={removingLineId === l.id}
                                    onClick={() => setPendingRemoveLineId(l.id)}
                                    aria-label={t("mys_remove_invoice_line_cta")}
                                    title={t("mys_remove_invoice_line_cta")}
                                    className="flex h-7 w-7 items-center justify-center text-fleet-ink hover:text-fleet-coral-text disabled:opacity-40"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {removeLineError && <p className="text-xs text-fleet-coral-text">{removeLineError}</p>}
                      {(() => {
                        const linesSubtotal = round2(editLines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
                        const linesVat = round2(
                          editLines.reduce((s, l) => s + round2((Number(l.amount) || 0) * ((Number(l.vat_percent) || 0) / 100)), 0)
                        );
                        return (
                          <div className="flex flex-col gap-1 self-end text-xs">
                            <div className="flex justify-between gap-6">
                              <span className="text-fleet-ink">{t("mys_invoice_subtotal_label")}</span>
                              <span>{formatCurrency(linesSubtotal)}</span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span className="text-fleet-ink">{t("mys_vat_amount_label")}</span>
                              <span>{formatCurrency(linesVat)}</span>
                            </div>
                            <div className="flex justify-between gap-6 border-t border-fleet-border pt-1 font-bold text-fleet-navy">
                              <span>{t("mys_invoice_total_label")}</span>
                              <span>{formatCurrency(round2(linesSubtotal + linesVat))}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {inv.lines.length === 0 ? (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-fleet-ink">{t("amount")}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-fleet-ink">{t("mys_vat_amount_label")}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editVatAmount}
                            onChange={(e) => setEditVatAmount(e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={INPUT_CLASS}
                          />
                        </div>
                      </>
                    ) : null}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_due_date")}</label>
                      <DateInput value={editDueDate} onChange={setEditDueDate} locale={locale} className={INPUT_CLASS} allowClear />
                    </div>
                  </div>
                  {inv.payments.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_payments_label")}</label>
                      <div className="flex flex-col gap-1.5">
                        {inv.payments.map((p) =>
                          editingPaymentId === p.id ? (
                            <div key={p.id} className="flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-2xs text-fleet-ink">{t("amount")}</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editPayAmount}
                                    onChange={(e) => setEditPayAmount(e.target.value)}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className={INPUT_CLASS}
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-2xs text-fleet-ink">{t("date")}</label>
                                  <DateInput value={editPayDate} onChange={setEditPayDate} locale={locale} className={INPUT_CLASS} />
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-2xs text-fleet-ink">{t("new_expense_notes")}</label>
                                <input value={editPayNotes} onChange={(e) => setEditPayNotes(e.target.value)} className={INPUT_CLASS} />
                              </div>
                              {editPayError && <p className="text-xs text-fleet-coral-text">{editPayError}</p>}
                              <div className="flex gap-2">
                                <button type="button" onClick={closeEditPayment} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                                  {t("close_word")}
                                </button>
                                <button
                                  type="button"
                                  disabled={editPaySaving}
                                  onClick={() => doSaveEditPayment(p.id)}
                                  className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                                >
                                  {editPaySaving ? t("saving_word") : t("save_edit")}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs">
                              <div className="flex min-w-0 flex-col">
                                <span dir="ltr" className="font-medium text-fleet-navy">
                                  {formatCurrency(p.amount)}
                                </span>
                                <span dir="ltr" className="truncate text-fleet-ink">
                                  {formatDateDisplay(p.paid_date)}
                                  {p.notes ? ` · ${p.notes}` : ""}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => startEditPayment(p)}
                                  aria-label={t("update_word")}
                                  title={t("update_word")}
                                  className="flex h-7 w-7 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingPaymentId === p.id}
                                  onClick={() => setPendingDeletePaymentId(p.id)}
                                  aria-label={t("delete_word")}
                                  title={t("delete_word")}
                                  className="flex h-7 w-7 items-center justify-center text-fleet-ink hover:text-fleet-coral-text disabled:opacity-40"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                      {deletePaymentError && <p className="text-xs text-fleet-coral-text">{deletePaymentError}</p>}
                    </div>
                  )}
                  {editError && <p className="text-xs text-fleet-coral-text">{editError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={closeEditInvoice} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                      {t("close_word")}
                    </button>
                    <button
                      type="button"
                      disabled={editSaving}
                      onClick={() => doSaveEditInvoice(inv.id)}
                      className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                    >
                      {editSaving ? t("saving_word") : t("save_edit")}
                    </button>
                  </div>
                </div>
              ) : isEditingCommission ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_supplier_label")}</label>
                    <input value={editCommSupplierName} onChange={(e) => setEditCommSupplierName(e.target.value)} className={INPUT_CLASS} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_supplier_invoice_amount_label")}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editCommInvoiceAmount}
                        onChange={(e) => setEditCommInvoiceAmount(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_supplier_invoice_date_label")}</label>
                      <DateInput value={editCommInvoiceDate} onChange={setEditCommInvoiceDate} locale={locale} className={INPUT_CLASS} allowClear />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_commission_label")}</label>
                    <div className="flex gap-1 rounded-full bg-fleet-paper p-1 text-2xs font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setEditCommPercentValue(String(editCommPreviewPercent));
                          setEditCommPricingMode("percent");
                        }}
                        className={`flex-1 rounded-full px-2 py-1 ${editCommPricingMode === "percent" ? "bg-white text-fleet-navy shadow-sm" : "text-fleet-ink"}`}
                      >
                        {t("mys_pricing_mode_percent")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditCommAmountValue(String(editCommPreviewAmount));
                          setEditCommPricingMode("amount");
                        }}
                        className={`flex-1 rounded-full px-2 py-1 ${editCommPricingMode === "amount" ? "bg-white text-fleet-navy shadow-sm" : "text-fleet-ink"}`}
                      >
                        {t("mys_pricing_mode_price")}
                      </button>
                    </div>
                    {editCommPricingMode === "percent" ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editCommPercentValue}
                        onChange={(e) => setEditCommPercentValue(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="%"
                        className={INPUT_CLASS}
                      />
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={editCommAmountValue}
                        onChange={(e) => setEditCommAmountValue(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={INPUT_CLASS}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_vat_amount_label")}</label>
                    {editCommVatEnabled ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={editCommVatPercentValue}
                          onChange={(e) => setEditCommVatPercentValue(e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          className={INPUT_CLASS}
                        />
                        <button
                          type="button"
                          onClick={() => setEditCommVatEnabled(false)}
                          title={t("mys_remove_vat_cta")}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fleet-ink hover:text-fleet-coral-text"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditCommVatEnabled(true)}
                        className="inline-flex w-fit items-center gap-1 rounded-full border border-fleet-border px-2 py-1 text-2xs font-bold text-fleet-ink hover:bg-fleet-paper"
                      >
                        <Plus size={11} /> {t("mys_add_vat_cta")}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg bg-fleet-paper p-3 text-xs">
                    <div className="flex justify-between gap-6">
                      <span className="text-fleet-ink">{t("mys_commission_amount_label")}</span>
                      <span>{formatCurrency(editCommPreviewAmount)}</span>
                    </div>
                    {editCommVatEnabled && (
                      <div className="flex justify-between gap-6">
                        <span className="text-fleet-ink">{t("mys_vat_amount_label")}</span>
                        <span>{formatCurrency(editCommPreviewVat)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-6 border-t border-fleet-border pt-1 font-bold text-fleet-navy">
                      <span>{t("mys_invoice_total_label")}</span>
                      <span>{formatCurrency(editCommPreviewTotal)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_commission_invoice_label")}</label>
                    <UploadButton
                      onClick={() => document.getElementById(`comm-invoice-input-${r.id}`)?.click()}
                      dropHandlers={commInvoiceDropHandlers}
                      dragging={commInvoiceDragging}
                      busy={editCommUploading}
                      done={editCommInvoicePath != null}
                      icon={<FileText size={16} />}
                      label={t("mys_upload_commission_invoice_cta")}
                      busyLabel={t("uploading_word")}
                      doneLabel={t("add_another_file")}
                    />
                    <input
                      id={`comm-invoice-input-${r.id}`}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        onCommInvoiceFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    {editCommUploadError && <p className="text-xs text-fleet-coral-text">{editCommUploadError}</p>}
                    {editCommInvoicePath && (
                      <FileChip
                        icon={<FileText size={14} className="shrink-0" />}
                        name={editCommInvoiceName ?? t("mys_commission_invoice_label")}
                        href={editCommInvoiceUrl ?? undefined}
                        onRemove={clearCommInvoiceFile}
                        removeLabel={t("remove_word")}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
                    <textarea value={editCommNotes} onChange={(e) => setEditCommNotes(e.target.value)} rows={2} className={INPUT_CLASS} />
                  </div>
                  {editCommError && <p className="text-xs text-fleet-coral-text">{editCommError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={closeEditCommission} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                      {t("close_word")}
                    </button>
                    <button type="button" disabled={editCommSaving} onClick={doSaveEditCommission} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
                      {editCommSaving ? t("saving_word") : t("save_edit")}
                    </button>
                  </div>
                </div>
              ) : (
              <div className="flex flex-nowrap items-center gap-3">
              {selectable && selectMode && (
                <input
                  type="checkbox"
                  checked={selectedKeys.has(rowKey(r))}
                  disabled={disabledByClientLock}
                  onChange={() => toggleSelected(r)}
                  aria-label={t("select_row_word")}
                  title={disabledByClientLock ? t("mys_invoice_different_client_hint") : undefined}
                  className="h-4 w-4 shrink-0 rounded border-fleet-border disabled:opacity-40"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{r.label}</div>
                <div className="truncate text-xs text-fleet-ink">
                  {r.boatName}
                  {r.date && (
                    <>
                      {" · "}
                      <span dir="ltr">{formatDateDisplay(r.date)}</span>
                    </>
                  )}
                </div>
                {paidSoFar != null && paidSoFar > 0 && (
                  <div className="truncate text-2xs text-fleet-moss-text">{t("mys_invoice_paid_so_far", { amount: formatCurrency(paidSoFar) })}</div>
                )}
              </div>
              <div className="shrink-0 text-sm font-bold text-fleet-navy">{formatCurrency(r.amount)}</div>
              {(r.kind === "charge" || r.kind === "ad_hoc") && settlements.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpandedDebtKey((k) => (k === rowKey(r) ? null : rowKey(r)))}
                  aria-label={t("mys_view_settlements_cta")}
                  title={t("mys_view_settlements_cta")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              )}
              {r.kind === "charge" && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEditRow(r)}
                    aria-label={t("update_word")}
                    title={t("update_word")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                  >
                    <Pencil size={14} />
                  </button>
                  {!isPayingDebt &&
                    (r.isSettled ? (
                      <span className="rounded-full bg-fleet-moss/15 px-3 py-1.5 text-xs font-bold text-fleet-moss-text">
                        {t("mys_settlement_paid_label")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startDebtPayment(r)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                          (paidSoFar ?? 0) > 0
                            ? "bg-fleet-amber/15 text-fleet-amber-text hover:bg-fleet-amber/25"
                            : "bg-fleet-coral/15 text-fleet-coral-text hover:bg-fleet-coral/25"
                        }`}
                      >
                        {(paidSoFar ?? 0) > 0 ? t("mys_partially_paid_cta") : t("mys_record_payment_cta")}
                      </button>
                    ))}
                  <form action={deleteMysDebtCharge.bind(null, r.boatId, r.id, chargesById.get(r.id)?.receipt_path ?? null, chargesById.get(r.id)?.photo_path ?? null)}>
                    <ConfirmSubmitButton
                      locale={locale}
                      confirmMessage={t("mys_delete_debt_charge_confirm")}
                      ariaLabel={t("delete_word")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                    >
                      <Trash2 size={14} />
                    </ConfirmSubmitButton>
                  </form>
                </div>
              )}
              {r.kind === "ad_hoc" && (
                <div className="flex shrink-0 items-center gap-1">
                  {(adHocChargesById.get(r.id)?.attachments.length ?? 0) > 0 && (
                    <AttachmentGroup
                      compact
                      files={adHocChargesById.get(r.id)!.attachments}
                      icon={<FileText size={14} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                      label={t("mys_adhoc_invoice_file_label")}
                      onOpen={(url) => window.open(url, "_blank", "noopener,noreferrer")}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => startEditRow(r)}
                    aria-label={t("update_word")}
                    title={t("update_word")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                  >
                    <Pencil size={14} />
                  </button>
                  {!isPayingDebt &&
                    (r.isSettled ? (
                      <span className="rounded-full bg-fleet-moss/15 px-3 py-1.5 text-xs font-bold text-fleet-moss-text">
                        {t("mys_settlement_paid_label")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startDebtPayment(r)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                          (paidSoFar ?? 0) > 0
                            ? "bg-fleet-amber/15 text-fleet-amber-text hover:bg-fleet-amber/25"
                            : "bg-fleet-coral/15 text-fleet-coral-text hover:bg-fleet-coral/25"
                        }`}
                      >
                        {(paidSoFar ?? 0) > 0 ? t("mys_partially_paid_cta") : t("mys_record_payment_cta")}
                      </button>
                    ))}
                  <form action={deleteMysAdHocCharge.bind(null, r.id)}>
                    <ConfirmSubmitButton
                      locale={locale}
                      confirmMessage={t("mys_delete_ad_hoc_charge_confirm")}
                      ariaLabel={t("delete_word")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                    >
                      <Trash2 size={14} />
                    </ConfirmSubmitButton>
                  </form>
                </div>
              )}
              {r.kind === "commission" && comm && (
                <div className="flex shrink-0 items-center gap-1">
                  {comm.attachments.length > 0 && (
                    <AttachmentGroup
                      compact
                      files={comm.attachments}
                      icon={<Pin size={14} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                      label={t("mys_supplier_invoice_file_label")}
                      onOpen={(url) => window.open(url, "_blank", "noopener,noreferrer")}
                    />
                  )}
                  {comm.commission_invoice_url && (
                    <button
                      type="button"
                      onClick={() => window.open(comm.commission_invoice_url!, "_blank", "noopener,noreferrer")}
                      aria-label={t("mys_commission_invoice_label")}
                      title={t("mys_commission_invoice_label")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-teal hover:opacity-80"
                    >
                      <FileText size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEditCommission(comm)}
                    aria-label={t("update_word")}
                    title={t("update_word")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                  >
                    <Pencil size={14} />
                  </button>
                  {!isPayingCommission &&
                    (r.isSettled ? (
                      <span className="rounded-full bg-fleet-moss/15 px-3 py-1.5 text-xs font-bold text-fleet-moss-text">
                        {t("mys_settlement_paid_label")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startCommissionPayment(r.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                          (paidSoFar ?? 0) > 0
                            ? "bg-fleet-amber/15 text-fleet-amber-text hover:bg-fleet-amber/25"
                            : "bg-fleet-coral/15 text-fleet-coral-text hover:bg-fleet-coral/25"
                        }`}
                      >
                        {(paidSoFar ?? 0) > 0 ? t("mys_partially_paid_cta") : t("mys_record_payment_cta")}
                      </button>
                    ))}
                  <form action={deleteMysSupplierCommission.bind(null, r.id)}>
                    <ConfirmSubmitButton
                      locale={locale}
                      confirmMessage={t("mys_delete_commission_confirm")}
                      ariaLabel={t("delete_word")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                    >
                      <Trash2 size={14} />
                    </ConfirmSubmitButton>
                  </form>
                </div>
              )}
              {r.kind === "invoice" && inv && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEditInvoice(inv)}
                    aria-label={t("update_word")}
                    title={t("update_word")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                  >
                    <Pencil size={14} />
                  </button>
                  {(inv.status === "draft" || inv.status === "sent") && !isPayingInvoice && (
                    <button
                      type="button"
                      onClick={() => startPayment(inv)}
                      className="rounded-full bg-fleet-coral/15 px-3 py-1.5 text-xs font-bold text-fleet-coral-text hover:bg-fleet-coral/25"
                    >
                      {t("mys_record_payment_cta")}
                    </button>
                  )}
                  {(inv.status === "draft" || inv.status === "sent") && (
                    <button
                      type="button"
                      onClick={() => setPendingVoidId(inv.id)}
                      aria-label={t("mys_void_invoice")}
                      title={t("mys_void_invoice")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
              </div>
              )}
              {isPayingInvoice && inv && (
                <div className="flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("amount")}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("date")}</label>
                      <DateInput value={payDate} onChange={setPayDate} locale={locale} className={INPUT_CLASS} allowClear />
                    </div>
                  </div>
                  <input
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder={t("new_expense_notes")}
                    className={INPUT_CLASS}
                  />
                  {payError && <p className="text-xs text-fleet-coral-text">{payError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={closePayment} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                      {t("close_word")}
                    </button>
                    <button
                      type="button"
                      disabled={paySaving}
                      onClick={() => doSavePayment(inv.id)}
                      className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                    >
                      {paySaving ? t("saving_word") : t("mys_record_payment_cta")}
                    </button>
                  </div>
                </div>
              )}
              {isPayingDebt && (
                <div className="flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("amount")}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={debtPayAmount}
                        onChange={(e) => setDebtPayAmount(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("payment_method")}</label>
                      <CustomSelect
                        value={debtPayMethod}
                        onChange={(v) => setDebtPayMethod(v as PaymentMethod | "")}
                        options={[{ value: "", label: t("not_set_yet") }, ...PAYMENT_METHODS.map((k) => ({ value: k, label: paymentLabels[k] }))]}
                        placeholder={t("not_set_yet")}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("date")}</label>
                      <DateInput value={debtPayDate} onChange={setDebtPayDate} locale={locale} className={INPUT_CLASS} allowClear />
                    </div>
                  </div>
                  {payingDebtRow?.kind === "charge" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("category")}</label>
                      <CustomSelect
                        value={debtPayCategory}
                        onChange={(v) => setDebtPayCategory(v as ExpenseCategory | "")}
                        options={[
                          { value: "", label: t("not_set_yet") },
                          ...getExpenseCategories(
                            boatById.get(payingDebtRow.boatId ?? "")?.boat_type,
                            boatById.get(payingDebtRow.boatId ?? "")?.name,
                            locale
                          ).map((c) => ({ value: c, label: categoryLabels[c] })),
                        ]}
                        placeholder={t("not_set_yet")}
                        className={INPUT_CLASS}
                      />
                    </div>
                  )}
                  <input
                    value={debtPayNotes}
                    onChange={(e) => setDebtPayNotes(e.target.value)}
                    placeholder={t("new_expense_notes")}
                    className={INPUT_CLASS}
                  />
                  {debtPayError && <p className="text-xs text-fleet-coral-text">{debtPayError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={closeDebtPayment} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                      {t("close_word")}
                    </button>
                    <button type="button" disabled={debtPaySaving} onClick={doSaveDebtPayment} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
                      {debtPaySaving ? t("saving_word") : t("mys_record_payment_cta")}
                    </button>
                  </div>
                </div>
              )}
              {isPayingCommission && (
                <div className="flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("amount")}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={commPayAmount}
                        onChange={(e) => setCommPayAmount(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("payment_method")}</label>
                      <CustomSelect
                        value={commPayMethod}
                        onChange={(v) => setCommPayMethod(v as PaymentMethod | "")}
                        options={[{ value: "", label: t("not_set_yet") }, ...PAYMENT_METHODS.map((k) => ({ value: k, label: paymentLabels[k] }))]}
                        placeholder={t("not_set_yet")}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("date")}</label>
                      <DateInput value={commPayDate} onChange={setCommPayDate} locale={locale} className={INPUT_CLASS} allowClear />
                    </div>
                  </div>
                  {commPayError && <p className="text-xs text-fleet-coral-text">{commPayError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={closeCommissionPayment} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                      {t("close_word")}
                    </button>
                    <button type="button" disabled={commPaySaving} onClick={doSaveCommissionPayment} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
                      {commPaySaving ? t("saving_word") : t("mys_record_payment_cta")}
                    </button>
                  </div>
                </div>
              )}
              {isExpanded && (r.kind === "charge" || r.kind === "ad_hoc") && (
                <div className="flex flex-col gap-1.5 border-t border-fleet-border pt-2">
                  {settlements.map((s) =>
                    editingSettlementId === s.id ? (
                      <div key={s.id} className="flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-2xs text-fleet-ink">{t("amount")}</label>
                            <input
                              type="number"
                              step="0.01"
                              value={editSettleAmount}
                              onChange={(e) => setEditSettleAmount(e.target.value)}
                              onWheel={(e) => e.currentTarget.blur()}
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-2xs text-fleet-ink">{t("payment_method")}</label>
                            <CustomSelect
                              value={editSettleMethod}
                              onChange={(v) => setEditSettleMethod(v as PaymentMethod | "")}
                              options={[{ value: "", label: t("not_set_yet") }, ...PAYMENT_METHODS.map((k) => ({ value: k, label: paymentLabels[k] }))]}
                              placeholder={t("not_set_yet")}
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-2xs text-fleet-ink">{t("date")}</label>
                            <DateInput value={editSettleDate} onChange={setEditSettleDate} locale={locale} className={INPUT_CLASS} allowClear />
                          </div>
                        </div>
                        <input
                          value={editSettleNotes}
                          onChange={(e) => setEditSettleNotes(e.target.value)}
                          placeholder={t("new_expense_notes")}
                          className={INPUT_CLASS}
                        />
                        {editSettleError && <p className="text-xs text-fleet-coral-text">{editSettleError}</p>}
                        <div className="flex gap-2">
                          <button type="button" onClick={closeEditSettlement} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                            {t("close_word")}
                          </button>
                          <button
                            type="button"
                            disabled={editSettleSaving}
                            onClick={() => doSaveEditSettlement(r)}
                            className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                          >
                            {editSettleSaving ? t("saving_word") : t("save_edit")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={s.id}
                        className="flex flex-nowrap items-center gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-2.5 py-1.5 text-xs"
                      >
                        <span dir="ltr" className="shrink-0 text-fleet-ink">
                          {formatDateDisplay(s.paid_date)}
                        </span>
                        <span className="shrink-0 font-bold text-fleet-navy">{formatCurrency(s.amount)}</span>
                        {s.payment_method && <span className="shrink-0 text-fleet-ink">{paymentLabels[s.payment_method]}</span>}
                        {s.notes && <span className="min-w-0 flex-1 truncate text-fleet-ink">{s.notes}</span>}
                        <button
                          type="button"
                          onClick={() => startEditSettlement(s)}
                          aria-label={t("update_word")}
                          title={t("update_word")}
                          className="ms-auto flex h-6 w-6 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteSettlement({ settlementId: s.id, kind: r.kind, targetId: r.id, boatId: r.boatId })}
                          aria-label={t("delete_word")}
                          title={t("delete_word")}
                          className="flex h-6 w-6 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )
                  )}
                  {!isPayingDebt && (
                    <button
                      type="button"
                      onClick={() => startDebtPayment(r)}
                      className="inline-flex w-fit items-center gap-1 self-start rounded-full px-3 py-1.5 text-xs font-semibold text-fleet-navy hover:bg-fleet-paper"
                    >
                      <Plus size={12} /> {t("mys_add_payment_cta")}
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {pendingVoidId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => !voiding && setPendingVoidId(null)}>
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-fleet-navy">{t("mys_void_invoice_confirm")}</p>
            {voidError && <p className="text-xs text-fleet-coral-text">{voidError}</p>}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={voiding}
                onClick={() => doVoid(pendingVoidId, "reopen")}
                className={`w-full ${PRIMARY_BUTTON_CLASS}`}
              >
                {voiding ? t("saving_word") : t("mys_void_reopen_cta")}
              </button>
              <button
                type="button"
                disabled={voiding}
                onClick={() => doVoid(pendingVoidId, "delete")}
                className="w-full rounded-full border border-fleet-coral px-4 py-2 text-sm font-semibold text-fleet-coral-text hover:bg-fleet-coral/10 disabled:opacity-60"
              >
                {voiding ? t("saving_word") : t("mys_void_delete_cta")}
              </button>
              <button type="button" disabled={voiding} onClick={() => setPendingVoidId(null)} className={`w-full ${SECONDARY_BUTTON_CLASS}`}>
                {t("close_word")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRemoveLineId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setPendingRemoveLineId(null)}>
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-fleet-navy">{t("mys_remove_invoice_line_confirm")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPendingRemoveLineId(null)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                {t("no_word")}
              </button>
              <button
                type="button"
                onClick={() => {
                  doRemoveLine(pendingRemoveLineId);
                  setPendingRemoveLineId(null);
                }}
                className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
              >
                {t("yes_word")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeletePaymentId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setPendingDeletePaymentId(null)}>
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-fleet-navy">{t("mys_delete_invoice_payment_confirm")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPendingDeletePaymentId(null)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                {t("no_word")}
              </button>
              <button
                type="button"
                onClick={() => {
                  doDeletePayment(pendingDeletePaymentId);
                  setPendingDeletePaymentId(null);
                }}
                className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
              >
                {t("yes_word")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteSettlement && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
          onClick={() => !deleteSettleSaving && setPendingDeleteSettlement(null)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-fleet-navy">{t("mys_delete_settlement_confirm")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={deleteSettleSaving}
                onClick={() => setPendingDeleteSettlement(null)}
                className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}
              >
                {t("no_word")}
              </button>
              <button type="button" disabled={deleteSettleSaving} onClick={doDeleteSettlement} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
                {deleteSettleSaving ? t("saving_word") : t("yes_word")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRemoveAdHocAttachment && (
        <ConfirmPopup
          message={t("mys_remove_attachment_confirm")}
          onConfirm={doRemoveAdHocAttachment}
          onCancel={() => setPendingRemoveAdHocAttachment(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
