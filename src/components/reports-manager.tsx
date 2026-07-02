"use client";

import { useState } from "react";
import { ChevronDown, FileBarChart, Trash2, Wrench } from "lucide-react";
import { issueFinancialReport, issueTechnicalReport, deleteReport } from "@/lib/actions/reports";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CATEGORY_LABELS, OP_STATUS_LABELS } from "@/lib/labels";
import type { FinancialSnapshot, Report, TechnicalSnapshot } from "@/lib/types/database";

function formatCurrency(n: number) {
  return `₪${n.toLocaleString("he-IL")}`;
}

export function ReportsManager({
  boatId,
  reports,
  issuerNames,
  isManagement,
}: {
  boatId: string;
  reports: Report[];
  issuerNames: Record<string, string>;
  isManagement: boolean;
}) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = [...reports].sort((a, b) => b.month.localeCompare(a.month) || b.issued_at.localeCompare(a.issued_at));

  return (
    <div className="flex flex-col gap-4">
      {isManagement && (
        <div className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <label className="flex flex-col gap-1 text-xs text-fleet-ink">
            חודש
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-fleet-border px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await issueFinancialReport(boatId, month);
                } finally {
                  setBusy(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              <FileBarChart size={15} /> הנפק דוח פיננסי
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await issueTechnicalReport(boatId, month);
                } finally {
                  setBusy(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-fleet-navy py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              <Wrench size={15} /> הנפק דוח טכני
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          טרם הונפקו דוחות.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((r) => {
            const isOpen = openId === r.id;
            const Icon = r.type === "financial" ? FileBarChart : Wrench;
            return (
              <div key={r.id} className="rounded-xl border border-fleet-border bg-white p-3">
                <button onClick={() => setOpenId(isOpen ? null : r.id)} className="flex w-full items-center gap-2.5 text-start">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
                    <Icon size={17} className="text-fleet-brass" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold">
                      {r.type === "financial" ? "דוח פיננסי חודשי" : "דוח טכני חודשי"} — {r.month}
                    </div>
                    <div className="text-[11px] text-fleet-ink">
                      הונפק על ידי {issuerNames[r.issued_by ?? ""] ?? "—"} · {r.issued_at.slice(0, 10)}
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-fleet-brass transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                </button>

                {isOpen && (
                  <div className="mt-3 border-t border-dashed border-fleet-border pt-3">
                    {r.type === "financial" ? (
                      <FinancialReportBody snapshot={r.snapshot as FinancialSnapshot} />
                    ) : (
                      <TechnicalReportBody snapshot={r.snapshot as TechnicalSnapshot} />
                    )}
                    {isManagement && (
                      <form action={deleteReport.bind(null, boatId, r.id)} className="mt-2.5">
                        <ConfirmSubmitButton
                          confirmMessage="למחוק את הדוח?"
                          className="flex items-center gap-1 text-xs font-medium text-fleet-coral"
                        >
                          <Trash2 size={13} /> מחק
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FinancialReportBody({ snapshot }: { snapshot: FinancialSnapshot }) {
  return (
    <div>
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-fleet-paper p-2.5">
          <div className="text-[11px] text-fleet-ink">הכנסות</div>
          <div className="text-base font-bold text-fleet-moss">{formatCurrency(snapshot.totalIncome)}</div>
        </div>
        <div className="rounded-lg bg-fleet-paper p-2.5">
          <div className="text-[11px] text-fleet-ink">הוצאות</div>
          <div className="text-base font-bold text-fleet-coral">{formatCurrency(snapshot.totalExpenses)}</div>
        </div>
      </div>
      <div className="mb-2 text-sm">
        תזרים נטו: <b>{formatCurrency(snapshot.net)}</b>
      </div>
      <div className="mb-2 text-sm">
        משיכות: {formatCurrency(snapshot.cashWithdrawals)} · שימוש: {formatCurrency(snapshot.cashUsage)}
      </div>
      {snapshot.byCategory.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs text-fleet-ink">סה״כ הוצאות לפי קטגוריה</div>
          {snapshot.byCategory.map((c) => (
            <div key={c.category} className="flex justify-between border-b border-dotted border-fleet-border py-1 text-sm">
              <span>{CATEGORY_LABELS[c.category]}</span>
              <span>{formatCurrency(c.sum)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TechnicalReportBody({ snapshot }: { snapshot: TechnicalSnapshot }) {
  return (
    <div>
      <div className="mb-2.5 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-fleet-paper p-2.5">
          <div className="text-[11px] text-fleet-ink">תקלות חדשות</div>
          <div className="text-base font-bold">{snapshot.newIssues}</div>
        </div>
        <div className="rounded-lg bg-fleet-paper p-2.5">
          <div className="text-[11px] text-fleet-ink">טופלו החודש</div>
          <div className="text-base font-bold text-fleet-moss">{snapshot.resolvedThisMonth}</div>
        </div>
        <div className="rounded-lg bg-fleet-paper p-2.5">
          <div className="text-[11px] text-fleet-ink">עדיין פתוחות</div>
          <div className={`text-base font-bold ${snapshot.stillOpen > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
            {snapshot.stillOpen}
          </div>
        </div>
      </div>
      {snapshot.issueList.length > 0 && (
        <div className="mb-2">
          {snapshot.issueList.map((i, idx) => (
            <div key={idx} className="border-b border-dotted border-fleet-border py-1 text-sm">
              {i.title} — {OP_STATUS_LABELS[i.status]}
            </div>
          ))}
        </div>
      )}
      {snapshot.docAlerts.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-bold text-fleet-coral">פג תוקף בקרוב</div>
          {snapshot.docAlerts.map((d, idx) => (
            <div key={idx} className="border-b border-dotted border-fleet-border py-1 text-sm">
              {d.name} — {d.expiryDate}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
