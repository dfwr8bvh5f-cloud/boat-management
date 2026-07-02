"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, Clock, Pencil, Receipt, Trash2, Wrench, XCircle } from "lucide-react";
import { createIssue, updateIssue, deleteIssue, approveIssue, cycleIssueOpStatus } from "@/lib/actions/issues";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  AREAS,
  getAreaLabels,
  CLASSIFICATIONS,
  getClassificationLabels,
  OP_STATUS_COLORS,
  getOpStatusLabels,
  getPaymentLabels,
  PAYMENT_METHODS,
} from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Issue, IssueOpStatus } from "@/lib/types/database";

type IssueWithUrls = Issue & { photoUrl: string | null; quoteUrl: string | null };

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

const OP_STATUS_ICON: Record<IssueOpStatus, typeof Wrench> = {
  not_started: Wrench,
  pending: Clock,
  in_progress: Clock,
  completed: CheckCircle2,
  cancelled: XCircle,
};

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
  const paymentLabels = getPaymentLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<IssueWithUrls | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const quoteRef = useRef<HTMLInputElement>(null);

  const startEdit = (issue: IssueWithUrls) => {
    setEditing(issue);
    setShowForm(true);
  };
  const startNew = () => {
    setEditing(null);
    setShowForm((s) => (editing ? true : !s));
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const formAction = editing ? updateIssue.bind(null, boatId, editing.id) : createIssue.bind(null, boatId);

  return (
    <div className="flex flex-col gap-4">
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
            <label className="text-xs text-fleet-ink">{t("issue_supplier")}</label>
            <input name="supplier" defaultValue={editing?.supplier ?? ""} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("issue_quote")}</label>
            <input ref={quoteRef} type="file" name="quote" accept="image/*" className="hidden" />
            <button
              type="button"
              onClick={() => quoteRef.current?.click()}
              className="flex w-fit items-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy"
            >
              <Receipt size={15} /> {editing?.quoteUrl ? t("replace_file_optional") : t("issue_quote_upload")}
            </button>
            {editing?.quoteUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={editing.quoteUrl} alt="" className="mt-1 max-h-24 rounded-lg border border-fleet-border" />
            )}
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
              <label className="text-xs text-fleet-ink">{t("payment_method")}</label>
              <select name="payment_method" defaultValue={editing?.payment_method ?? ""} className={inputClass}>
                <option value="">—</option>
                {PAYMENT_METHODS.map((k) => (
                  <option key={k} value={k}>
                    {paymentLabels[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("issue_due_date")}</label>
              <input name="due_date" type="date" defaultValue={editing?.due_date ?? ""} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("issue_assigned_to")}</label>
              <input name="assigned_to" defaultValue={editing?.assigned_to ?? ""} className={inputClass} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("details")}</label>
            <textarea name="notes" rows={3} defaultValue={editing?.notes ?? ""} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("photo")}</label>
            <input ref={photoRef} type="file" name="photo" accept="image/*" className="hidden" />
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              className="flex w-fit items-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy"
            >
              <Camera size={15} /> {editing?.photoUrl ? t("photo_replace_optional") : t("upload_photo")}
            </button>
            {editing?.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={editing.photoUrl} alt="" className="mt-1 max-h-24 rounded-lg border border-fleet-border" />
            )}
          </div>
          <button
            type="submit"
            className="mt-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            {editing ? t("save_edit") : t("report_issue")}
          </button>
        </form>
      )}

      {issues.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("no_issues")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {issues.map((issue) => {
            const StatusIcon = OP_STATUS_ICON[issue.op_status];
            const metaLine = [
              classificationLabels[issue.classification],
              areaLabels[issue.area],
              issue.location,
            ]
              .filter(Boolean)
              .join(" · ");
            const metaLine2 = [
              issue.supplier,
              issue.estimated_cost != null ? `€${issue.estimated_cost.toLocaleString("he-IL")}` : null,
              issue.due_date,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <div key={issue.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
                {issue.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={issue.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
                    <Wrench size={18} className="text-fleet-brass" />
                  </div>
                )}
                <div className="min-w-[140px] flex-1">
                  <div className="text-sm font-semibold">{issue.title}</div>
                  {metaLine && <div className="text-xs text-fleet-ink">{metaLine}</div>}
                  {metaLine2 && <div className="text-xs text-fleet-ink">{metaLine2}</div>}
                  {issue.notes && <div className="mt-0.5 text-xs text-fleet-ink">{issue.notes}</div>}
                  <div className="mt-1 flex items-center gap-2">
                    {issue.quoteUrl && (
                      <a
                        href={issue.quoteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-fleet-teal underline"
                      >
                        <Receipt size={12} /> {t("quote_word")}
                      </a>
                    )}
                    <StatusBadge value={issue.status} />
                  </div>
                </div>
                {canCycle ? (
                  <form action={cycleIssueOpStatus.bind(null, boatId, issue.id, issue.op_status)}>
                    <button
                      type="submit"
                      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${OP_STATUS_COLORS[issue.op_status]}`}
                    >
                      <StatusIcon size={13} /> {opStatusLabels[issue.op_status]}
                    </button>
                  </form>
                ) : (
                  <span
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${OP_STATUS_COLORS[issue.op_status]}`}
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
          })}
        </div>
      )}
    </div>
  );
}
