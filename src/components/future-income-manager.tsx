"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Eye, Pencil, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import {
  approveIncome,
  createCharterFutureIncome,
  createCharterUploadUrl,
  deleteIncome,
  updateCharterFutureIncome,
} from "@/lib/actions/incomes";
import { createClient } from "@/lib/supabase/client";
import { DateInput } from "@/components/date-input";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ClearFileButton } from "@/components/clear-file-button";
import { RippleLoader } from "@/components/ripple-loader";
import { useFileDrop } from "@/lib/use-file-drop";
import { formatDateDisplay } from "@/lib/date-format";
import { formatCurrency, formatCurrencySigned } from "@/lib/money";
import { computeCharterBreakdown, charterPhase, parseCharterText } from "@/lib/charter-income";
import { TRIP_UPCOMING_COLOR, TRIP_UPCOMING_TEXT_COLOR } from "@/lib/labels";
import { MYBA_CONTRACT_NAME_PREFIX, MYBA_DEPOSIT_SOURCE_PREFIX } from "@/lib/balances";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { INPUT_CLASS } from "@/lib/ui-classes";
import type { Income } from "@/lib/types/database";

const inputClass = INPUT_CLASS;

export type FutureIncomeRow = Income & { contractUrl: string | null };

type ParseResult = {
  charter_code?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  embarkation_port?: string | null;
  disembarkation_port?: string | null;
  gross_price?: number | null;
  net_price_to_owner?: number | null;
};

export function FutureIncomeManager({
  boatId,
  incomes,
  vatRate,
  isManagement,
  canEdit,
  locale,
}: {
  boatId: string;
  incomes: FutureIncomeRow[];
  vatRate: number;
  isManagement: boolean;
  canEdit: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const today = new Date().toISOString().slice(0, 10);
  const vatPercentLabel = (vatRate * 100).toFixed(1).replace(/\.0$/, "");

  // Charters are booked well ahead, so the list needs a season/year split -
  // otherwise a season she's just starting to book (e.g. 2027) gets buried
  // among the current one. Always offers this year and next, plus any other
  // year that already has rows (older or further-out seasons).
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const set = new Set<number>([currentYear, currentYear + 1]);
    for (const i of incomes) {
      const y = Number(i.income_date?.slice(0, 4));
      if (!Number.isNaN(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [incomes]);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const yearIncomes = useMemo(
    () => incomes.filter((i) => Number(i.income_date?.slice(0, 4)) === selectedYear),
    [incomes, selectedYear]
  );
  const total = yearIncomes.reduce((s, i) => s + i.amount, 0);

  const [open, setOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const [parseOk, setParseOk] = useState(false);
  const [charterCode, setCharterCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [embarkationPort, setEmbarkationPort] = useState("");
  const [disembarkationPort, setDisembarkationPort] = useState("");
  const [grossPrice, setGrossPrice] = useState("");
  const [netPriceToOwner, setNetPriceToOwner] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [redeliveryFee, setRedeliveryFee] = useState("");
  const [apa, setApa] = useState("");
  const [contractPath, setContractPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Agent commission isn't a fixed rate (some charters have none, some
  // deduct extra VAT on top of it) - so it's derived here from what she
  // actually typed for gross vs. net, purely as a live sanity check before
  // saving (does the implied agent-side deduction look right?).
  const preview = useMemo(() => {
    const gross = Number(grossPrice) || 0;
    const net = Number(netPriceToOwner) || 0;
    if (!gross || !net) return null;
    return computeCharterBreakdown({
      grossPrice: gross,
      netToOwner: net,
      vatRate,
      deliveryFee: Number(deliveryFee) || 0,
      redeliveryFee: Number(redeliveryFee) || 0,
    });
  }, [grossPrice, netPriceToOwner, deliveryFee, redeliveryFee, vatRate]);

  const resetForm = () => {
    setPasteText("");
    setParseMsg(null);
    setParseOk(false);
    setCharterCode("");
    setStartDate("");
    setEndDate("");
    setEmbarkationPort("");
    setDisembarkationPort("");
    setGrossPrice("");
    setNetPriceToOwner("");
    setDeliveryFee("");
    setRedeliveryFee("");
    setApa("");
    setContractPath(null);
    setFormError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const runParse = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    setParseMsg(null);

    // Deterministic pass first (see parseCharterText's own comment) - fills
    // in whatever it can find on its own, with zero dependency on the AI
    // endpoint actually succeeding. The AI call below only ever fills in
    // fields this pass left empty.
    const local = parseCharterText(pasteText);
    if (local.charter_code) setCharterCode(local.charter_code);
    if (local.start_date) setStartDate(local.start_date);
    if (local.end_date) setEndDate(local.end_date);
    if (local.embarkation_port) setEmbarkationPort(local.embarkation_port);
    if (local.disembarkation_port) setDisembarkationPort(local.disembarkation_port);
    if (local.gross_price != null) setGrossPrice(String(local.gross_price));
    if (local.net_price_to_owner != null) setNetPriceToOwner(String(local.net_price_to_owner));

    const foundLocally = Boolean(local.charter_code && local.start_date && local.end_date && local.gross_price != null);
    if (foundLocally) {
      setParseOk(true);
      setParseMsg(t("scan_ok"));
      setParsing(false);
      return;
    }

    try {
      const res = await fetch("/api/parse-charter-text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        // The deterministic pass above may still have filled something in
        // even though the AI call failed - only report a hard failure if
        // nothing at all was found either way.
        if (local.charter_code || local.start_date || local.gross_price != null) {
          setParseOk(true);
          setParseMsg(t("scan_ok"));
        } else {
          setParseOk(false);
          setParseMsg(data.error ?? t("scan_fail"));
        }
        return;
      }
      const result: ParseResult = data.result ?? {};
      if (!local.charter_code && result.charter_code) setCharterCode(String(result.charter_code));
      if (!local.start_date && result.start_date) setStartDate(result.start_date);
      if (!local.end_date && result.end_date) setEndDate(result.end_date);
      if (!local.embarkation_port && result.embarkation_port) setEmbarkationPort(String(result.embarkation_port));
      if (!local.disembarkation_port && result.disembarkation_port) setDisembarkationPort(String(result.disembarkation_port));
      if (local.gross_price == null && result.gross_price != null) setGrossPrice(String(result.gross_price));
      if (local.net_price_to_owner == null && result.net_price_to_owner != null) setNetPriceToOwner(String(result.net_price_to_owner));
      setParseOk(true);
      setParseMsg(t("scan_ok"));
    } catch {
      if (local.charter_code || local.start_date || local.gross_price != null) {
        setParseOk(true);
        setParseMsg(t("scan_ok"));
      } else {
        setParseOk(false);
        setParseMsg(t("scan_connect_fail"));
      }
    } finally {
      setParsing(false);
    }
  };

  // Direct-to-storage upload (bypasses the server-action body-size limit),
  // same pattern as MybaContractForm - but unlike that flow, there's no AI
  // scan of the file itself here: it's a plain attachment, and the AI
  // extraction happens separately from the pasted text above.
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setContractPath(null);
    setUploading(true);
    setFormError(null);
    try {
      const { path, token } = await createCharterUploadUrl(boatId, file.name);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("documents").uploadToSignedUrl(path, token, file);
      if (uploadError) throw uploadError;
      setContractPath(path);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e && typeof e.digest === "string" && e.digest.startsWith("NEXT_REDIRECT")) {
        throw e;
      }
      setFormError(t("upload_failed"));
    } finally {
      setUploading(false);
    }
  };

  const { dragging, dropHandlers } = useFileDrop(onFile);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setSelectedYear(y)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              y === selectedYear ? "border-fleet-teal bg-fleet-teal text-white" : "border-fleet-border text-fleet-navy hover:bg-fleet-paper"
            }`}
          >
            {t("future_season", { year: y })}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-fleet-border bg-white p-4">
        <div className="text-xs text-fleet-ink">{t("future_total")}</div>
        <div className="mt-1 text-xl font-bold text-fleet-teal">{formatCurrency(total)}</div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
            >
              <span className="inline-flex items-center gap-1">
                <Plus size={14} /> {t("add_future")}
              </span>
            </button>
          ) : (
            <form
              action={async (formData) => {
                setSubmitting(true);
                setFormError(null);
                formData.set("contract_path", contractPath ?? "");
                const result = await createCharterFutureIncome(boatId, formData);
                setSubmitting(false);
                if (result.error) {
                  setFormError(result.error);
                  return;
                }
                setOpen(false);
                resetForm();
              }}
              className="flex w-full flex-col gap-2.5 rounded-xl border border-fleet-border bg-white p-4"
            >
              <div className="mb-1 flex items-center justify-between">
                <div className="text-sm font-bold text-fleet-navy">{t("add_future")}</div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                  className="flex items-center gap-1 text-xs text-fleet-ink"
                >
                  <X size={14} /> {t("close_word")}
                </button>
              </div>

              <label className="flex flex-col gap-1 text-xs text-fleet-ink">
                {t("charter_paste_label")}
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} className={inputClass} />
              </label>
              <button
                type="button"
                onClick={runParse}
                disabled={parsing || !pasteText.trim()}
                className="flex w-fit items-center gap-1.5 rounded-lg border border-fleet-teal px-3 py-1.5 text-xs font-bold text-fleet-teal disabled:opacity-50"
              >
                <Sparkles size={14} className={parsing ? "animate-twinkle" : undefined} /> {t("charter_paste_button")}
              </button>
              {parseMsg && <div className={`text-xs ${parseOk ? "text-fleet-moss-text" : "text-fleet-coral-text"}`}>{parseMsg}</div>}

              <input
                name="charter_code"
                value={charterCode}
                onChange={(e) => setCharterCode(e.target.value)}
                placeholder={`${t("charter_code")} *`}
                required
                className={inputClass}
              />
              <div className="grid grid-cols-2 gap-2">
                <DateInput name="start_date" value={startDate} onChange={setStartDate} locale={locale} className={inputClass} />
                <DateInput name="end_date" value={endDate} onChange={setEndDate} locale={locale} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  name="embarkation_port"
                  value={embarkationPort}
                  onChange={(e) => setEmbarkationPort(e.target.value)}
                  placeholder={t("embarkation_port")}
                  className={inputClass}
                />
                <input
                  name="disembarkation_port"
                  value={disembarkationPort}
                  onChange={(e) => setDisembarkationPort(e.target.value)}
                  placeholder={t("disembarkation_port")}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  name="gross_price"
                  type="number"
                  step="0.01"
                  value={grossPrice}
                  onChange={(e) => setGrossPrice(e.target.value)}
                  placeholder={`${t("gross_price")} *`}
                  required
                  className={inputClass}
                />
                <input
                  name="net_price_to_owner"
                  type="number"
                  step="0.01"
                  value={netPriceToOwner}
                  onChange={(e) => setNetPriceToOwner(e.target.value)}
                  placeholder={`${t("net_price_to_owner")} *`}
                  required
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  name="delivery_fee"
                  type="number"
                  step="0.01"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  placeholder={t("delivery_fee")}
                  className={inputClass}
                />
                <input
                  name="redelivery_fee"
                  type="number"
                  step="0.01"
                  value={redeliveryFee}
                  onChange={(e) => setRedeliveryFee(e.target.value)}
                  placeholder={t("redelivery_fee")}
                  className={inputClass}
                />
                <input name="apa" type="number" step="0.01" value={apa} onChange={(e) => setApa(e.target.value)} placeholder={t("apa_field")} className={inputClass} />
              </div>

              {preview && (
                <div className="flex items-center justify-between rounded-lg border border-dashed border-fleet-border bg-fleet-paper px-3 py-2 text-xs text-fleet-ink">
                  <span>{t("commission_total")}</span>
                  <span dir="ltr">{formatCurrencySigned(preview.totalCommission)}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  {...dropHandlers}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm disabled:opacity-60 ${
                    dragging
                      ? "border-fleet-teal bg-fleet-teal/10 text-fleet-navy"
                      : contractPath
                        ? "border-fleet-moss bg-fleet-moss/10 text-fleet-moss-text"
                        : "border-fleet-brass bg-fleet-paper text-fleet-navy"
                  }`}
                >
                  {uploading ? <Sparkles size={16} className="animate-twinkle" /> : contractPath ? <Check size={16} /> : <Upload size={16} />}{" "}
                  {uploading ? t("uploading_word") : contractPath ? t("file_uploaded") : t("doc_myba_contract")}
                </button>
                {contractPath && !uploading && (
                  <ClearFileButton
                    onClear={() => {
                      setContractPath(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    label={t("remove_word")}
                  />
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

              {formError && <p className="text-xs text-fleet-coral-text">{formError}</p>}

              <button
                type="submit"
                disabled={submitting || uploading}
                className="flex items-center justify-center gap-2 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting && <RippleLoader size="sm" />}
                {submitting ? t("uploading_word") : t("add_future")}
              </button>
            </form>
          )}
        </div>
      )}

      {yearIncomes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">{t("none_future")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {yearIncomes.map((i) => {
            const approveDeleteActions = (
              <>
                {isManagement && i.status === "pending" && (
                  <form action={approveIncome.bind(null, boatId, i.id)}>
                    <button type="submit" className="text-xs font-bold text-fleet-moss-text hover:underline">
                      {t("approve")}
                    </button>
                  </form>
                )}
                {(canEdit || (isManagement && i.status === "pending")) && (
                  <form action={deleteIncome.bind(null, boatId, i.id)}>
                    <ConfirmSubmitButton
                      locale={locale}
                      confirmMessage={t("delete_income_confirm")}
                      ariaLabel={t("delete_word")}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                    >
                      <Trash2 size={16} />
                    </ConfirmSubmitButton>
                  </form>
                )}
              </>
            );

            if (!i.charter_code) {
              // Pre-feature row: either a plain manual future-income entry,
              // or one created by the older MYBA-contract-in-Bookings-tab
              // flow (still active, untouched by this change) - those tag
              // source with a fixed Hebrew prefix that gets stripped and
              // relabeled per-locale here, exactly as this page always did.
              const label = i.source.startsWith(MYBA_CONTRACT_NAME_PREFIX)
                ? `${t("doc_myba_contract")} - ${i.source.slice(MYBA_CONTRACT_NAME_PREFIX.length)}`
                : i.source.startsWith(MYBA_DEPOSIT_SOURCE_PREFIX)
                  ? `${t("contract_deposit_label")} - ${i.source.slice(MYBA_DEPOSIT_SOURCE_PREFIX.length)}`
                  : i.source;
              return (
                <div key={i.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
                  <div className="flex-1">
                    <div className="text-sm">{label}</div>
                    <div className="text-xs text-fleet-ink" dir="ltr">
                      {formatDateDisplay(i.income_date)}
                    </div>
                  </div>
                  <StatusBadge value={i.status} locale={locale} />
                  <div className="font-bold text-fleet-teal">{formatCurrency(i.amount)}</div>
                  {approveDeleteActions}
                </div>
              );
            }

            const expanded = expandedIds.has(i.id);
            const breakdown = computeCharterBreakdown({
              grossPrice: i.gross_price ?? 0,
              netToOwner: i.amount,
              vatRate,
              deliveryFee: i.delivery_fee ?? 0,
              redeliveryFee: i.redelivery_fee ?? 0,
            });
            const phase = i.charter_end_date ? charterPhase(i.income_date, i.charter_end_date, today) : null;
            const durationDays = i.charter_end_date
              ? Math.round((new Date(i.charter_end_date).getTime() - new Date(i.income_date).getTime()) / 86400000)
              : null;
            // Agent commission is a derived residual (see charter-income.ts), not a fixed
            // rate, so the % shown next to it is computed per-charter from the actual
            // numbers rather than hardcoded - it varies charter to charter.
            const agentCommissionPercent = i.gross_price
              ? ((breakdown.agentCommissionBase / i.gross_price) * 100).toFixed(1).replace(/\.0$/, "")
              : "0";

            if (editingId === i.id) {
              return (
                <div key={i.id} className="rounded-xl border border-fleet-border bg-white p-3">
                  <form
                    action={async (formData) => {
                      setEditSubmitting(true);
                      setEditError(null);
                      const result = await updateCharterFutureIncome(boatId, i.id, formData);
                      setEditSubmitting(false);
                      if (result.error) {
                        setEditError(result.error);
                        return;
                      }
                      setEditingId(null);
                    }}
                    className="flex flex-col gap-2.5"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <div className="text-sm font-bold text-fleet-navy">{i.charter_code}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditError(null);
                        }}
                        className="flex items-center gap-1 text-xs text-fleet-ink"
                      >
                        <X size={14} /> {t("close_word")}
                      </button>
                    </div>
                    <input name="charter_code" defaultValue={i.charter_code} placeholder={`${t("charter_code")} *`} required className={inputClass} />
                    <div className="grid grid-cols-2 gap-2">
                      <DateInput name="start_date" defaultValue={i.income_date} locale={locale} className={inputClass} />
                      <DateInput name="end_date" defaultValue={i.charter_end_date ?? undefined} locale={locale} className={inputClass} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        name="embarkation_port"
                        defaultValue={i.embarkation_port ?? ""}
                        placeholder={t("embarkation_port")}
                        className={inputClass}
                      />
                      <input
                        name="disembarkation_port"
                        defaultValue={i.disembarkation_port ?? ""}
                        placeholder={t("disembarkation_port")}
                        className={inputClass}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        name="gross_price"
                        type="number"
                        step="0.01"
                        defaultValue={i.gross_price ?? ""}
                        placeholder={`${t("gross_price")} *`}
                        required
                        className={inputClass}
                      />
                      <input
                        name="net_price_to_owner"
                        type="number"
                        step="0.01"
                        defaultValue={i.amount}
                        placeholder={`${t("net_price_to_owner")} *`}
                        required
                        className={inputClass}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        name="delivery_fee"
                        type="number"
                        step="0.01"
                        defaultValue={i.delivery_fee ?? ""}
                        placeholder={t("delivery_fee")}
                        className={inputClass}
                      />
                      <input
                        name="redelivery_fee"
                        type="number"
                        step="0.01"
                        defaultValue={i.redelivery_fee ?? ""}
                        placeholder={t("redelivery_fee")}
                        className={inputClass}
                      />
                      <input name="apa" type="number" step="0.01" defaultValue={i.apa ?? ""} placeholder={t("apa_field")} className={inputClass} />
                    </div>
                    {editError && <p className="text-xs text-fleet-coral-text">{editError}</p>}
                    <button
                      type="submit"
                      disabled={editSubmitting}
                      className="flex items-center justify-center gap-2 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {editSubmitting && <RippleLoader size="sm" />}
                      {editSubmitting ? t("uploading_word") : t("save_word")}
                    </button>
                  </form>
                </div>
              );
            }

            return (
              <div key={i.id} className="rounded-xl border border-fleet-border bg-white p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(i.id)}
                    aria-label={t("details_word")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                  >
                    <ChevronDown size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  {i.contractUrl && (
                    <a
                      href={i.contractUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("doc_view")}
                      title={t("doc_view")}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-brass hover:text-fleet-navy"
                    >
                      <Eye size={16} />
                    </a>
                  )}
                  <div className="min-w-[160px] flex-1">
                    <div className="text-sm font-semibold">{i.charter_code}</div>
                    {i.gross_price != null && (
                      <div className="text-xs text-fleet-ink">
                        {t("gross_price")}: {formatCurrency(i.gross_price)}
                      </div>
                    )}
                    <div className="text-xs text-fleet-ink">
                      <span dir="ltr">
                        {formatDateDisplay(i.income_date)}
                        {i.charter_end_date ? ` – ${formatDateDisplay(i.charter_end_date)}` : ""}
                      </span>
                      {durationDays != null && ` (${t("charter_days", { count: durationDays })})`}
                    </div>
                    {(i.embarkation_port || i.disembarkation_port) && (
                      <div className="text-xs text-fleet-ink">
                        {i.embarkation_port}
                        {i.embarkation_port && i.disembarkation_port ? " → " : ""}
                        {i.disembarkation_port}
                      </div>
                    )}
                    <div className="font-bold text-fleet-teal">{formatCurrency(i.amount)}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {phase &&
                      (phase === "future" ? (
                        <span
                          style={{ color: TRIP_UPCOMING_TEXT_COLOR, background: `${TRIP_UPCOMING_COLOR}26` }}
                          className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-2xs font-bold"
                        >
                          {t("trip_status_future")}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-2xs font-bold ${
                            phase === "past" ? "text-fleet-coral-text bg-fleet-coral/15" : "text-fleet-moss-text bg-fleet-moss/15"
                          }`}
                        >
                          {t(`trip_status_${phase}`)}
                        </span>
                      ))}
                    <div className="flex items-center">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(i.id);
                            setEditError(null);
                            setExpandedIds((prev) => {
                              if (!prev.has(i.id)) return prev;
                              const next = new Set(prev);
                              next.delete(i.id);
                              return next;
                            });
                          }}
                          aria-label={t("update_word")}
                          title={t("update_word")}
                          className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      {approveDeleteActions}
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="ms-9 mt-2 flex max-w-xs flex-col gap-2 rounded-lg border border-fleet-border bg-fleet-paper/50 p-3 text-xs">
                    <BreakdownRow label={t("gross_price")} value={i.gross_price ?? 0} />
                    <BreakdownRow label={t("commission_total")} value={breakdown.totalCommission} />
                    <BreakdownRow label={t("agent_commission_15", { rate: agentCommissionPercent })} value={breakdown.agentCommissionBase} indent />
                    <BreakdownRow label={t("our_commission_5")} value={breakdown.ourCommission} indent />
                    <BreakdownRow label={t("charter_price_net")} value={breakdown.netCharterPrice} />
                    {!!i.delivery_fee && <BreakdownRow label={t("delivery_fee")} value={i.delivery_fee} />}
                    {!!i.redelivery_fee && <BreakdownRow label={t("redelivery_fee")} value={i.redelivery_fee} />}
                    {!!i.apa && <BreakdownRow label={t("apa_field")} value={i.apa} />}
                    <BreakdownRow label={t("vat_on_gross", { rate: vatPercentLabel })} value={breakdown.vatOnGross} />
                    {!!breakdown.vatOnAgentCommission && (
                      <BreakdownRow label={t("vat_on_agent_commission")} value={breakdown.vatOnAgentCommission} />
                    )}
                    <BreakdownRow label={t("vat_on_commission_24")} value={breakdown.vatOnOurCommission} />
                    <BreakdownRow label={t("breakdown_total")} value={breakdown.netToOwner} bold />
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

function BreakdownRow({ label, value, indent, bold }: { label: string; value: number; indent?: boolean; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${indent ? "ps-4" : ""} ${bold ? "font-bold text-fleet-navy" : "text-fleet-ink"}`}>
      <span>{label}</span>
      <span dir="ltr">{formatCurrencySigned(value)}</span>
    </div>
  );
}

