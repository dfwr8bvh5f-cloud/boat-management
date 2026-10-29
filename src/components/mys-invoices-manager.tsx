"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import { Eye, GripVertical, Pencil, Plus, ReceiptEuro, Search, Trash2, X } from "lucide-react";
import {
  createMysInvoice,
  createMysClient,
  updateMysInvoice,
  updateMysInvoiceLine,
  addMysInvoiceLine,
  removeMysInvoiceLine,
  updateMysInvoiceFile,
  markMysInvoiceProforma,
  unmarkMysInvoiceProforma,
  markMysInvoiceSent,
  revertMysInvoiceToDraft,
  addMysInvoicePayment,
  voidMysInvoice,
  deleteMysInvoicePermanently,
} from "@/lib/actions/mys";
import { ConfirmPopup } from "@/components/confirm-popup";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { RippleLoader } from "@/components/ripple-loader";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { formatCurrency, round2 } from "@/lib/money";
import { getPaymentLabels, PAYMENT_METHODS } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysInvoice, MysInvoiceLine, MysInvoicePayment, MysInvoiceStatus, PaymentMethod } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SEARCH_INPUT_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

// Not-yet-paid (draft/sent) reads as red, paid as green - a clear at-a-
// glance owed/settled signal, confirmed over the earlier draft/sent/paid/
// void palette (draft=paper, sent=brass) which didn't distinguish "still
// owed" from "done" by color at all.
const STATUS_CLASSES: Record<MysInvoiceStatus, string> = {
  draft: "bg-fleet-coral/15 text-fleet-coral-text",
  sent: "bg-fleet-coral/15 text-fleet-coral-text",
  paid: "bg-fleet-moss/15 text-fleet-moss-text",
  void: "bg-fleet-coral/15 text-fleet-coral-text",
  // Neither owed nor settled - a distinct, neutral color from both, so it's
  // never mistaken for a real still-open (coral) or paid (moss) invoice.
  proforma: "bg-fleet-brass/15 text-fleet-brass",
};

// Which actions the status-menu popup offers, per current status - "draft"
// here means "revert to draft" (via unmarkMysInvoiceProforma for a
// proforma, revertMysInvoiceToDraft for a sent/paid one - see
// doStatusAction), "sent" means "convert to a real invoice"
// (markMysInvoiceSent). A status with no entries here (paid with payments
// still on it, void) keeps its pill a plain, non-clickable badge - nothing
// in this menu would succeed for it anyway.
const STATUS_MENU_ACTIONS: Record<MysInvoiceStatus, Array<"proforma" | "sent" | "draft" | "pay" | "void">> = {
  draft: ["proforma", "sent", "pay", "void"],
  sent: ["draft", "pay", "void"],
  paid: ["draft"],
  proforma: ["draft"],
  void: [],
};

type InvoiceWithExtras = MysInvoice & { lines: MysInvoiceLine[]; payments: MysInvoicePayment[]; invoiceUrl: string | null };

const NEW_CLIENT_OPTION_VALUE = "__new_client__";

type NewLineDraft = { description: string; quantity: string; unitPrice: string; vatPercent: string };
function newLineDraft(): NewLineDraft {
  return { description: "", quantity: "1", unitPrice: "", vatPercent: "" };
}
type EditLineDraft = { id: string; description: string; quantity: string; unitPrice: string; vatPercent: string };

// Shared by both the create form's newLines and the edit panel's
// editLines/editNewLines - a line's amount is always quantity*unit_price,
// purely for live client-side display; the real numbers are only ever
// recomputed and written server-side (createMysInvoice/updateMysInvoiceLine/
// addMysInvoiceLine).
function draftLineAmount(l: { quantity: string; unitPrice: string }) {
  return round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
}
function draftLineVat(l: { quantity: string; unitPrice: string; vatPercent: string }) {
  return round2(draftLineAmount(l) * ((Number(l.vatPercent) || 0) / 100));
}

// Marking an invoice paid and voiding it live on the Debts page's own
// invoice-row actions (MysDebtsManager) - editing its client/description/
// amount lives on both pages (updateMysInvoice, shared) since it's just as
// much about the document itself as the debt it represents. Refused once
// 'paid' (see updateMysInvoice) - a paid invoice's amount is money already
// reconciled as received, so the pencil is hidden for those rows here too.
export function MysInvoicesManager({
  invoices,
  clientNames,
  clientEmailByName,
  locale,
}: {
  invoices: InvoiceWithExtras[];
  // Same combined boats+ad-hoc-clients list every other MYS client picker
  // uses (fed by mys/invoices/page.tsx) - a picked name that matches a real
  // fleet boat is resolved back to its boat_id server-side (createMysInvoice),
  // so there's no separate "fleet boat" field to pick from here.
  clientNames: string[];
  // Known clients' saved emails (mys_clients.email, /mys/clients) - auto-
  // fills the email field below once the typed/picked client name matches
  // one, without overwriting anything she's already typed there herself.
  clientEmailByName: Record<string, string>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const statusLabels: Record<MysInvoiceStatus, string> = {
    draft: t("mys_invoice_status_draft"),
    sent: t("mys_invoice_status_sent"),
    paid: t("mys_invoice_status_paid"),
    void: t("mys_invoice_status_void"),
    proforma: t("mys_invoice_status_proforma"),
  };

  const [showForm, setShowForm] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [newLines, setNewLines] = useState<NewLineDraft[]>([newLineDraft()]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showAddClientForm, setShowAddClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);

  const closeForm = () => {
    setShowForm(false);
    setClientName("");
    setClientEmail("");
    setInvoiceTitle("");
    setDueDate("");
    setNewLines([newLineDraft()]);
    setSaveError(null);
    setShowAddClientForm(false);
    setNewClientName("");
    setAddClientError(null);
  };

  // Auto-fills the email from a known client's saved record the moment its
  // name matches - only while she hasn't already typed an email herself, so
  // it never clobbers a manual entry.
  const setClientNameAndAutofillEmail = (name: string) => {
    setClientName(name);
    const knownEmail = clientEmailByName[name];
    if (knownEmail) setClientEmail((prev) => prev || knownEmail);
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

  const updateNewLine = (index: number, patch: Partial<NewLineDraft>) =>
    setNewLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const addNewLine = () => setNewLines((prev) => [...prev, newLineDraft()]);
  const removeNewLine = (index: number) => setNewLines((prev) => prev.filter((_, i) => i !== index));

  // Press-and-drag reordering by a dedicated handle (not the whole row, so
  // it never fights with selecting text in the fields next to it). Pointer
  // capture on the handle keeps move/up events firing on it even once the
  // finger/cursor has moved over a different row, so no document-level
  // listeners are needed. The array itself is reordered live as the
  // dragged row crosses another row's midpoint - draggingIndex always
  // tracks the dragged line's current position, not where it started.
  const linesContainerRef = useRef<HTMLDivElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragPointerId = useRef<number | null>(null);

  // Returns an insertion index in [0, rows.length] - rows.length itself
  // means "past every row's midpoint, belongs at the very end" (without
  // this, dropping below the last row's own midpoint could never actually
  // reach the last slot, only swap with that row).
  const rowIndexAtY = (y: number): number | null => {
    const container = linesContainerRef.current;
    if (!container) return null;
    const rows = Array.from(container.children) as HTMLElement[];
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return i;
    }
    return rows.length;
  };

  const startLineDrag = (e: React.PointerEvent<HTMLButtonElement>, index: number) => {
    e.preventDefault();
    dragPointerId.current = e.pointerId;
    setDraggingIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveLineDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragPointerId.current !== e.pointerId || draggingIndex === null) return;
    const rawTarget = rowIndexAtY(e.clientY);
    if (rawTarget === null) return;
    // rawTarget is computed against the row list that still includes the
    // dragged row at draggingIndex - moving it DOWN (rawTarget >
    // draggingIndex) means removing it first shifts every later index down
    // by one, so the real splice-insert index is rawTarget - 1.
    const target = rawTarget > draggingIndex ? rawTarget - 1 : rawTarget;
    if (target === draggingIndex) return;
    setNewLines((prev) => {
      const next = [...prev];
      const [moved] = next.splice(draggingIndex, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setDraggingIndex(target);
  };
  const endLineDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragPointerId.current === e.pointerId) dragPointerId.current = null;
    setDraggingIndex(null);
  };

  const newLinesSubtotal = round2(newLines.reduce((s, l) => s + draftLineAmount(l), 0));
  const newLinesVat = round2(newLines.reduce((s, l) => s + draftLineVat(l), 0));
  const newLinesTotal = round2(newLinesSubtotal + newLinesVat);

  const doSave = async () => {
    setSaveError(null);
    if (!clientName.trim()) {
      setSaveError(t("mys_client_required"));
      return;
    }
    setSaving(true);
    try {
      await createMysInvoice({
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || null,
        title: invoiceTitle,
        dueDate: dueDate || null,
        lines: newLines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          vatPercent: Number(l.vatPercent) || 0,
        })),
      });
      setSaving(false);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        closeForm();
      }, 1400);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
      setSaving(false);
    }
  };

  // --- Edit an existing invoice (client/description/due-date always;
  // amount/vat only for a lines-less, manually-typed invoice - see
  // updateMysInvoice). Never touches the attached file itself, and never
  // available once the invoice is 'paid' (updateMysInvoice refuses it
  // server-side too). Description starts at exactly inv.description,
  // whatever that already is - never re-derived from the line items. ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [editClientCompanyDetails, setEditClientCompanyDetails] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editVatAmount, setEditVatAmount] = useState("");
  // Existing lines (already saved, editable in place) and freshly-added
  // draft lines (no id yet, only created server-side on save) - see
  // doSaveEdit. Mirrors newLines' shape/behavior from the create form above.
  const [editLines, setEditLines] = useState<EditLineDraft[]>([]);
  const [editNewLines, setEditNewLines] = useState<NewLineDraft[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [editShowAddClientForm, setEditShowAddClientForm] = useState(false);
  const [editNewClientName, setEditNewClientName] = useState("");
  const [editAddClientError, setEditAddClientError] = useState<string | null>(null);
  const [editSavingClient, setEditSavingClient] = useState(false);

  const startEdit = (inv: InvoiceWithExtras) => {
    setEditingId(inv.id);
    setEditDescription(inv.description);
    setEditClientName(inv.client_name);
    setEditClientEmail(inv.client_email ?? "");
    setEditClientCompanyDetails(inv.client_company_details ?? "");
    setEditDueDate(inv.due_date ?? "");
    setEditAmount(String(inv.amount));
    setEditVatAmount(String(inv.vat_amount));
    setEditLines(
      inv.lines.map((l) => ({ id: l.id, description: l.description, quantity: String(l.quantity), unitPrice: String(l.unit_price), vatPercent: String(l.vat_percent) }))
    );
    setEditNewLines([]);
    setEditError(null);
    setEditShowAddClientForm(false);
    setEditNewClientName("");
    setEditAddClientError(null);
  };
  const closeEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  // Same "fill in only when blank" autofill as the create form's own
  // setClientNameAndAutofillEmail - never clobbers an email she already has
  // on the invoice or has already typed while editing.
  const setEditClientNameAndAutofillEmail = (name: string) => {
    setEditClientName(name);
    const knownEmail = clientEmailByName[name];
    if (knownEmail) setEditClientEmail((prev) => prev || knownEmail);
  };
  const doAddEditClient = async (formData: FormData) => {
    setEditAddClientError(null);
    setEditSavingClient(true);
    try {
      await createMysClient(formData);
      setEditShowAddClientForm(false);
      setEditNewClientName("");
    } catch (e) {
      setEditAddClientError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setEditSavingClient(false);
    }
  };

  const updateEditLine = (id: string, patch: Partial<Omit<EditLineDraft, "id">>) =>
    setEditLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  // Removing an already-saved line calls the server right away (it can
  // refuse - e.g. a payment already recorded - see removeMysInvoiceLine),
  // rather than only on final save, since it may also delete the whole
  // invoice outright if this was its last line. Gated to editLines.length >
  // 1 so that can never happen from here - down to the last saved line, she
  // has to add+save a replacement first.
  const removeEditLine = async (lineId: string) => {
    setEditError(null);
    try {
      const result = await removeMysInvoiceLine(lineId);
      if (result?.error) {
        setEditError(result.error);
        return;
      }
      setEditLines((prev) => prev.filter((l) => l.id !== lineId));
    } catch (e) {
      setEditError(e instanceof Error ? e.message : t("save_failed"));
    }
  };
  const updateEditNewLine = (index: number, patch: Partial<NewLineDraft>) =>
    setEditNewLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const addEditNewLine = () => setEditNewLines((prev) => [...prev, newLineDraft()]);
  const removeEditNewLine = (index: number) => setEditNewLines((prev) => prev.filter((_, i) => i !== index));

  const editLinesSubtotal = round2(
    editLines.reduce((s, l) => s + draftLineAmount(l), 0) + editNewLines.reduce((s, l) => s + draftLineAmount(l), 0)
  );
  const editLinesVat = round2(
    editLines.reduce((s, l) => s + draftLineVat(l), 0) + editNewLines.reduce((s, l) => s + draftLineVat(l), 0)
  );
  const editLinesTotal = round2(editLinesSubtotal + editLinesVat);

  const doSaveEdit = async (invoiceId: string) => {
    setEditError(null);
    setEditSaving(true);
    try {
      await Promise.all(
        editLines.map((l) => {
          const lineFd = new FormData();
          lineFd.set("description", l.description);
          lineFd.set("quantity", l.quantity);
          lineFd.set("unit_price", l.unitPrice);
          lineFd.set("vat_percent", l.vatPercent);
          return updateMysInvoiceLine(l.id, lineFd);
        })
      );
      await Promise.all(
        editNewLines
          .filter((l) => l.description.trim() && Number(l.quantity) > 0)
          .map((l) => {
            const lineFd = new FormData();
            lineFd.set("description", l.description);
            lineFd.set("quantity", l.quantity);
            lineFd.set("unit_price", l.unitPrice);
            lineFd.set("vat_percent", l.vatPercent);
            return addMysInvoiceLine(invoiceId, lineFd);
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
      const result = await updateMysInvoice(invoiceId, fd);
      if (result?.error) {
        setEditError(result.error);
        setEditSaving(false);
        return;
      }
      setEditSaving(false);
      setEditSaved(true);
      setTimeout(() => {
        setEditSaved(false);
        closeEdit();
      }, 1400);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : t("save_failed"));
      setEditSaving(false);
    }
  };

  // --- Remove the real invoice file issued by the accountant (invoice_path
  // only - see updateMysInvoiceFile). Attaching one from this list was
  // removed (per her request) - it only ever showed for a row with no file
  // yet, and read as confusing clutter next to the other row actions. ---
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const setFileError = (id: string, msg: string | null) =>
    setFileErrors((prev) => {
      const next = { ...prev };
      if (msg) next[id] = msg;
      else delete next[id];
      return next;
    });

  const removeInvoiceFile = async (invoiceId: string) => {
    setFileError(invoiceId, null);
    try {
      const fd = new FormData();
      fd.set("invoice_path", "");
      await updateMysInvoiceFile(invoiceId, fd);
    } catch (e) {
      setFileError(invoiceId, e instanceof Error ? e.message : t("save_failed"));
    }
  };

  // --- Permanently delete an invoice (never just void) - deleteMysInvoicePermanently
  // can refuse (payments already recorded against it), same reasoning as
  // deleteMysExpense's own guard-refusal comment: a plain <form action> has
  // nowhere to catch that, so this runs as a click handler instead.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const doDeleteInvoice = async (invoiceId: string) => {
    setDeleteError(null);
    setDeletingId(invoiceId);
    try {
      const result = await deleteMysInvoicePermanently(invoiceId);
      if (result?.error) setDeleteError(result.error);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setDeletingId(null);
    }
  };

  // --- Status menu: clicking the status pill itself is the one entry
  // point for changing an invoice's status or recording a payment against
  // it, instead of several separate icon buttons - only the actions that
  // make sense for its current status are offered (STATUS_MENU_ACTIONS
  // below). Each action still goes through its own already-guarded server
  // action (markMysInvoiceProforma, revertMysInvoiceToDraft, etc.), so an
  // edge case the menu didn't anticipate still comes back as a clear error
  // here instead of silently doing the wrong thing. ---
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
  const [payFormOpen, setPayFormOpen] = useState(false);
  const [statusActionBusy, setStatusActionBusy] = useState(false);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod | "">("");
  const [payDate, setPayDate] = useState(todayLocalISO());
  const [payNotes, setPayNotes] = useState("");

  const closeStatusMenu = () => {
    setStatusMenuId(null);
    setPayFormOpen(false);
    setStatusActionError(null);
  };

  const openPayForm = (inv: InvoiceWithExtras) => {
    const remaining = round2(round2(inv.amount + inv.vat_amount) - round2(inv.payments.reduce((s, p) => s + p.amount, 0)));
    setPayAmount(String(remaining));
    setPayMethod("");
    setPayDate(todayLocalISO());
    setPayNotes("");
    setStatusActionError(null);
    setPayFormOpen(true);
  };

  const doStatusAction = async (inv: MysInvoice, action: "proforma" | "sent" | "draft" | "void") => {
    setStatusActionError(null);
    setStatusActionBusy(true);
    try {
      const result =
        action === "proforma"
          ? await markMysInvoiceProforma(inv.id)
          : action === "sent"
            ? await markMysInvoiceSent(inv.id)
            : action === "void"
              ? await voidMysInvoice(inv.id, "reopen")
              : inv.status === "proforma"
                ? await unmarkMysInvoiceProforma(inv.id)
                : await revertMysInvoiceToDraft(inv.id);
      if (result?.error) setStatusActionError(result.error);
      else closeStatusMenu();
    } catch (e) {
      setStatusActionError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setStatusActionBusy(false);
    }
  };

  const doSavePayment = async (invoiceId: string) => {
    setStatusActionError(null);
    setStatusActionBusy(true);
    try {
      const fd = new FormData();
      fd.set("amount", payAmount);
      if (payMethod) fd.set("payment_method", payMethod);
      fd.set("paid_date", payDate);
      fd.set("notes", payNotes);
      const result = await addMysInvoicePayment(invoiceId, fd);
      if (result?.error) setStatusActionError(result.error);
      else closeStatusMenu();
    } catch (e) {
      setStatusActionError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setStatusActionBusy(false);
    }
  };

  const paymentLabels = getPaymentLabels(locale);

  const [search, setSearch] = useState("");
  const deferredSearchTerm = useDeferredValue(search.trim().toLowerCase());
  const filteredInvoices = useMemo(
    () =>
      invoices.filter((inv) => {
        if (!deferredSearchTerm) return true;
        return [inv.invoice_number, inv.client_name, inv.description]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(deferredSearchTerm));
      }),
    [invoices, deferredSearchTerm]
  );
  const { visibleItems: visibleInvoices, hasMore: hasMoreInvoices, loadMore: loadMoreInvoices } = usePagedList(filteredInvoices);


  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_invoices_title")}</h1>
        <button
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper transition-transform hover:opacity-90 active:scale-[0.97]"
        >
          {showForm ? (
            <span className="inline-flex items-center gap-1">
              <X size={14} /> {t("close_word")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Plus size={14} /> {t("mys_add_invoice")}
            </span>
          )}
        </button>
      </div>

      {showForm && (
        <div className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_invoice_title_label")}</label>
            <input
              value={invoiceTitle}
              onChange={(e) => setInvoiceTitle(e.target.value)}
              placeholder={t("mys_invoice_title_placeholder")}
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_ad_hoc_client_name")} *</label>
            <CustomSelect
              value={clientName}
              onChange={(v) => {
                if (v === NEW_CLIENT_OPTION_VALUE) {
                  setShowAddClientForm(true);
                  return;
                }
                setClientNameAndAutofillEmail(v);
              }}
              options={[
                { value: NEW_CLIENT_OPTION_VALUE, label: t("mys_new_client_option") },
                { value: "", label: t("mys_client_select_placeholder") },
                ...clientNames.map((n) => ({ value: n, label: n })),
              ]}
              placeholder={t("mys_client_select_placeholder")}
              emphasizeEmpty
              searchable
              searchPlaceholder={t("mys_client_search_placeholder")}
              className={INPUT_CLASS}
            />
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
                      setClientNameAndAutofillEmail(newClientName.trim());
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
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("mys_invoice_due_date")}</label>
              <DateInput value={dueDate} onChange={setDueDate} locale={locale} className={INPUT_CLASS} allowClear />
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-fleet-border pt-3">
            <div className="hidden text-2xs font-medium text-fleet-ink sm:grid sm:grid-cols-12 sm:gap-2">
              <div className="sm:col-span-1" />
              <div className="sm:col-span-4">{t("mys_invoice_line_item_label")}</div>
              <div className="sm:col-span-2">{t("quantity_label")}</div>
              <div className="sm:col-span-2">{t("unit_price_label")}</div>
              <div className="sm:col-span-2">{t("mys_vat_percent_label")}</div>
              <div className="sm:col-span-1 sm:text-end">{t("line_total_label")}</div>
            </div>
            <div ref={linesContainerRef} className="flex flex-col gap-2">
              {newLines.map((line, i) => {
                const lineAmount = round2((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
                return (
                  <div
                    key={i}
                    className={`flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5 sm:grid sm:grid-cols-12 sm:items-center sm:gap-2 sm:rounded-none sm:bg-transparent sm:p-0 ${
                      draggingIndex === i ? "opacity-50" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => startLineDrag(e, i)}
                      onPointerMove={moveLineDrag}
                      onPointerUp={endLineDrag}
                      onPointerCancel={endLineDrag}
                      aria-label={t("mys_drag_line_to_reorder")}
                      style={{ touchAction: "none" }}
                      className="flex h-8 cursor-grab items-center justify-center text-fleet-ink active:cursor-grabbing sm:col-span-1"
                    >
                      <GripVertical size={16} />
                    </button>
                    <input
                      value={line.description}
                      onChange={(e) => updateNewLine(i, { description: e.target.value })}
                      placeholder={t("mys_invoice_line_item_label")}
                      className={`${INPUT_CLASS} sm:col-span-4`}
                    />
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={line.quantity}
                      onChange={(e) => updateNewLine(i, { quantity: e.target.value })}
                      onWheel={(e) => e.currentTarget.blur()}
                      aria-label={t("quantity_label")}
                      className={`${INPUT_CLASS} sm:col-span-2`}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.unitPrice}
                      onChange={(e) => updateNewLine(i, { unitPrice: e.target.value })}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="0"
                      aria-label={t("unit_price_label")}
                      className={`${INPUT_CLASS} sm:col-span-2`}
                    />
                    <div className="flex items-center gap-1 sm:col-span-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={line.vatPercent}
                        onChange={(e) => updateNewLine(i, { vatPercent: e.target.value })}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0"
                        aria-label={t("mys_vat_percent_label")}
                        className={INPUT_CLASS}
                      />
                      <span className="shrink-0 text-xs text-fleet-ink">%</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                      <span className="text-xs font-bold text-fleet-navy sm:hidden">{t("line_total_label")}</span>
                      <span className="text-xs font-bold text-fleet-navy" dir="ltr">
                        {formatCurrency(lineAmount)}
                      </span>
                      {newLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeNewLine(i)}
                          aria-label={t("delete_word")}
                          className="shrink-0 text-fleet-ink hover:text-fleet-coral-text"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addNewLine} className="self-start text-xs font-medium text-fleet-brass hover:underline">
              + {t("mys_add_line_item_cta")}
            </button>
          </div>

          <div className="flex flex-col gap-0.5 rounded-lg bg-fleet-paper px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-fleet-ink">{t("mys_invoice_subtotal_label")}</span>
              <span dir="ltr">{formatCurrency(newLinesSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fleet-ink">{t("mys_vat_amount_label")}</span>
              <span dir="ltr">{formatCurrency(newLinesVat)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-fleet-navy">
              <span>{t("total")}</span>
              <span dir="ltr">{formatCurrency(newLinesTotal)}</span>
            </div>
          </div>

          {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
          {/* Sticky, not just inline at the end of the form - with the line
              items list free to grow (another client this size had 7+), the
              save button used to end up scrolled well out of view with
              nothing on screen hinting it was still further down. */}
          <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-fleet-border bg-white px-4 py-3">
            <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button
              type="button"
              disabled={saving || saved}
              onClick={doSave}
              className={`flex flex-1 items-center justify-center gap-2 ${PRIMARY_BUTTON_CLASS}`}
            >
              {saving ? (
                <>
                  <RippleLoader size="sm" /> {t("saving_word")}
                </>
              ) : saved ? (
                <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
              ) : (
                t("mys_add_invoice")
              )}
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_placeholder")}
          className={SEARCH_INPUT_CLASS}
        />
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 rounded-lg border border-fleet-coral bg-fleet-coral/10 px-3 py-2 text-xs text-fleet-coral-text">
          <span className="flex-1">{deleteError}</span>
          <button type="button" onClick={() => setDeleteError(null)} aria-label="dismiss" className="shrink-0 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}


      {filteredInvoices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_invoices")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleInvoices.map((inv) => {
            const total = round2(inv.amount + inv.vat_amount);
            const paidSoFar = round2(inv.payments.reduce((s, p) => s + p.amount, 0));
            const fileError = fileErrors[inv.id];
            return (
              <div key={inv.id} className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3">
                {editingId === inv.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_ad_hoc_client_name")} *</label>
                      <CustomSelect
                        value={editClientName}
                        onChange={(v) => {
                          if (v === NEW_CLIENT_OPTION_VALUE) {
                            setEditShowAddClientForm(true);
                            return;
                          }
                          setEditClientNameAndAutofillEmail(v);
                        }}
                        options={[
                          { value: NEW_CLIENT_OPTION_VALUE, label: t("mys_new_client_option") },
                          { value: "", label: t("mys_client_select_placeholder") },
                          ...(editClientName && !clientNames.includes(editClientName) ? [{ value: editClientName, label: editClientName }] : []),
                          ...clientNames.map((n) => ({ value: n, label: n })),
                        ]}
                        placeholder={t("mys_client_select_placeholder")}
                        emphasizeEmpty
                        searchable
                        searchPlaceholder={t("mys_client_search_placeholder")}
                        className={INPUT_CLASS}
                      />
                      {editShowAddClientForm && (
                        <div className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-white p-2.5">
                          <input
                            value={editNewClientName}
                            onChange={(e) => setEditNewClientName(e.target.value)}
                            placeholder={t("mys_client_name_label")}
                            className={INPUT_CLASS}
                          />
                          {editAddClientError && <p className="text-xs text-fleet-coral-text">{editAddClientError}</p>}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={editSavingClient || !editNewClientName.trim()}
                              onClick={async () => {
                                const fd = new FormData();
                                fd.set("name", editNewClientName.trim());
                                await doAddEditClient(fd);
                                setEditClientNameAndAutofillEmail(editNewClientName.trim());
                              }}
                              className={`px-4 py-1.5 text-xs ${PRIMARY_BUTTON_CLASS}`}
                            >
                              {editSavingClient ? t("saving_word") : t("mys_add_client")}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditShowAddClientForm(false);
                                setEditNewClientName("");
                                setEditAddClientError(null);
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
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
                      <input
                        type="email"
                        value={editClientEmail}
                        onChange={(e) => setEditClientEmail(e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_client_company_details_label")}</label>
                      <textarea
                        rows={2}
                        value={editClientCompanyDetails}
                        onChange={(e) => setEditClientCompanyDetails(e.target.value)}
                        placeholder={t("mys_client_company_details_placeholder")}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("description")}</label>
                      <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className={INPUT_CLASS} />
                    </div>

                    {editLines.length === 0 && editNewLines.length === 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-fleet-ink">{t("amount")} *</label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            onWheel={(e) => e.currentTarget.blur()}
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-fleet-ink">{t("mys_vat_amount_label")}</label>
                          <input
                            type="number"
                            step="0.01"
                            onWheel={(e) => e.currentTarget.blur()}
                            value={editVatAmount}
                            onChange={(e) => setEditVatAmount(e.target.value)}
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 border-t border-fleet-border pt-3">
                        <div className="hidden text-2xs font-medium text-fleet-ink sm:grid sm:grid-cols-12 sm:gap-2">
                          <div className="sm:col-span-5">{t("mys_invoice_line_item_label")}</div>
                          <div className="sm:col-span-2">{t("quantity_label")}</div>
                          <div className="sm:col-span-2">{t("unit_price_label")}</div>
                          <div className="sm:col-span-2">{t("mys_vat_percent_label")}</div>
                          <div className="sm:col-span-1 sm:text-end">{t("line_total_label")}</div>
                        </div>
                        {editLines.map((line) => (
                          <div
                            key={line.id}
                            className="flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5 sm:grid sm:grid-cols-12 sm:items-center sm:gap-2 sm:rounded-none sm:bg-transparent sm:p-0"
                          >
                            <input
                              value={line.description}
                              onChange={(e) => updateEditLine(line.id, { description: e.target.value })}
                              placeholder={t("mys_invoice_line_item_label")}
                              className={`${INPUT_CLASS} sm:col-span-5`}
                            />
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={line.quantity}
                              onChange={(e) => updateEditLine(line.id, { quantity: e.target.value })}
                              onWheel={(e) => e.currentTarget.blur()}
                              aria-label={t("quantity_label")}
                              className={`${INPUT_CLASS} sm:col-span-2`}
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.unitPrice}
                              onChange={(e) => updateEditLine(line.id, { unitPrice: e.target.value })}
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="0"
                              aria-label={t("unit_price_label")}
                              className={`${INPUT_CLASS} sm:col-span-2`}
                            />
                            <div className="flex items-center gap-1 sm:col-span-2">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={line.vatPercent}
                                onChange={(e) => updateEditLine(line.id, { vatPercent: e.target.value })}
                                onWheel={(e) => e.currentTarget.blur()}
                                placeholder="0"
                                aria-label={t("mys_vat_percent_label")}
                                className={INPUT_CLASS}
                              />
                              <span className="shrink-0 text-xs text-fleet-ink">%</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                              <span className="text-xs font-bold text-fleet-navy sm:hidden">{t("line_total_label")}</span>
                              <span className="text-xs font-bold text-fleet-navy" dir="ltr">
                                {formatCurrency(draftLineAmount(line))}
                              </span>
                              {editLines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeEditLine(line.id)}
                                  aria-label={t("delete_word")}
                                  className="shrink-0 text-fleet-ink hover:text-fleet-coral-text"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {editNewLines.map((line, i) => (
                          <div
                            key={i}
                            className="flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5 sm:grid sm:grid-cols-12 sm:items-center sm:gap-2 sm:rounded-none sm:bg-transparent sm:p-0"
                          >
                            <input
                              value={line.description}
                              onChange={(e) => updateEditNewLine(i, { description: e.target.value })}
                              placeholder={t("mys_invoice_line_item_label")}
                              className={`${INPUT_CLASS} sm:col-span-5`}
                            />
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={line.quantity}
                              onChange={(e) => updateEditNewLine(i, { quantity: e.target.value })}
                              onWheel={(e) => e.currentTarget.blur()}
                              aria-label={t("quantity_label")}
                              className={`${INPUT_CLASS} sm:col-span-2`}
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.unitPrice}
                              onChange={(e) => updateEditNewLine(i, { unitPrice: e.target.value })}
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="0"
                              aria-label={t("unit_price_label")}
                              className={`${INPUT_CLASS} sm:col-span-2`}
                            />
                            <div className="flex items-center gap-1 sm:col-span-2">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={line.vatPercent}
                                onChange={(e) => updateEditNewLine(i, { vatPercent: e.target.value })}
                                onWheel={(e) => e.currentTarget.blur()}
                                placeholder="0"
                                aria-label={t("mys_vat_percent_label")}
                                className={INPUT_CLASS}
                              />
                              <span className="shrink-0 text-xs text-fleet-ink">%</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                              <span className="text-xs font-bold text-fleet-navy sm:hidden">{t("line_total_label")}</span>
                              <span className="text-xs font-bold text-fleet-navy" dir="ltr">
                                {formatCurrency(draftLineAmount(line))}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeEditNewLine(i)}
                                aria-label={t("delete_word")}
                                className="shrink-0 text-fleet-ink hover:text-fleet-coral-text"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={addEditNewLine} className="self-start text-xs font-medium text-fleet-brass hover:underline">
                          + {t("mys_add_line_item_cta")}
                        </button>
                        <div className="flex flex-col gap-0.5 rounded-lg bg-fleet-paper px-3 py-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-fleet-ink">{t("mys_invoice_subtotal_label")}</span>
                            <span dir="ltr">{formatCurrency(editLinesSubtotal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-fleet-ink">{t("mys_vat_amount_label")}</span>
                            <span dir="ltr">{formatCurrency(editLinesVat)}</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold text-fleet-navy">
                            <span>{t("total")}</span>
                            <span dir="ltr">{formatCurrency(editLinesTotal)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_due_date")}</label>
                      <DateInput value={editDueDate} onChange={setEditDueDate} locale={locale} className={INPUT_CLASS} allowClear />
                    </div>
                    {editError && <p className="text-xs text-fleet-coral-text">{editError}</p>}
                    {/* Sticky, same reasoning as the new-invoice form's save
                        row above - a long line-item list used to push this
                        button out of view with nothing on screen to show it
                        was still further down. */}
                    <div className="sticky bottom-0 -mx-3 -mb-3 flex gap-2 border-t border-fleet-border bg-white px-3 py-3">
                      <button type="button" onClick={closeEdit} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                        {t("close_word")}
                      </button>
                      <button
                        type="button"
                        disabled={editSaving || editSaved}
                        onClick={() => doSaveEdit(inv.id)}
                        className={`flex flex-1 items-center justify-center gap-2 ${PRIMARY_BUTTON_CLASS}`}
                      >
                        {editSaving ? (
                          <>
                            <RippleLoader size="sm" /> {t("saving_word")}
                          </>
                        ) : editSaved ? (
                          <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
                        ) : (
                          t("save_edit")
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      <span dir="ltr">{inv.invoice_number}</span> · {inv.client_name}
                    </div>
                    <div className="truncate text-xs text-fleet-ink">
                      {inv.description}
                      {" · "}
                      <span dir="ltr">{formatDateDisplay(inv.issued_date)}</span>
                      {inv.due_date && (
                        <>
                          {" · "}
                          {t("mys_invoice_due_date")}: <span dir="ltr">{formatDateDisplay(inv.due_date)}</span>
                        </>
                      )}
                    </div>
                    {paidSoFar > 0 && inv.status !== "paid" && (
                      <div className="truncate text-2xs font-bold text-fleet-brass">
                        {t("mys_invoice_paid_so_far", { amount: formatCurrency(paidSoFar) })}
                      </div>
                    )}
                    {fileError && <div className="truncate text-2xs font-bold text-fleet-coral-text">{fileError}</div>}
                  </div>
                  {STATUS_MENU_ACTIONS[inv.status].length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setStatusMenuId(inv.id)}
                      className={`shrink-0 rounded-full px-2 py-1 text-2xs font-bold transition-opacity hover:opacity-80 ${STATUS_CLASSES[inv.status]}`}
                    >
                      {statusLabels[inv.status]}
                    </button>
                  ) : (
                    <span className={`shrink-0 rounded-full px-2 py-1 text-2xs font-bold ${STATUS_CLASSES[inv.status]}`}>
                      {statusLabels[inv.status]}
                    </span>
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/mys/invoices/${inv.id}`}
                      aria-label={t("mys_view_invoice_document")}
                      title={t("mys_view_invoice_document")}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                    >
                      <Eye size={16} />
                    </Link>
                    {inv.invoiceUrl && (
                      <>
                        <a
                          href={inv.invoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("mys_upload_invoice_cta")}
                          title={t("mys_upload_invoice_cta")}
                          className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                        >
                          <ReceiptEuro size={16} />
                        </a>
                        <button
                          type="button"
                          onClick={() => removeInvoiceFile(inv.id)}
                          aria-label={t("remove_word")}
                          title={t("remove_word")}
                          className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                        >
                          <X size={16} />
                        </button>
                      </>
                    )}
                    {inv.status !== "paid" && (
                      <button
                        type="button"
                        onClick={() => startEdit(inv)}
                        aria-label={t("update_word")}
                        title={t("update_word")}
                        className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={deletingId === inv.id}
                      onClick={() => setPendingDeleteId(inv.id)}
                      aria-label={t("delete_word")}
                      title={t("delete_word")}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="shrink-0 text-end">
                    <div className="text-sm font-bold text-fleet-navy">{formatCurrency(total)}</div>
                    {inv.vat_amount > 0 && (
                      <div className="text-2xs text-fleet-ink">
                        {t("mys_vat_amount_label")}: {formatCurrency(inv.vat_amount)}
                      </div>
                    )}
                  </div>
                </div>
                )}
              </div>
            );
          })}
          {hasMoreInvoices && (
            <button
              type="button"
              onClick={loadMoreInvoices}
              className="rounded-lg border border-fleet-border bg-white py-2.5 text-sm font-bold text-fleet-teal hover:bg-fleet-paper"
            >
              {t("load_more_word")}
            </button>
          )}
        </div>
      )}

      {pendingDeleteId && (
        <ConfirmPopup
          message={t("mys_delete_invoice_confirm")}
          locale={locale}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => {
            doDeleteInvoice(pendingDeleteId);
            setPendingDeleteId(null);
          }}
        />
      )}

      {statusMenuId &&
        (() => {
          const menuInvoice = invoices.find((i) => i.id === statusMenuId);
          if (!menuInvoice) return null;
          const actions = STATUS_MENU_ACTIONS[menuInvoice.status];
          return (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => !statusActionBusy && closeStatusMenu()}>
              <div
                className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                {payFormOpen ? (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-sm text-fleet-navy">{t("mys_record_payment_cta")}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-fleet-ink">{t("amount")}</label>
                        <input
                          type="number"
                          step="0.01"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-fleet-ink">{t("date")}</label>
                        <DateInput value={payDate} onChange={setPayDate} locale={locale} className={INPUT_CLASS} allowClear />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("payment_method")}</label>
                      <CustomSelect
                        value={payMethod}
                        onChange={(v) => setPayMethod(v as PaymentMethod | "")}
                        options={[{ value: "", label: t("not_set_yet") }, ...PAYMENT_METHODS.map((k) => ({ value: k, label: paymentLabels[k] }))]}
                        placeholder={t("not_set_yet")}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <input
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      placeholder={t("new_expense_notes")}
                      className={INPUT_CLASS}
                    />
                    {statusActionError && <p className="text-xs text-fleet-coral-text">{statusActionError}</p>}
                    <div className="flex gap-2">
                      <button type="button" disabled={statusActionBusy} onClick={() => setPayFormOpen(false)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                        {t("close_word")}
                      </button>
                      <button
                        type="button"
                        disabled={statusActionBusy}
                        onClick={() => doSavePayment(menuInvoice.id)}
                        className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                      >
                        {statusActionBusy ? t("saving_word") : t("mys_record_payment_cta")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-fleet-navy">{t("mys_status_menu_prompt")}</p>
                    {statusActionError && <p className="text-xs text-fleet-coral-text">{statusActionError}</p>}
                    <div className="flex flex-col gap-2">
                      {actions.includes("sent") && (
                        <button
                          type="button"
                          disabled={statusActionBusy}
                          onClick={() => doStatusAction(menuInvoice, "sent")}
                          className={`w-full ${PRIMARY_BUTTON_CLASS}`}
                        >
                          {statusActionBusy ? t("saving_word") : t("mys_convert_to_invoice_cta")}
                        </button>
                      )}
                      {actions.includes("proforma") && (
                        <button
                          type="button"
                          disabled={statusActionBusy}
                          onClick={() => doStatusAction(menuInvoice, "proforma")}
                          className="w-full rounded-lg border border-fleet-brass py-2.5 text-sm font-bold text-fleet-brass hover:bg-fleet-brass/10 disabled:opacity-60"
                        >
                          {statusActionBusy ? t("saving_word") : t("mys_mark_proforma_cta")}
                        </button>
                      )}
                      {actions.includes("pay") && (
                        <button
                          type="button"
                          disabled={statusActionBusy}
                          onClick={() => openPayForm(menuInvoice)}
                          className="w-full rounded-lg border border-fleet-moss py-2.5 text-sm font-bold text-fleet-moss-text hover:bg-fleet-moss/10 disabled:opacity-60"
                        >
                          {t("mys_record_payment_cta")}
                        </button>
                      )}
                      {actions.includes("draft") && (
                        <button
                          type="button"
                          disabled={statusActionBusy}
                          onClick={() => doStatusAction(menuInvoice, "draft")}
                          className="w-full rounded-lg border border-fleet-navy py-2.5 text-sm font-bold text-fleet-navy hover:bg-fleet-paper disabled:opacity-60"
                        >
                          {statusActionBusy ? t("saving_word") : t("mys_unmark_proforma_cta")}
                        </button>
                      )}
                      {actions.includes("void") && (
                        <button
                          type="button"
                          disabled={statusActionBusy}
                          onClick={() => doStatusAction(menuInvoice, "void")}
                          className="w-full rounded-lg border border-fleet-coral py-2.5 text-sm font-bold text-fleet-coral-text hover:bg-fleet-coral/10 disabled:opacity-60"
                        >
                          {statusActionBusy ? t("saving_word") : t("mys_void_invoice")}
                        </button>
                      )}
                      <button type="button" disabled={statusActionBusy} onClick={closeStatusMenu} className={`w-full ${SECONDARY_BUTTON_CLASS}`}>
                        {t("close_word")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

    </div>
  );
}
