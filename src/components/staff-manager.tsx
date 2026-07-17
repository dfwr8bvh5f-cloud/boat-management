"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Check, CheckCircle2, Copy, MessageCircle, Pencil, Phone, Plus, Smartphone, Sparkles, Trash2, Upload, Users, X } from "lucide-react";
import { createStaff, updateStaff, deleteStaff, setStaffActive, removeStaffResume } from "@/lib/actions/staff";
import { addStaffIdDocument, removeStaffIdDocument } from "@/lib/actions/staff-documents";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay } from "@/lib/date-format";
import { NationalitySelect } from "@/components/nationality-select";
import { countryLabel, flagEmoji, isCountryCode } from "@/lib/countries";
import { useFileDrop, setInputFiles } from "@/lib/use-file-drop";
import { compressImageToLimit } from "@/lib/image-compress";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/upload";
import { ClearFileButton } from "@/components/clear-file-button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { StaffVisible } from "@/lib/types/database";
import { CALENDAR_FREE_COLOR, USAGE_TYPE_COLORS } from "@/lib/labels";
import { INPUT_CLASS } from "@/lib/ui-classes";
import { whatsAppNumber, isLikelyGreekLandline } from "@/lib/phone";

type StaffIdDocumentWithUrl = { id: string; path: string; url: string };
type StaffWithUrls = StaffVisible & {
  photoUrl: string | null;
  photoThumbUrl: string | null;
  resumeUrl: string | null;
  idDocumentUrl: string | null;
  idDocuments: StaffIdDocumentWithUrl[];
};

const inputClass = INPUT_CLASS;

function monthsSince(iso: string) {
  const months = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  return Math.max(0, Math.floor(months));
}

export function StaffManager({
  boatId,
  staff,
  canAdd,
  canSeeSalary,
  isManagement,
  locale,
}: {
  boatId: string;
  staff: StaffWithUrls[];
  canAdd: boolean;
  canSeeSalary: boolean;
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Overrides the server-given `active` per staff id the instant the toggle
  // is clicked, so the split into active/inactive sections and the salary
  // total update immediately without waiting on (or triggering) a full page
  // revalidation - setStaffActive deliberately doesn't revalidate this
  // route, since that would re-sign every crew photo on Supabase Storage
  // just to reflect one boolean flip.
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
  const [, startActiveTransition] = useTransition();

  const effectiveStaff = staff.map((m) => (m.id in activeOverrides ? { ...m, active: activeOverrides[m.id] } : m));
  const totalSalaries = effectiveStaff.reduce((sum, m) => sum + (m.active ? (m.salary ?? 0) : 0), 0);
  const activeStaff = effectiveStaff.filter((m) => m.active);
  const inactiveStaff = effectiveStaff.filter((m) => !m.active);

  const toggleActive = (m: StaffWithUrls) => {
    const current = m.id in activeOverrides ? activeOverrides[m.id] : m.active;
    const next = !current;
    setActiveOverrides((prev) => ({ ...prev, [m.id]: next }));
    startActiveTransition(async () => {
      try {
        await setStaffActive(boatId, m.id, next);
      } catch {
        setActiveOverrides((prev) => ({ ...prev, [m.id]: m.active }));
      }
    });
  };

  const copyCrewList = async () => {
    const text = staff.map((m) => `${m.name} — ${m.position ?? ""} (${m.start_date})`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard unavailable - silently ignore
    }
  };

  const flashSaved = () => {
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 3500);
  };

  return (
    <div className="flex flex-col gap-4">
      {justSaved && (
        <div className="flex items-center gap-1.5 rounded-lg border border-fleet-moss bg-fleet-moss/10 px-3 py-2 text-sm font-bold text-fleet-moss">
          <CheckCircle2 size={15} /> {t("saved_word")}
        </div>
      )}

      {canSeeSalary && staff.length > 0 && (
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="text-xs text-fleet-ink">{t("total_monthly_salary_cost")}</div>
          <div className="mt-1 text-xl font-bold text-fleet-navy">€{totalSalaries.toLocaleString("he-IL")}</div>
        </div>
      )}

      {staff.length > 0 && (
        <button
          onClick={copyCrewList}
          className={`flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm font-semibold ${
            copied ? "border-fleet-moss text-fleet-moss" : "border-fleet-brass text-fleet-navy"
          }`}
        >
          {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />} {copied ? t("copied_to_clipboard") : t("copy_crew_list_for_captain")}
        </button>
      )}

      {canAdd && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setShowForm((s) => !s);
              setEditingId(null);
            }}
            className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
          >
            {showForm ? `✕ ${t("close_word")}` : t("add_staff_button")}
          </button>
        </div>
      )}

      {showForm && canAdd && (
        <StaffForm
          boatId={boatId}
          locale={locale}
          onSaved={() => {
            setShowForm(false);
            flashSaved();
          }}
        />
      )}

      {staff.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("no_staff_registered")}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {activeStaff.map((m) =>
              editingId === m.id ? (
                <StaffForm
                  key={m.id}
                  boatId={boatId}
                  existing={m}
                  locale={locale}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null);
                    flashSaved();
                  }}
                />
              ) : (
                <StaffCard
                  key={m.id}
                  m={m}
                  boatId={boatId}
                  locale={locale}
                  isManagement={isManagement}
                  canAdd={canAdd}
                  canSeeSalary={canSeeSalary}
                  t={t}
                  onEdit={() => {
                    setEditingId(m.id);
                    setShowForm(false);
                  }}
                  onToggleActive={() => toggleActive(m)}
                />
              )
            )}
          </div>

          {inactiveStaff.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="mt-2 text-base font-bold text-fleet-navy">{t("inactive_crew_title")}</div>
              {inactiveStaff.map((m) =>
                editingId === m.id ? (
                  <StaffForm
                    key={m.id}
                    boatId={boatId}
                    existing={m}
                    locale={locale}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => {
                      setEditingId(null);
                      flashSaved();
                    }}
                  />
                ) : (
                  <StaffCard
                    key={m.id}
                    m={m}
                    boatId={boatId}
                    locale={locale}
                    isManagement={isManagement}
                    canAdd={canAdd}
                    canSeeSalary={canSeeSalary}
                    t={t}
                    onEdit={() => {
                      setEditingId(m.id);
                      setShowForm(false);
                    }}
                    onToggleActive={() => toggleActive(m)}
                  />
                )
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Extracted so the same card markup can be reused for both the active and
// inactive sections below without duplicating the JSX.
function StaffCard({
  m,
  boatId,
  locale,
  isManagement,
  canAdd,
  canSeeSalary,
  t,
  onEdit,
  onToggleActive,
}: {
  m: StaffWithUrls;
  boatId: string;
  locale: Locale;
  isManagement: boolean;
  canAdd: boolean;
  canSeeSalary: boolean;
  t: (key: Parameters<typeof translate>[1]) => string;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const [photoOpen, setPhotoOpen] = useState(false);
  return (
    <div className="rounded-xl border border-fleet-border bg-white p-3">
      <div className="flex gap-3">
        {m.photoUrl ? (
          <button type="button" onClick={() => setPhotoOpen(true)} className="h-20 w-20 shrink-0" aria-label={t("view_photo")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.photoThumbUrl ?? m.photoUrl} alt="" className="h-full w-full rounded-full object-cover" />
          </button>
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-fleet-paper">
            <Users size={24} className="text-fleet-brass" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold">{m.name}</div>
              <div className="text-xs text-fleet-ink">
                {m.position} · <span dir="ltr">{formatDateDisplay(m.start_date)}</span> ({monthsSince(m.start_date)} {t("months_suffix")})
              </div>
              {(m.date_of_birth || m.nationality) && (
                <div className="flex items-center gap-1 text-[11px] text-fleet-ink">
                  {m.date_of_birth && <span dir="ltr">{formatDateDisplay(m.date_of_birth)}</span>}
                  {m.date_of_birth && m.nationality ? " · " : ""}
                  {isCountryCode(m.nationality) && (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fleet-paper text-[10px]">
                      {flagEmoji(m.nationality)}
                    </span>
                  )}
                  {isCountryCode(m.nationality) ? countryLabel(m.nationality, locale) : (m.nationality ?? "")}
                </div>
              )}
              {m.id_number && <div className="text-[11px] text-fleet-ink">{t("id_number_field")}: {m.id_number}</div>}
              {m.phone && (
                <span className="mt-0.5 flex w-fit items-center gap-2" dir="ltr">
                  <a
                    href={`tel:${m.phone}`}
                    className="flex items-center gap-1 text-[11px] font-medium text-fleet-teal"
                  >
                    {isLikelyGreekLandline(m.phone) ? <Phone size={11} /> : <Smartphone size={11} />} {m.phone}
                  </a>
                  {!isLikelyGreekLandline(m.phone) && (
                    <a
                      href={`https://wa.me/${whatsAppNumber(m.phone)}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="WhatsApp"
                      title="WhatsApp"
                      className="text-fleet-moss hover:text-fleet-moss/70"
                    >
                      <MessageCircle size={13} />
                    </a>
                  )}
                </span>
              )}
            </div>
            {isManagement ? (
              <StaffActiveToggle
                active={m.active}
                onToggle={onToggleActive}
                activeLabel={t("staff_active_label")}
                inactiveLabel={t("staff_inactive_label")}
              />
            ) : (
              <span
                dir="ltr"
                title={m.active ? t("staff_active_label") : t("staff_inactive_label")}
                style={{ background: m.active ? CALENDAR_FREE_COLOR : USAGE_TYPE_COLORS.charter }}
                className="relative h-5 w-9 shrink-0 rounded-full"
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow ${m.active ? "translate-x-4" : "translate-x-0"}`}
                />
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-fleet-ink">
              {m.resumeUrl && (
                <a href={m.resumeUrl} target="_blank" rel="noreferrer" className="text-fleet-teal underline">
                  {t("resume_field")}
                </a>
              )}
            </span>
            <div className="flex items-center gap-2.5">
              {canSeeSalary && m.salary != null && (
                <span className="font-bold text-fleet-navy">€{m.salary.toLocaleString("he-IL")}/{t("per_month_suffix")}</span>
              )}
              {isManagement && (
                <button type="button" onClick={onEdit} aria-label="edit staff" className="text-fleet-ink hover:text-fleet-teal">
                  <Pencil size={15} />
                </button>
              )}
              {(canAdd || (isManagement && m.status === "pending")) && (
                <form action={deleteStaff.bind(null, boatId, m.id, m.photo_path, m.resume_path, m.id_document_path)}>
                  <ConfirmSubmitButton locale={locale} confirmMessage={t("delete_staff_confirm")} className="text-fleet-ink hover:text-fleet-coral">
                    <Trash2 size={16} />
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
      {m.idDocuments.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-fleet-border pt-2">
          {m.idDocuments.map((d, i) => (
            <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="text-xs text-fleet-teal underline">
              {t("id_document_field")} {m.idDocuments.length > 1 ? i + 1 : ""}
            </a>
          ))}
        </div>
      )}
      {photoOpen && m.photoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPhotoOpen(false)}
        >
          <button
            type="button"
            onClick={() => setPhotoOpen(false)}
            aria-label={t("close_word")}
            className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-fleet-navy"
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.photoUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

type IdDocumentScanResult = {
  full_name?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  passport_number?: string | null;
};

// A staff member can have more than one ID/passport document (front + back
// of an ID card, or an ID plus a passport) - each is its own upload rather
// than a single file, so they're added and removed independently. Only
// rendered inside the edit form now (not on the read-only card) - onScanResult
// lets the very first file picked also auto-fill the surrounding form's
// name/DOB/nationality/ID-number fields, via the same AI reader already used
// for guest passport scanning.
function StaffIdDocuments({
  boatId,
  staffId,
  documents,
  canAdd,
  onScanResult,
  t,
}: {
  boatId: string;
  staffId: string;
  documents: StaffIdDocumentWithUrl[];
  canAdd: boolean;
  onScanResult?: (result: IdDocumentScanResult) => void;
  t: (key: Parameters<typeof translate>[1]) => string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scanFirstFile = async (file: File | undefined) => {
    if (!file || !onScanResult) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/scan-passport", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanMsg(data.error ?? t("scan_fail"));
        return;
      }
      onScanResult(data.result ?? {});
      setScanMsg(t("scan_ok"));
    } catch {
      setScanMsg(t("scan_connect_fail"));
    } finally {
      setScanning(false);
    }
  };

  const onFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter((f) => f.size > 0);
    if (files.length === 0) return;
    setError(null);
    scanFirstFile(files[0]);
    setUploading(true);
    try {
      for (const file of files) {
        const single = new FormData();
        single.set("id_document", file);
        const result = await addStaffIdDocument(boatId, staffId, single);
        if (result.error) {
          setError(result.error);
          break;
        }
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {documents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {documents.map((d, i) => (
            <span key={d.id} className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-2.5 py-1.5 text-xs">
              <a href={d.url} target="_blank" rel="noreferrer" className="text-fleet-teal underline">
                {t("id_document_field")} {documents.length > 1 ? i + 1 : ""}
              </a>
              {canAdd && (
                <form action={removeStaffIdDocument.bind(null, boatId, d.id, d.path)}>
                  <button type="submit" aria-label="remove document" className="text-fleet-ink hover:text-fleet-coral">
                    <X size={12} />
                  </button>
                </form>
              )}
            </span>
          ))}
        </div>
      )}
      {canAdd && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={scanning || uploading}
            className="flex w-fit items-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy disabled:opacity-60"
          >
            {scanning ? <Sparkles size={15} className="animate-twinkle" /> : <Upload size={15} />}{" "}
            {scanning ? t("scanning") : t("upload_file")}
          </button>
          {scanMsg && <p className="text-[11px] text-fleet-ink">{scanMsg}</p>}
          {error && <p className="text-[11px] text-fleet-coral">{error}</p>}
        </>
      )}
    </div>
  );
}

// Purely presentational - the click-instant optimistic state and the
// setStaffActive call both live in StaffManager's activeOverrides, so the
// same flip is reflected here AND in the active/inactive split and salary
// total at once.
function StaffActiveToggle({
  active,
  onToggle,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  onToggle: () => void;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      dir="ltr"
      onClick={onToggle}
      title={active ? activeLabel : inactiveLabel}
      aria-label={active ? activeLabel : inactiveLabel}
      style={{ background: active ? CALENDAR_FREE_COLOR : USAGE_TYPE_COLORS.charter }}
      className="relative h-5 w-9 shrink-0 rounded-full"
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${active ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

function StaffForm({
  boatId,
  existing,
  locale,
  onCancel,
  onSaved,
}: {
  boatId: string;
  existing?: StaffWithUrls;
  locale: Locale;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [photoPicked, setPhotoPicked] = useState(false);
  const [resumePicked, setResumePicked] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Filled automatically when an ID/passport document is scanned below -
  // name and ID number are plain uncontrolled inputs set via ref, while DOB
  // and nationality need controlled state since their components don't
  // accept an imperative "set this value" call.
  const nameRef = useRef<HTMLInputElement>(null);
  const idNumberRef = useRef<HTMLInputElement>(null);
  const [dob, setDob] = useState(existing?.date_of_birth ?? "");
  const [nationality, setNationality] = useState(existing?.nationality ?? "");
  const onIdDocumentScanResult = (result: {
    full_name?: string | null;
    date_of_birth?: string | null;
    nationality?: string | null;
    passport_number?: string | null;
  }) => {
    if (result.full_name && nameRef.current) nameRef.current.value = result.full_name;
    if (result.passport_number && idNumberRef.current) idNumberRef.current.value = result.passport_number;
    if (result.date_of_birth) setDob(result.date_of_birth);
    if (result.nationality) setNationality(result.nationality);
  };
  const onPhotoFile = async (file: File | undefined) => {
    if (!file || !photoRef.current) return;
    setInputFiles(photoRef.current, await compressImageToLimit(file, MAX_UPLOAD_FILE_BYTES));
    setPhotoPicked(true);
  };
  const onResumeFile = async (file: File | undefined) => {
    if (!file || !resumeRef.current) return;
    setInputFiles(resumeRef.current, await compressImageToLimit(file, MAX_UPLOAD_FILE_BYTES));
    setResumePicked(true);
  };
  const { dragging: photoDragging, dropHandlers: photoDropHandlers } = useFileDrop(onPhotoFile);
  const { dragging: resumeDragging, dropHandlers: resumeDropHandlers } = useFileDrop(onResumeFile);
  const [removingResume, setRemovingResume] = useState(false);
  const [resumeRemoved, setResumeRemoved] = useState(false);
  const removeExistingResume = async () => {
    if (!existing) return;
    setRemovingResume(true);
    try {
      await removeStaffResume(boatId, existing.id);
      setResumeRemoved(true);
    } finally {
      setRemovingResume(false);
    }
  };
  const clearPhoto = () => {
    if (photoRef.current) photoRef.current.value = "";
    setPhotoPicked(false);
  };
  const clearResume = () => {
    if (resumeRef.current) resumeRef.current.value = "";
    setResumePicked(false);
  };

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        if (existing) {
          await updateStaff(boatId, existing.id, formData);
        } else {
          await createStaff(boatId, formData);
          formRef.current?.reset();
        }
        setPhotoPicked(false);
        setResumePicked(false);
        onSaved();
      }}
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("profile_photo_label")}</label>
        <input
          ref={photoRef}
          type="file"
          name="photo"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPhotoFile(e.target.files?.[0])}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            {...photoDropHandlers}
            className={`relative flex w-fit items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm ${
              photoDragging
                ? "border-fleet-teal bg-fleet-teal/10 text-fleet-navy"
                : photoPicked || existing?.photoUrl
                  ? "border-fleet-moss bg-fleet-moss/10 text-fleet-moss"
                  : "border-fleet-brass bg-fleet-paper text-fleet-navy"
            }`}
          >
            {photoPicked || existing?.photoUrl ? <Check size={15} /> : <Camera size={15} />}{" "}
            {photoPicked ? t("photo_selected") : existing?.photoUrl ? t("photo_saved") : t("upload_photo")}
            {photoDragging && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                <Plus size={18} className="text-fleet-teal" />
              </span>
            )}
          </button>
          {photoPicked && <ClearFileButton onClear={clearPhoto} label={t("remove_word")} />}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("name_word")} *</label>
        <input ref={nameRef} name="name" required defaultValue={existing?.name} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("position_field")}</label>
        <input name="position" defaultValue={existing?.position ?? undefined} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("dob_field")}</label>
          <DateInput name="date_of_birth" value={dob} onChange={setDob} locale={locale} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("nationality_field")}</label>
          <NationalitySelect name="nationality" value={nationality} onChange={setNationality} locale={locale} className={inputClass} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("phone_field")}</label>
        <input name="phone" type="tel" dir="ltr" defaultValue={existing?.phone ?? undefined} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("id_number_field")}</label>
        <input ref={idNumberRef} name="id_number" defaultValue={existing?.id_number ?? undefined} className={inputClass} />
      </div>
      {existing && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("id_document_field")}</label>
          <StaffIdDocuments
            boatId={boatId}
            staffId={existing.id}
            documents={existing.idDocuments}
            canAdd
            onScanResult={onIdDocumentScanResult}
            t={t}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("employment_start_date")}</label>
        <DateInput
          name="start_date"
          defaultValue={existing?.start_date ?? undefined}
          locale={locale}
          className={inputClass}
          allowClear
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("resume_field")}</label>
        <input
          ref={resumeRef}
          type="file"
          name="resume"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => onResumeFile(e.target.files?.[0])}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => resumeRef.current?.click()}
            {...resumeDropHandlers}
            className={`relative flex w-fit items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm ${
              resumeDragging
                ? "border-fleet-teal bg-fleet-teal/10 text-fleet-navy"
                : resumePicked
                  ? "border-fleet-moss bg-fleet-moss/10 text-fleet-moss"
                  : "border-fleet-brass bg-fleet-paper text-fleet-navy"
            }`}
          >
            {resumePicked ? <Check size={15} /> : <Upload size={15} />} {resumePicked ? t("photo_selected") : t("upload_file")}
            {resumeDragging && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                <Plus size={18} className="text-fleet-teal" />
              </span>
            )}
          </button>
          {resumePicked && <ClearFileButton onClear={clearResume} label={t("remove_word")} />}
          {existing?.resumeUrl && !resumePicked && !resumeRemoved && (
            <div className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-2.5 py-1.5 text-xs">
              <a href={existing.resumeUrl} target="_blank" rel="noreferrer" className="text-fleet-teal underline">
                {t("resume_field")}
              </a>
              <button
                type="button"
                onClick={removeExistingResume}
                disabled={removingResume}
                aria-label={t("remove_word")}
                className="text-fleet-ink hover:text-fleet-coral disabled:opacity-60"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("monthly_salary_field")}</label>
        <input name="salary" type="number" step="0.01" defaultValue={existing?.salary ?? undefined} className={inputClass} />
      </div>
      <div className="flex gap-2">
        {existing && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-fleet-border py-2.5 text-sm font-bold text-fleet-ink hover:bg-fleet-paper"
          >
            {t("close_word")}
          </button>
        )}
        <button type="submit" className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
          {existing ? t("save_and_close") : t("submit_add_staff")}
        </button>
      </div>
    </form>
  );
}
