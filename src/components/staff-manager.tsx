"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, Copy, Trash2, Upload, Users } from "lucide-react";
import { createStaff, deleteStaff, approveStaff } from "@/lib/actions/staff";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getPaymentLabels, PAYMENT_METHODS } from "@/lib/labels";
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
  const paymentLabels = getPaymentLabels(locale);
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const totalSalaries = staff.reduce((sum, m) => sum + (m.salary ?? 0), 0);

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

  return (
    <div className="flex flex-col gap-4">
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
            onClick={() => setShowForm((s) => !s)}
            className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
          >
            {showForm ? `✕ ${t("close_word")}` : t("add_staff_button")}
          </button>
        </div>
      )}

      {showForm && canAdd && (
        <form
          ref={formRef}
          action={async (formData) => {
            await createStaff(boatId, formData);
            formRef.current?.reset();
            setShowForm(false);
          }}
          className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("profile_photo_label")}</label>
            <input ref={photoRef} type="file" name="photo" accept="image/*" className="hidden" />
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              className="flex w-fit items-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy"
            >
              <Camera size={15} /> {t("upload_photo")}
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("name_word")} *</label>
            <input name="name" required className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("position_field")}</label>
            <input name="position" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("dob_field")}</label>
              <input name="date_of_birth" type="date" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("nationality_field")}</label>
              <input name="nationality" className={inputClass} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("employment_start_date")}</label>
            <input name="start_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("resume_field")}</label>
            <input ref={resumeRef} type="file" name="resume" accept="image/*,.pdf" className="hidden" />
            <button
              type="button"
              onClick={() => resumeRef.current?.click()}
              className="flex w-fit items-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy"
            >
              <Upload size={15} /> {t("upload_file")}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("monthly_salary_field")}</label>
              <input name="salary" type="number" step="0.01" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("payment_method")}</label>
              <select name="payment_method" defaultValue="" className={inputClass}>
                <option value="">—</option>
                {PAYMENT_METHODS.map((k) => (
                  <option key={k} value={k}>
                    {paymentLabels[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="mt-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            {t("submit_add_staff")}
          </button>
        </form>
      )}

      {staff.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("no_staff_registered")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {staff.map((m) => (
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
                      {m.position} · {m.start_date} ({monthsSince(m.start_date)} {t("months_suffix")})
                    </div>
                    {(m.date_of_birth || m.nationality) && (
                      <div className="text-[11px] text-fleet-ink">
                        {m.date_of_birth ?? ""}
                        {m.date_of_birth && m.nationality ? " · " : ""}
                        {m.nationality ?? ""}
                      </div>
                    )}
                  </div>
                </div>
                <StatusBadge value={m.status} locale={locale} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-fleet-ink">
                  {m.payment_method ? paymentLabels[m.payment_method] : "—"}
                  {m.resumeUrl && (
                    <a href={m.resumeUrl} target="_blank" rel="noreferrer" className="ms-2 text-fleet-teal underline">
                      {t("resume_field")}
                    </a>
                  )}
                </span>
                <div className="flex items-center gap-2.5">
                  {canSeeSalary && m.salary != null && (
                    <span className="font-bold text-fleet-navy">€{m.salary.toLocaleString("he-IL")}/{t("per_month_suffix")}</span>
                  )}
                  {isManagement && m.status === "pending" && (
                    <form action={approveStaff.bind(null, boatId, m.id)}>
                      <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                        {t("approve")}
                      </button>
                    </form>
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
          ))}
        </div>
      )}
    </div>
  );
}
