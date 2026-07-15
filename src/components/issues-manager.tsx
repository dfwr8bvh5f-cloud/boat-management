"use client";

import { useRef, useState, type ReactNode } from "react";
import { Camera, CheckCircle2, Clock, Download, Filter, Pencil, Plus, Printer, ReceiptEuro, Search, Trash2, Wrench, X, XCircle } from "lucide-react";
import {
  createIssue,
  updateIssue,
  deleteIssue,
  approveIssue,
  cycleIssueOpStatus,
  removeIssuePhoto,
  removeIssueQuote,
  removeIssueAttachment,
} from "@/lib/actions/issues";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay } from "@/lib/date-format";
import {
  AREAS,
  getAreaLabels,
  CLASSIFICATIONS,
  getClassificationLabels,
  OP_STATUS_COLORS,
  getOpStatusLabels,
} from "@/lib/labels";
import { useFileDrop, setInputFilesMulti } from "@/lib/use-file-drop";
import { downloadCsv } from "@/lib/csv-export";
import { translate } from "@/lib/i18n/translate";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { compressImageToLimit } from "@/lib/image-compress";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Issue, IssueOpStatus, IssueArea, IssueClassification } from "@/lib/types/database";
import { INPUT_CLASS } from "@/lib/ui-classes";

type AttachmentWithUrl = { id: string; kind: "photo" | "quote"; path: string; url: string };
type IssueWithUrls = Issue & { photoUrl: string | null; quoteUrl: string | null; attachments: AttachmentWithUrl[] };

const inputClass = INPUT_CLASS;

const OP_STATUS_ICON: Record<IssueOpStatus, typeof Wrench> = {
  not_started: Wrench,
  pending: Clock,
  in_progress: Clock,
  completed: CheckCircle2,
  cancelled: XCircle,
};

// Statuses that mean "the work is over" - these issues move out of the
// active list into a separate section at the bottom, same as a to-do list
// archiving finished items instead of mixing them in with open ones.
const CLOSED_STATUSES: IssueOpStatus[] = ["completed", "cancelled"];

export function IssuesManager({
  boatId,
  issues,
  canAdd,
  canCycle,
  isManagement,
  locale,
}: {
  boatId: string;
  issues: IssueWithUrls[];
  canAdd: boolean;
  canCycle: boolean;
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const areaLabels = getAreaLabels(locale);
  const classificationLabels = getClassificationLabels(locale);
  const opStatusLabels = getOpStatusLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<IssueWithUrls | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [classFilter, setClassFilter] = useState<IssueClassification[]>([]);
  const [areaFilter, setAreaFilter] = useState<IssueArea[]>([]);
  const [statusFilter, setStatusFilter] = useState<IssueOpStatus[]>([]);
  const [, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [quoteFiles, setQuoteFiles] = useState<File[]>([]);
  const photoRef = useRef<HTMLInputElement>(null);
  const quoteRef = useRef<HTMLInputElement>(null);
  const addPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    const compressed = await compressImageToLimit(file, MAX_SCAN_FILE_BYTES);
    if (compressed.size > MAX_SCAN_FILE_BYTES) {
      setPhotoError(t("scan_file_too_large"));
      return;
    }
    setPhotoFiles((prev) => {
      const next = [...prev, compressed];
      if (photoRef.current) setInputFilesMulti(photoRef.current, next);
      return next;
    });
    setPhotoPreviews((prev) => [...prev, URL.createObjectURL(compressed)]);
  };
  const removePendingPhoto = (index: number) => {
    setPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setPhotoFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (photoRef.current) setInputFilesMulti(photoRef.current, next);
      return next;
    });
  };
  const addQuoteFile = (file: File | undefined) => {
    if (!file) return;
    setQuoteFiles((prev) => {
      const next = [...prev, file];
      if (quoteRef.current) setInputFilesMulti(quoteRef.current, next);
      return next;
    });
  };
  const removePendingQuote = (index: number) => {
    setQuoteFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (quoteRef.current) setInputFilesMulti(quoteRef.current, next);
      return next;
    });
  };
  const { dragging: photoDragging, dropHandlers: photoDropHandlers } = useFileDrop((file) => {
    addPhotoFile(file);
  });
  const { dragging: quoteDragging, dropHandlers: quoteDropHandlers } = useFileDrop((file) => {
    addQuoteFile(file);
  });
  const resetPendingFiles = () => {
    photoPreviews.forEach((u) => URL.revokeObjectURL(u));
    setPhotoFiles([]);
    setPhotoPreviews([]);
    setPhotoError(null);
    setQuoteFiles([]);
  };
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [removingQuote, setRemovingQuote] = useState(false);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);
  const removeExistingPhoto = async () => {
    if (!editing) return;
    setRemovingPhoto(true);
    try {
      await removeIssuePhoto(boatId, editing.id);
      setEditing((prev) => (prev ? { ...prev, photoUrl: null, photo_path: null } : prev));
    } finally {
      setRemovingPhoto(false);
    }
  };
  const removeExistingQuote = async () => {
    if (!editing) return;
    setRemovingQuote(true);
    try {
      await removeIssueQuote(boatId, editing.id);
      setEditing((prev) => (prev ? { ...prev, quoteUrl: null, quote_path: null } : prev));
    } finally {
      setRemovingQuote(false);
    }
  };
  const removeExistingAttachment = async (attachment: AttachmentWithUrl) => {
    setRemovingAttachmentId(attachment.id);
    try {
      await removeIssueAttachment(boatId, attachment.id, attachment.path);
      setEditing((prev) =>
        prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attachment.id) } : prev
      );
    } finally {
      setRemovingAttachmentId(null);
    }
  };

  const startEdit = (issue: IssueWithUrls) => {
    setEditing(issue);
    resetPendingFiles();
    setShowForm(true);
  };
  const startNew = () => {
    setEditing(null);
    resetPendingFiles();
    setShowForm((s) => (editing ? true : !s));
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const formAction = editing ? updateIssue.bind(null, boatId, editing.id) : createIssue.bind(null, boatId);

  const toggleClassFilter = (k: IssueClassification) =>
    setClassFilter((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const toggleAreaFilter = (k: IssueArea) => setAreaFilter((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const toggleStatusFilter = (k: IssueOpStatus) =>
    setStatusFilter((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const searchTerm = search.trim().toLowerCase();
  const filtered = issues.filter(
    (issue) =>
      (classFilter.length === 0 || classFilter.includes(issue.classification)) &&
      (areaFilter.length === 0 || areaFilter.includes(issue.area)) &&
      (statusFilter.length === 0 || statusFilter.includes(issue.op_status)) &&
      (searchTerm === "" ||
        issue.title.toLowerCase().includes(searchTerm) ||
        (issue.location ?? "").toLowerCase().includes(searchTerm) ||
        (issue.supplier ?? "").toLowerCase().includes(searchTerm) ||
        (issue.supplier_labour ?? "").toLowerCase().includes(searchTerm) ||
        (issue.notes ?? "").toLowerCase().includes(searchTerm))
  );
  const activeFilterCount = classFilter.length + areaFilter.length + statusFilter.length;

  const activeIssues = filtered.filter((issue) => !CLOSED_STATUSES.includes(issue.op_status));
  const closedIssues = filtered.filter((issue) => CLOSED_STATUSES.includes(issue.op_status));

  const exportCsv = () => {
    downloadCsv(
      "issues.csv",
      [t("issue_entered_date"), t("issue_title_f"), t("issue_classification"), t("issue_area"), t("issue_location"), t("status_word")],
      filtered.map((issue) => [
        formatDateDisplay(issue.created_at.slice(0, 10)),
        issue.title,
        classificationLabels[issue.classification],
        areaLabels[issue.area],
        issue.location ?? "",
        opStatusLabels[issue.op_status],
      ])
    );
  };

  const renderIssueRow = (issue: IssueWithUrls) => {
    const StatusIcon = OP_STATUS_ICON[issue.op_status];
    const metaLine = [classificationLabels[issue.classification], areaLabels[issue.area], issue.location]
      .filter(Boolean)
      .join(" · ");
    const metaLine2Parts: ReactNode[] = [
      <span key="entered" dir="ltr">
        {t("issue_entered_date")}: {formatDateDisplay(issue.created_at.slice(0, 10))}
      </span>,
      issue.supplier,
      issue.supplier_labour,
      issue.estimated_cost != null ? `€${issue.estimated_cost.toLocaleString("he-IL")}` : null,
      issue.due_date ? <span dir="ltr">{formatDateDisplay(issue.due_date)}</span> : null,
    ].filter(Boolean);

    return (
      <div key={issue.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
        {issue.photoUrl ? (
          <button
            type="button"
            onClick={() => setLightboxUrl(issue.photoUrl)}
            aria-label={t("view_photo")}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-fleet-border bg-fleet-paper text-fleet-brass hover:bg-white"
          >
            <Camera size={20} />
          </button>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
            <Wrench size={18} className="text-fleet-brass" />
          </div>
        )}
        <div className="min-w-[140px] flex-1">
          <div className="text-sm font-semibold">{issue.title}</div>
          {metaLine && <div className="text-xs text-fleet-ink">{metaLine}</div>}
          {metaLine2Parts.length > 0 && (
            <div className="text-xs text-fleet-ink">
              {metaLine2Parts.map((part, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {part}
                </span>
              ))}
            </div>
          )}
          {issue.notes && <div className="mt-0.5 text-xs text-fleet-ink">{issue.notes}</div>}
          <div className="mt-1 flex items-center gap-2">
            {issue.quoteUrl && (
              <a
                href={issue.quoteUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-fleet-teal underline"
              >
                <ReceiptEuro size={12} /> {t("quote_word")}
              </a>
            )}
            <ApprovalIndicator value={issue.status} locale={locale} />
          </div>
        </div>
        {canCycle ? (
          <form action={cycleIssueOpStatus.bind(null, boatId, issue.id, issue.op_status)}>
            <button
              type="submit"
              style={{ color: OP_STATUS_COLORS[issue.op_status], background: `${OP_STATUS_COLORS[issue.op_status]}26` }}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
            >
              <StatusIcon size={13} /> {opStatusLabels[issue.op_status]}
            </button>
          </form>
        ) : (
          <span
            style={{ color: OP_STATUS_COLORS[issue.op_status], background: `${OP_STATUS_COLORS[issue.op_status]}26` }}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
          >
            <StatusIcon size={13} /> {opStatusLabels[issue.op_status]}
          </span>
        )}
        {isManagement && issue.status === "pending" && (
          <form action={approveIssue.bind(null, boatId, issue.id)}>
            <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
              {t("approve")}
            </button>
          </form>
        )}
        {canAdd && (
          <button onClick={() => startEdit(issue)} aria-label="edit" className="text-fleet-ink hover:text-fleet-navy">
            <Pencil size={16} />
          </button>
        )}
        {(canAdd || (isManagement && issue.status === "pending")) && (
          <form action={deleteIssue.bind(null, boatId, issue.id, issue.photo_path, issue.quote_path)}>
            <ConfirmSubmitButton
              confirmMessage={issue.status === "pending" ? t("reject_issue_confirm") : t("delete_issue_confirm")}
              className="text-fleet-ink hover:text-fleet-coral"
            >
              <Trash2 size={16} />
            </ConfirmSubmitButton>
          </form>
        )}
      </div>
    );
  };

  return (
    <>
    <div className="flex flex-col gap-4 print:hidden">
      {canAdd && (
        <div className="flex justify-end">
          <button
            onClick={startNew}
            className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
          >
            {showForm ? `✕ ${t("close_word")}` : `+ ${t("report_issue")}`}
          </button>
        </div>
      )}

      {showForm && canAdd && (
        <form
          key={editing?.id ?? "new"}
          action={async (formData) => {
            await formAction(formData);
            closeForm();
          }}
          className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("issue_title_f")} *</label>
            <input name="title" required defaultValue={editing?.title} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("issue_classification")}</label>
              <select name="classification" defaultValue={editing?.classification ?? "repair"} className={inputClass}>
                {CLASSIFICATIONS.map((k) => (
                  <option key={k} value={k}>
                    {classificationLabels[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("issue_area")}</label>
              <select name="area" defaultValue={editing?.area ?? "technical"} className={inputClass}>
                {AREAS.map((k) => (
                  <option key={k} value={k}>
                    {areaLabels[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("issue_location")}</label>
            <input
              name="location"
              placeholder={t("issue_location_placeholder")}
              defaultValue={editing?.location ?? ""}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("issue_supplier_parts")}</label>
            <input name="supplier" defaultValue={editing?.supplier ?? ""} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("issue_supplier_labour")}</label>
            <input name="supplier_labour" defaultValue={editing?.supplier_labour ?? ""} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("issue_quote")}</label>
              <input
                ref={quoteRef}
                type="file"
                name="quotes"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  for (const file of Array.from(e.target.files ?? [])) addQuoteFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => quoteRef.current?.click()}
                {...quoteDropHandlers}
                className={`relative flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-fleet-navy ${
                  quoteDragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
                }`}
              >
                <ReceiptEuro size={15} /> {t("issue_quote_upload")}
                {quoteDragging && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                    <Plus size={18} className="text-fleet-teal" />
                  </span>
                )}
              </button>
              {(editing?.quoteUrl || editing?.attachments.some((a) => a.kind === "quote") || quoteFiles.length > 0) && (
                <div className="flex flex-wrap gap-2">
                  {editing?.quoteUrl && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-2.5 py-1.5 text-xs">
                      <a href={editing.quoteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-fleet-teal underline">
                        <ReceiptEuro size={13} /> {t("quote_word")}
                      </a>
                      <button
                        type="button"
                        onClick={removeExistingQuote}
                        disabled={removingQuote}
                        aria-label={t("remove_word")}
                        className="text-fleet-ink hover:text-fleet-coral disabled:opacity-60"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  {editing?.attachments
                    .filter((a) => a.kind === "quote")
                    .map((a, i) => (
                      <div key={a.id} className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-2.5 py-1.5 text-xs">
                        <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-fleet-teal underline">
                          <ReceiptEuro size={13} /> {t("quote_word")} {i + 1}
                        </a>
                        <button
                          type="button"
                          onClick={() => removeExistingAttachment(a)}
                          disabled={removingAttachmentId === a.id}
                          aria-label={t("remove_word")}
                          className="text-fleet-ink hover:text-fleet-coral disabled:opacity-60"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  {quoteFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-2.5 py-1.5 text-xs">
                      <ReceiptEuro size={13} className="text-fleet-navy" />
                      <span className="max-w-[100px] truncate">{f.name}</span>
                      <button type="button" onClick={() => removePendingQuote(i)} aria-label={t("remove_word")} className="text-fleet-ink hover:text-fleet-coral">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("photo")}</label>
              <input
                ref={photoRef}
                type="file"
                name="photos"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={async (e) => {
                  for (const file of Array.from(e.target.files ?? [])) await addPhotoFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                {...photoDropHandlers}
                className={`relative flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-fleet-navy ${
                  photoDragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
                }`}
              >
                <Camera size={15} /> {t("take_photo")}
                {photoDragging && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                    <Plus size={18} className="text-fleet-teal" />
                  </span>
                )}
              </button>
              {photoError && <p className="text-xs text-fleet-coral">{photoError}</p>}
              {(editing?.photoUrl || editing?.attachments.some((a) => a.kind === "photo") || photoPreviews.length > 0) && (
                <div className="flex flex-wrap gap-2">
                  {editing?.photoUrl && (
                    <div className="relative w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={editing.photoUrl} alt="" className="h-12 w-12 rounded-lg border border-fleet-border object-cover" />
                      <button
                        type="button"
                        onClick={removeExistingPhoto}
                        disabled={removingPhoto}
                        aria-label={t("remove_word")}
                        className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-fleet-ink/70 text-white hover:bg-fleet-coral disabled:opacity-60"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                  {editing?.attachments
                    .filter((a) => a.kind === "photo")
                    .map((a) => (
                      <div key={a.id} className="relative w-fit">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt="" className="h-12 w-12 rounded-lg border border-fleet-border object-cover" />
                        <button
                          type="button"
                          onClick={() => removeExistingAttachment(a)}
                          disabled={removingAttachmentId === a.id}
                          aria-label={t("remove_word")}
                          className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-fleet-ink/70 text-white hover:bg-fleet-coral disabled:opacity-60"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  {photoPreviews.map((url, i) => (
                    <div key={url} className="relative w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-12 w-12 rounded-lg border border-fleet-border object-cover" />
                      <button
                        type="button"
                        onClick={() => removePendingPhoto(i)}
                        aria-label={t("remove_word")}
                        className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-fleet-ink/70 text-white hover:bg-fleet-coral"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("issue_cost")}</label>
              <input
                name="estimated_cost"
                type="number"
                step="0.01"
                defaultValue={editing?.estimated_cost ?? ""}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("issue_due_date")}</label>
              <DateInput name="due_date" defaultValue={editing?.due_date ?? ""} locale={locale} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("issue_assigned_to")}</label>
              <select name="assigned_to" defaultValue={editing?.assigned_to ?? ""} className={inputClass}>
                <option value="">—</option>
                <option value="captain">{t("assigned_to_captain")}</option>
                <option value="management">{t("assigned_to_management")}</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("details")}</label>
            <textarea name="notes" rows={3} defaultValue={editing?.notes ?? ""} className={inputClass} />
          </div>
          <button
            type="submit"
            className="mt-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            {editing ? t("save_edit") : t("report_issue")}
          </button>
        </form>
      )}

      {issues.length > 0 && (
        <>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("issue_search_placeholder")}
              className="w-full rounded-lg border border-fleet-border bg-white py-2 ps-9 pe-3 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
            >
              <Download size={13} /> {t("export_excel")}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
            >
              <Printer size={13} /> {t("export_print")}
            </button>
          </div>

          <div>
            <button
              onClick={() => setShowFilters((s) => !s)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
                activeFilterCount > 0 ? "border-fleet-teal text-fleet-teal" : "border-fleet-border text-fleet-navy"
              }`}
            >
              <Filter size={13} /> {t("issue_filters")}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            {showFilters && (
              <div className="mt-2 flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-3">
                <div>
                  <div className="mb-1.5 text-[11px] font-bold text-fleet-ink">{t("issue_classification")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {CLASSIFICATIONS.map((k) => (
                      <button
                        key={k}
                        onClick={() => toggleClassFilter(k)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                          classFilter.includes(k) ? "border-fleet-teal bg-fleet-teal text-white" : "border-fleet-border"
                        }`}
                      >
                        {classificationLabels[k]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-bold text-fleet-ink">{t("issue_area")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {AREAS.map((k) => (
                      <button
                        key={k}
                        onClick={() => toggleAreaFilter(k)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                          areaFilter.includes(k) ? "border-fleet-teal bg-fleet-teal text-white" : "border-fleet-border"
                        }`}
                      >
                        {areaLabels[k]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-bold text-fleet-ink">{t("status_word")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(opStatusLabels) as IssueOpStatus[]).map((k) => (
                      <button
                        key={k}
                        onClick={() => toggleStatusFilter(k)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                          statusFilter.includes(k) ? "border-fleet-teal bg-fleet-teal text-white" : "border-fleet-border"
                        }`}
                      >
                        {opStatusLabels[k]}
                      </button>
                    ))}
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setClassFilter([]);
                      setAreaFilter([]);
                      setStatusFilter([]);
                    }}
                    className="w-fit text-xs text-fleet-coral"
                  >
                    {t("issue_filters_clear")}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("no_issues")}
        </p>
      ) : (
        <>
          {activeIssues.length > 0 && (
            <div className="flex flex-col gap-2">{activeIssues.map(renderIssueRow)}</div>
          )}
          {closedIssues.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="mt-2 text-sm font-bold text-fleet-ink">
                {t("closed_issues_title")} ({closedIssues.length})
              </div>
              {closedIssues.map(renderIssueRow)}
            </div>
          )}
        </>
      )}
    </div>

    <table className="hidden w-full border-collapse text-sm print:table">
      <thead>
        <tr>
          <th className="border border-fleet-border p-1.5 text-start">{t("issue_entered_date")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("issue_title_f")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("issue_classification")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("issue_area")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("issue_location")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("status_word")}</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((issue) => (
          <tr key={issue.id}>
            <td className="border border-fleet-border p-1.5" dir="ltr">
              {formatDateDisplay(issue.created_at.slice(0, 10))}
            </td>
            <td className="border border-fleet-border p-1.5">{issue.title}</td>
            <td className="border border-fleet-border p-1.5">{classificationLabels[issue.classification]}</td>
            <td className="border border-fleet-border p-1.5">{areaLabels[issue.area]}</td>
            <td className="border border-fleet-border p-1.5">{issue.location}</td>
            <td className="border border-fleet-border p-1.5">{opStatusLabels[issue.op_status]}</td>
          </tr>
        ))}
      </tbody>
    </table>

    {lightboxUrl && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print:hidden"
        onClick={() => setLightboxUrl(null)}
      >
        <button
          type="button"
          onClick={() => setLightboxUrl(null)}
          aria-label={t("close_word")}
          className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-fleet-navy"
        >
          <X size={18} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={lightboxUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      </div>
    )}
    </>
  );
}
