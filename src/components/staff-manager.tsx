"use client";

import { useRef, useState } from "react";
import { Camera, Check, CheckCircle2, Copy, Pencil, Phone, Plus, Trash2, Upload, Users } from "lucide-react";
import { createStaff, updateStaff, deleteStaff, setStaffActive } from "@/lib/actions/staff";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { NationalitySelect } from "@/components/nationality-select";
import { countryLabel, flagEmoji, isCountryCode } from "@/lib/countries";
import { useFileDrop, setInputFiles } from "@/lib/use-file-drop";
import { ClearFileButton } from "@/components/clear-file-button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { StaffVisible } from "@/lib/types/database";

type StaffWithUrls = StaffVisible & { photoUrl: string | null; resumeUrl: string | null };

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

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

  const totalSalaries = staff.reduce((sum, m) => sum + (m.salary ?? 0), 0);
  const sortedStaff = [...staff].sort((a, b) => Number(b.active) - Number(a.active));

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
        <div className="flex flex-col gap-2">
          {sortedStaff.map((m) =>
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
              <div key={m.id} className="rounded-xl border border-fleet-border bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    {m.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fleet-paper">
                        <Users size={18} className="text-fleet-brass" />
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-bold">{m.name}</div>
                      <div className="text-xs text-fleet-ink">
                        {m.position} · <span dir="ltr">{m.start_date}</span> ({monthsSince(m.start_date)} {t("months_suffix")})
                      </div>
                      {(m.date_of_birth || m.nationality) && (
                        <div className="flex items-center gap-1 text-[11px] text-fleet-ink">
                          {m.date_of_birth && <span dir="ltr">{m.date_of_birth}</span>}
                          {m.date_of_birth && m.nationality ? " · " : ""}
                          {isCountryCode(m.nationality) && (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fleet-paper text-[10px]">
                              {flagEmoji(m.nationality)}
                            </span>
                          )}
                          {isCountryCode(m.nationality) ? countryLabel(m.nationality, locale) : (m.nationality ?? "")}
                        </div>
                      )}
                      {m.phone && (
                        <a
                          href={`tel:${m.phone}`}
                          dir="ltr"
                          className="mt-0.5 flex w-fit items-center gap-1 text-[11px] font-medium text-fleet-teal"
                        >
                          <Phone size={11} /> {m.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  {isManagement ? (
                    <form action={setStaffActive.bind(null, boatId, m.id, !m.active)}>
                      <button
                        type="submit"
                        title={m.active ? t("staff_active_label") : t("staff_inactive_label")}
                        aria-label={m.active ? t("staff_active_label") : t("staff_inactive_label")}
                        className={`h-4 w-4 shrink-0 rounded-full ${m.active ? "bg-fleet-moss" : "bg-fleet-coral"}`}
                      />
                    </form>
                  ) : (
                    <span
                      title={m.active ? t("staff_active_label") : t("staff_inactive_label")}
                      className={`h-4 w-4 shrink-0 rounded-full ${m.active ? "bg-fleet-moss" : "bg-fleet-coral"}`}
                    />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-fleet-ink">
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
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(m.id);
                          setShowForm(false);
                        }}
                        aria-label="edit staff"
                        className="text-fleet-ink hover:text-fleet-teal"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {(canAdd || (isManagement && m.status === "pending")) && (
                      <form action={deleteStaff.bind(null, boatId, m.id, m.photo_path, m.resume_path)}>
                        <ConfirmSubmitButton confirmMessage={t("delete_staff_confirm")} className="text-fleet-ink hover:text-fleet-coral">
                          <Trash2 size={16} />
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
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
  const { dragging: photoDragging, dropHandlers: photoDropHandlers } = useFileDrop((file) => {
    if (photoRef.current) {
      setInputFiles(photoRef.current, file);
      setPhotoPicked(true);
    }
  });
  const { dragging: resumeDragging, dropHandlers: resumeDropHandlers } = useFileDrop((file) => {
    if (resumeRef.current) {
      setInputFiles(resumeRef.current, file);
      setResumePicked(true);
    }
  });
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
          onChange={(e) => setPhotoPicked(Boolean(e.target.files?.length))}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            {...photoDropHandlers}
            className={`relative flex w-fit items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm ${
              photoDragging
                ? "border-fleet-teal bg-fleet-teal/10 text-fleet-navy"
                : photoPicked
                  ? "border-fleet-moss bg-fleet-moss/10 text-fleet-moss"
                  : "border-fleet-brass bg-fleet-paper text-fleet-navy"
            }`}
          >
            {photoPicked ? <Check size={15} /> : <Camera size={15} />} {photoPicked ? t("photo_selected") : t("upload_photo")}
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
        <input name="name" required defaultValue={existing?.name} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("position_field")}</label>
        <input name="position" defaultValue={existing?.position ?? undefined} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("dob_field")}</label>
          <DateInput name="date_of_birth" defaultValue={existing?.date_of_birth ?? undefined} locale={locale} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("nationality_field")}</label>
          <NationalitySelect name="nationality" defaultValue={existing?.nationality ?? undefined} locale={locale} className={inputClass} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("phone_field")}</label>
        <input name="phone" type="tel" dir="ltr" defaultValue={existing?.phone ?? undefined} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("employment_start_date")}</label>
        <DateInput
          name="start_date"
          defaultValue={existing?.start_date ?? new Date().toISOString().slice(0, 10)}
          locale={locale}
          className={inputClass}
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
          onChange={(e) => setResumePicked(Boolean(e.target.files?.length))}
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
          {existing?.resumeUrl && !resumePicked && (
            <a href={existing.resumeUrl} target="_blank" rel="noreferrer" className="text-xs text-fleet-teal underline">
              {t("resume_field")}
            </a>
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
          {t("submit_add_staff")}
        </button>
      </div>
    </form>
  );
}
