"use client";

import { useState } from "react";
import { Camera, FileText, Pencil, ShieldCheck, Wrench, X } from "lucide-react";
import { approveIssue, deleteIssue, updateAndApproveIssue } from "@/lib/actions/issues";
import { AttachmentGroup } from "@/components/attachment-group";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { TechnicianSelect } from "@/components/technician-select";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Issue, IssueArea, IssueClassification, Technician } from "@/lib/types/database";
import { AREAS, CLASSIFICATIONS, areaDisplayLabel, classificationDisplayLabel } from "@/lib/labels";
import { isPdfUrl } from "@/lib/upload";

export function IssueApprovalCard({
  issue,
  boatName,
  submittedBy,
  photoFiles,
  quoteFiles,
  technicians,
  locale,
}: {
  issue: Issue;
  boatName: string;
  submittedBy: string;
  photoFiles: { id: string; url: string }[];
  quoteFiles: { id: string; url: string }[];
  technicians: Technician[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [editing, setEditing] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [dateValue, setDateValue] = useState(issue.issue_date ?? "");
  const [classificationValue, setClassificationValue] = useState(issue.classification);
  const [areaValue, setAreaValue] = useState(issue.area);

  const inputClass = "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm";
  const classificationLabels = Object.fromEntries(CLASSIFICATIONS.map((k) => [k, classificationDisplayLabel(locale, k)])) as Record<
    IssueClassification,
    string
  >;
  const areaLabels = Object.fromEntries(AREAS.map((k) => [k, areaDisplayLabel(locale, k)])) as Record<IssueArea, string>;

  return (
    <div className="rounded-xl border border-fleet-border bg-white p-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
          <Wrench size={16} className="text-fleet-brass" />
        </div>
        <div className="min-w-0 flex-1">
          {!editing ? (
            <>
              <div className="text-sm font-bold">{issue.title}</div>
              <div className="text-xs text-fleet-ink">
                {boatName} · {classificationDisplayLabel(locale, issue.classification)} · {areaDisplayLabel(locale, issue.area)}
                {issue.location ? ` · ${issue.location}` : ""}
                {issue.issue_date ? (
                  <>
                    {" · "}
                    <span dir="ltr">{formatDateDisplay(issue.issue_date)}</span>
                  </>
                ) : (
                  ` · ${t("not_set_yet")}`
                )}
              </div>
              {(issue.supplier || issue.supplier_labour) && (
                <div className="mt-0.5 text-xs text-fleet-ink">
                  {[issue.supplier, issue.supplier_labour].filter(Boolean).join(" · ")}
                </div>
              )}
              {issue.notes && <div className="mt-0.5 text-xs text-fleet-ink italic">{issue.notes}</div>}
              <div className="mt-0.5 text-2xs text-fleet-ink/70">
                {t("submitted_by")} {submittedBy}
              </div>
            </>
          ) : (
            <form
              id={`approve-edit-issue-${issue.id}`}
              action={async (formData) => {
                await updateAndApproveIssue(issue.boat_id, issue.id, formData);
                setEditing(false);
              }}
              className="flex flex-col gap-2"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs text-fleet-ink">{t("issue_title_f")}</label>
                <input name="title" required defaultValue={issue.title} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-fleet-ink">{t("date")}</label>
                <DateInput name="issue_date" value={dateValue} onChange={setDateValue} locale={locale} className={inputClass} allowClear />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-fleet-ink">{t("issue_classification")}</label>
                  <CustomSelect
                    name="classification"
                    value={classificationValue}
                    onChange={(v) => setClassificationValue(v as IssueClassification)}
                    options={CLASSIFICATIONS.map((k) => ({ value: k, label: classificationLabels[k] }))}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-fleet-ink">{t("issue_area")}</label>
                  <CustomSelect
                    name="area"
                    value={areaValue}
                    onChange={(v) => setAreaValue(v as IssueArea)}
                    options={AREAS.map((k) => ({ value: k, label: areaLabels[k] }))}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-fleet-ink">{t("issue_location")}</label>
                <input name="location" defaultValue={issue.location ?? ""} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-fleet-ink">{t("issue_supplier_parts")}</label>
                <TechnicianSelect
                  name="supplier"
                  defaultValue={issue.supplier ?? ""}
                  technicians={technicians}
                  locale={locale}
                  className={inputClass}
                  isManagement
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-fleet-ink">{t("issue_supplier_labour")}</label>
                <TechnicianSelect
                  name="supplier_labour"
                  defaultValue={issue.supplier_labour ?? ""}
                  technicians={technicians}
                  locale={locale}
                  className={inputClass}
                  isManagement
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-fleet-ink">{t("details")}</label>
                <textarea name="notes" rows={2} defaultValue={issue.notes ?? ""} className={inputClass} />
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-sm text-fleet-navy">
                <input type="checkbox" name="is_warranty" defaultChecked={issue.is_warranty} className="h-4 w-4" />
                <ShieldCheck size={16} className="text-fleet-brass" /> {t("issue_is_warranty_label")}
              </label>
            </form>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-label="edit"
          className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
        >
          <Pencil size={16} />
        </button>
      </div>

      {(photoFiles.length > 0 || quoteFiles.length > 0) && (
        <div className="mt-2 flex gap-2">
          <AttachmentGroup files={photoFiles} icon={<Camera size={14} />} label={t("view_photo")} onOpen={setLightboxUrl} />
          <AttachmentGroup files={quoteFiles} icon={<FileText size={14} />} label={t("quote_word")} onOpen={setLightboxUrl} />
        </div>
      )}

      <div className="mt-2.5 flex gap-2">
        {editing ? (
          <>
            <button
              type="submit"
              form={`approve-edit-issue-${issue.id}`}
              className="flex-1 rounded-lg bg-fleet-teal py-2 text-xs font-bold text-white"
            >
              {t("save_and_approve")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-lg border border-fleet-border py-2 text-xs font-bold text-fleet-ink"
            >
              {t("cancel_word")}
            </button>
          </>
        ) : (
          <>
            <form action={approveIssue.bind(null, issue.boat_id, issue.id)} className="flex-1">
              <button type="submit" className="w-full rounded-lg bg-fleet-teal py-2 text-xs font-bold text-white">
                {t("approve")}
              </button>
            </form>
            <form action={deleteIssue.bind(null, issue.boat_id, issue.id, issue.photo_path, issue.quote_path)} className="flex-1">
              <ConfirmSubmitButton
                locale={locale}
                confirmMessage={t("approvals_reject_confirm")}
                className="w-full rounded-lg border border-fleet-coral py-2 text-xs font-bold text-fleet-coral-text"
              >
                {t("reject")}
              </ConfirmSubmitButton>
            </form>
          </>
        )}
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="close"
            className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={16} />
          </button>
          {isPdfUrl(lightboxUrl) ? (
            <iframe src={`${lightboxUrl}#view=FitH`} title="attachment" className="h-[85vh] w-[90vw] rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightboxUrl} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  );
}
