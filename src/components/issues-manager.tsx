"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Camera, CheckCircle2, ChevronDown, Clock, Download, Filter, Pencil, Plus, Printer, ReceiptEuro, Search, ShieldCheck, Trash2, Wrench, X, XCircle } from "lucide-react";
import {
  createIssue,
  updateIssue,
  deleteIssue,
  approveIssue,
  setIssueOpStatus,
  removeIssuePhoto,
  removeIssueQuote,
  removeIssueAttachment,
} from "@/lib/actions/issues";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { TechnicianSelect } from "@/components/technician-select";
import { formatDateDisplay } from "@/lib/date-format";
import {
  AREAS,
  getAreaLabels,
  areaDisplayLabel,
  LOCATIONS_BY_AREA,
  CLASSIFICATIONS,
  getClassificationLabels,
  classificationDisplayLabel,
  OP_STATUS_COLORS,
  SELECTABLE_OP_STATUSES,
  getOpStatusLabels,
} from "@/lib/labels";
import { useFileDrop, setInputFilesMulti } from "@/lib/use-file-drop";
import { downloadCsv } from "@/lib/csv-export";
import { translate } from "@/lib/i18n/translate";
import { MAX_SCAN_FILE_BYTES, isPdfUrl } from "@/lib/upload";
import { compressImageToLimit } from "@/lib/image-compress";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Issue, IssueOpStatus, IssueArea, IssueClassification, Technician } from "@/lib/types/database";
import { INPUT_CLASS } from "@/lib/ui-classes";

type AttachmentWithUrl = { id: string; kind: "photo" | "quote"; path: string; url: string };
type IssueWithUrls = Issue & {
  photoUrl: string | null;
  photoThumbUrl: string | null;
  quoteUrl: string | null;
  attachments: AttachmentWithUrl[];
};

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

// issue_date is an optional, user-set date (like expenses.expense_date) -
// falls back to the system entry date when left blank.
function issueDisplayDate(issue: Issue) {
  return issue.issue_date ?? issue.created_at.slice(0, 10);
}

// Newest entry date first, oldest last - regardless of op_status changes.
// Same-date issues break ties by created_at so the order stays stable.
function byEntryDateDesc(a: Issue, b: Issue) {
  const dateDiff = issueDisplayDate(b).localeCompare(issueDisplayDate(a));
  return dateDiff !== 0 ? dateDiff : b.created_at.localeCompare(a.created_at);
}

export function IssuesManager({
  boatId,
  issues,
  technicians,
  canAdd,
  canCycle,
  isManagement,
  locale,
}: {
  boatId: string;
  issues: IssueWithUrls[];
  technicians: Technician[];
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
  const [formAreaValue, setFormAreaValue] = useState("");
  const [formClassificationValue, setFormClassificationValue] = useState("");
  const [formLocationValue, setFormLocationValue] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [classFilter, setClassFilter] = useState<IssueClassification[]>([]);
  const [areaFilter, setAreaFilter] = useState<IssueArea[]>([]);
  const [statusFilter, setStatusFilter] = useState<IssueOpStatus[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Instant feedback for the op-status dropdown, reverted if setIssueOpStatus fails -
  // same pattern as StaffManager's activeOverrides.
  const [opStatusOverrides, setOpStatusOverrides] = useState<Record<string, IssueOpStatus>>({});
  const [, startOpStatusTransition] = useTransition();
  const changeOpStatus = (issue: IssueWithUrls, next: IssueOpStatus) => {
    const previous = issue.id in opStatusOverrides ? opStatusOverrides[issue.id] : issue.op_status;
    setOpStatusOverrides((prev) => ({ ...prev, [issue.id]: next }));
    startOpStatusTransition(async () => {
      try {
        await setIssueOpStatus(boatId, issue.id, next);
      } catch (e) {
        console.error("setIssueOpStatus failed:", e);
        setOpStatusOverrides((prev) => ({ ...prev, [issue.id]: previous }));
      }
    });
  };
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    setFormAreaValue((AREAS as string[]).includes(issue.area) ? issue.area : "__other__");
    setFormClassificationValue(
      (CLASSIFICATIONS as string[]).includes(issue.classification) ? issue.classification : "__other__"
    );
    setFormLocationValue(
      issue.location && (AREAS as string[]).includes(issue.area) && LOCATIONS_BY_AREA[issue.area as IssueArea]?.includes(issue.location)
        ? issue.location
        : issue.location
          ? "__other__"
          : ""
    );
    resetPendingFiles();
    setShowForm(true);
  };
  const startNew = () => {
    setEditing(null);
    setFormAreaValue("");
    setFormClassificationValue("");
    setFormLocationValue("");
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

  const effectiveIssues = useMemo(
    () =>
      issues.map((issue) =>
        issue.id in opStatusOverrides ? { ...issue, op_status: opStatusOverrides[issue.id] } : issue
      ),
    [issues, opStatusOverrides]
  );

  const searchTerm = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      effectiveIssues.filter(
        (issue) =>
          (classFilter.length === 0 || classFilter.includes(issue.classification as IssueClassification)) &&
          (areaFilter.length === 0 || areaFilter.includes(issue.area as IssueArea)) &&
          (statusFilter.length === 0 || statusFilter.includes(issue.op_status)) &&
          (searchTerm === "" ||
            issue.title.toLowerCase().includes(searchTerm) ||
            (issue.location ?? "").toLowerCase().includes(searchTerm) ||
            (issue.supplier ?? "").toLowerCase().includes(searchTerm) ||
            (issue.supplier_labour ?? "").toLowerCase().includes(searchTerm) ||
            (issue.notes ?? "").toLowerCase().includes(searchTerm))
      ),
    [effectiveIssues, classFilter, areaFilter, statusFilter, searchTerm]
  );
  const activeFilterCount = classFilter.length + areaFilter.length + statusFilter.length;

  const activeIssues = useMemo(
    () => filtered.filter((issue) => !CLOSED_STATUSES.includes(issue.op_status)).sort(byEntryDateDesc),
    [filtered]
  );
  const closedIssues = useMemo(
    () => filtered.filter((issue) => CLOSED_STATUSES.includes(issue.op_status)).sort(byEntryDateDesc),
    [filtered]
  );

  const renderIssueForm = () => {
    return (
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
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("date")}</label>
        <DateInput name="issue_date" defaultValue={editing?.issue_date ?? ""} locale={locale} className={inputClass} allowClear />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("issue_classification")}</label>
          <CustomSelect
            name={formClassificationValue === "__other__" ? undefined : "classification"}
            value={formClassificationValue}
            onChange={setFormClassificationValue}
            options={[
              { value: "", label: "—" },
              ...CLASSIFICATIONS.map((k) => ({ value: k, label: classificationLabels[k] })),
              { value: "__other__", label: t("classif_other") },
            ]}
            emphasizeEmpty
            className={inputClass}
          />
          {formClassificationValue === "__other__" && (
            <input
              name="classification"
              required
              placeholder={t("classif_other")}
              defaultValue={
                editing && !(CLASSIFICATIONS as string[]).includes(editing.classification) ? editing.classification : ""
              }
              className={inputClass}
            />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("issue_area")}</label>
          <CustomSelect
            name={formAreaValue === "__other__" ? undefined : "area"}
            value={formAreaValue}
            onChange={(v) => {
              setFormAreaValue(v);
              setFormLocationValue("");
            }}
            options={[
              { value: "", label: "—" },
              ...AREAS.map((k) => ({ value: k, label: areaLabels[k] })),
              { value: "__other__", label: t("area_other") },
            ]}
            emphasizeEmpty
            className={inputClass}
          />
          {formAreaValue === "__other__" && (
            <input
              name="area"
              required
              placeholder={t("area_other")}
              defaultValue={editing && !(AREAS as string[]).includes(editing.area) ? editing.area : ""}
              className={`mt-1.5 ${inputClass}`}
            />
          )}
        </div>
      </div>
      <div className="flex max-w-xs flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("issue_location")}</label>
        <CustomSelect
          name={formLocationValue === "__other__" ? undefined : "location"}
          value={formLocationValue}
          onChange={setFormLocationValue}
          options={[
            { value: "", label: "—" },
            ...((AREAS as string[]).includes(formAreaValue)
              ? LOCATIONS_BY_AREA[formAreaValue as IssueArea].map((loc) => ({ value: loc, label: loc }))
              : []),
            { value: "__other__", label: t("location_other") },
          ]}
          className={inputClass}
        />
        {formLocationValue === "__other__" && (
          <input
            name="location"
            placeholder={t("location_other")}
            defaultValue={
              editing?.location &&
              (!(AREAS as string[]).includes(editing.area) ||
                !LOCATIONS_BY_AREA[editing.area as IssueArea]?.includes(editing.location))
                ? editing.location
                : ""
            }
            className={inputClass}
          />
        )}
      </div>
      {isManagement && (
        <div className="flex max-w-xs flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("issue_supplier_parts")}</label>
          <TechnicianSelect
            name="supplier"
            defaultValue={editing?.supplier ?? ""}
            technicians={technicians}
            locale={locale}
            isManagement={isManagement}
          />
        </div>
      )}
      {isManagement && (
        <div className="flex max-w-xs flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("issue_supplier_labour")}</label>
          <TechnicianSelect
            name="supplier_labour"
            defaultValue={editing?.supplier_labour ?? ""}
            technicians={technicians}
            locale={locale}
            isManagement={isManagement}
          />
        </div>
      )}
      <div className={`grid grid-cols-1 gap-3 ${isManagement ? "sm:grid-cols-2" : ""}`}>
        {isManagement && (
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
                    <button type="button" onClick={() => removePendingQuote(i)} aria-label={t("remove_word")} className="flex h-7 w-7 items-center justify-center text-fleet-ink hover:text-fleet-coral">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("photo")}</label>
          <input
            ref={photoRef}
            type="file"
            name="photos"
            accept="image/*"
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
                  <img src={editing.photoThumbUrl ?? editing.photoUrl} alt="" loading="lazy" className="h-12 w-12 rounded-lg border border-fleet-border object-cover" />
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
                    <img src={a.url} alt="" loading="lazy" className="h-12 w-12 rounded-lg border border-fleet-border object-cover" />
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
      {isManagement && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("details")}</label>
          <textarea name="notes" rows={3} defaultValue={editing?.notes ?? ""} className={inputClass} />
        </div>
      )}
      {isManagement && (
        <label className="flex items-center gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-sm text-fleet-navy">
          <input type="checkbox" name="is_warranty" defaultChecked={editing?.is_warranty ?? false} className="h-4 w-4" />
          <ShieldCheck size={15} className="text-fleet-brass" /> {t("issue_is_warranty_label")}
        </label>
      )}
      <div className="flex gap-2">
        {editing && (
          <button
            type="button"
            onClick={closeForm}
            className="flex-1 rounded-lg border border-fleet-border py-2.5 text-sm font-bold text-fleet-ink hover:bg-fleet-paper"
          >
            {t("close_word")}
          </button>
        )}
        <button
          type="submit"
          className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          {editing ? t("save_edit") : t("report_issue")}
        </button>
      </div>
    </form>
    );
  };

  const exportCsv = () => {
    downloadCsv(
      "issues.csv",
      [t("issue_entered_date"), t("issue_title_f"), t("issue_classification"), t("issue_area"), t("issue_location"), t("status_word")],
      filtered.map((issue) => [
        formatDateDisplay(issueDisplayDate(issue)),
        issue.title,
        classificationDisplayLabel(locale, issue.classification),
        areaDisplayLabel(locale, issue.area),
        issue.location ?? "",
        opStatusLabels[issue.op_status],
      ])
    );
  };

  const renderIssueRow = (issue: IssueWithUrls) => {
    const StatusIcon = OP_STATUS_ICON[issue.op_status];
    const expanded = expandedIds.has(issue.id);
    const metaLine = [classificationDisplayLabel(locale, issue.classification), areaDisplayLabel(locale, issue.area), issue.location]
      .filter(Boolean)
      .join(" · ");
    const metaLine2Parts: ReactNode[] = [issue.supplier, issue.supplier_labour].filter(Boolean);

    return editing?.id === issue.id ? (
      <div key={issue.id}>{renderIssueForm()}</div>
    ) : (
      <div key={issue.id} className="rounded-xl border border-fleet-border bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => toggleExpanded(issue.id)}
            aria-label={t("details_word")}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
          >
            <ChevronDown size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {(() => {
            const photoUrl = issue.photoUrl ?? issue.attachments.find((a) => a.kind === "photo")?.url ?? null;
            return photoUrl ? (
              <button
                type="button"
                onClick={() => setLightboxUrl(photoUrl)}
                aria-label={t("view_photo")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-fleet-border bg-fleet-paper text-fleet-brass hover:bg-white"
              >
                <Camera size={18} />
              </button>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
                <Wrench size={16} className="text-fleet-brass" />
              </div>
            );
          })()}
          {(() => {
            const quoteUrl = issue.quoteUrl ?? issue.attachments.find((a) => a.kind === "quote")?.url ?? null;
            return (
              quoteUrl && (
                <button
                  type="button"
                  onClick={() => setLightboxUrl(quoteUrl)}
                  aria-label={t("quote_word")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-fleet-border bg-fleet-paper text-fleet-brass hover:bg-white"
                >
                  <ReceiptEuro size={18} />
                </button>
              )
            );
          })()}
          <button type="button" onClick={() => toggleExpanded(issue.id)} className="min-w-[140px] flex-1 text-start">
            <div className="flex items-center gap-1 text-sm font-semibold">
              {issue.is_warranty && (
                <ShieldCheck size={13} className="shrink-0 text-fleet-brass" aria-label={t("issue_is_warranty_label")} />
              )}
              {issue.title}
            </div>
            <div className="text-xs text-fleet-ink" dir="ltr">
              {formatDateDisplay(issueDisplayDate(issue))}
            </div>
          </button>
          {canCycle ? (
            <div
              style={{ color: OP_STATUS_COLORS[issue.op_status], background: `${OP_STATUS_COLORS[issue.op_status]}26` }}
              className="flex items-center gap-1 rounded-full ps-2.5 pe-1.5 py-1 text-xs font-bold"
            >
              <StatusIcon size={13} className="shrink-0" />
              <select
                value={issue.op_status}
                onChange={(e) => changeOpStatus(issue, e.target.value as IssueOpStatus)}
                onClick={(e) => e.stopPropagation()}
                style={{ color: "inherit" }}
                className="bg-transparent text-xs font-bold outline-none"
              >
                {SELECTABLE_OP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {opStatusLabels[s]}
                  </option>
                ))}
              </select>
            </div>
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
              <ConfirmSubmitButton locale={locale} className="text-xs font-bold text-fleet-moss hover:underline">
                {t("approve")}
              </ConfirmSubmitButton>
            </form>
          )}
          {canAdd && (
            <button
              onClick={() => startEdit(issue)}
              aria-label="edit"
              className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-navy"
            >
              <Pencil size={16} />
            </button>
          )}
          {(canAdd || (isManagement && issue.status === "pending")) && (
            <form action={deleteIssue.bind(null, boatId, issue.id, issue.photo_path, issue.quote_path)}>
              <ConfirmSubmitButton
                locale={locale}
                confirmMessage={issue.status === "pending" ? t("reject_issue_confirm") : t("delete_issue_confirm")}
                className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral"
              >
                <Trash2 size={16} />
              </ConfirmSubmitButton>
            </form>
          )}
        </div>
        {expanded && (
          <div className="ms-9 mt-2 flex flex-col gap-1 border-t border-dashed border-fleet-border pt-2">
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
            {issue.notes && <div className="text-xs text-fleet-ink">{issue.notes}</div>}
          </div>
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
            {showForm ? (
              <span className="inline-flex items-center gap-1">
                <X size={14} /> {t("close_word")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Plus size={14} /> {t("report_issue")}
              </span>
            )}
          </button>
        </div>
      )}

      {showForm && canAdd && !editing && renderIssueForm()}

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
                    {SELECTABLE_OP_STATUSES.map((k) => (
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
              {formatDateDisplay(issueDisplayDate(issue))}
            </td>
            <td className="border border-fleet-border p-1.5">{issue.title}</td>
            <td className="border border-fleet-border p-1.5">{classificationDisplayLabel(locale, issue.classification)}</td>
            <td className="border border-fleet-border p-1.5">{areaDisplayLabel(locale, issue.area)}</td>
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
        {isPdfUrl(lightboxUrl) ? (
          <iframe
            src={`${lightboxUrl}#view=FitH`}
            title="attachment"
            className="h-[85vh] w-[90vw] rounded-lg bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lightboxUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        )}
      </div>
    )}
    </>
  );
}
