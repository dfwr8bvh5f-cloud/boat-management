"use client";

import { useRef, useState } from "react";
import { FileText, Plus, Sparkles, Upload, X } from "lucide-react";
import { createMybaContract, createMybaUploadUrl } from "@/lib/actions/bookings";
import { createClient } from "@/lib/supabase/client";
import { DateInput } from "@/components/date-input";
import { RippleLoader } from "@/components/ripple-loader";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { useFileDrop } from "@/lib/use-file-drop";
import { ClearFileButton } from "@/components/clear-file-button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { INPUT_CLASS } from "@/lib/ui-classes";

type ScanResult = {
  customer_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  sailing_area?: string | null;
  departure_port?: string | null;
  arrival_port?: string | null;
  fee_amount?: number | null;
  deposit_amount?: number | null;
  payment_date?: string | null;
  booking_reference?: string | null;
};

const inputClass = INPUT_CLASS;

export function MybaContractForm({ boatId, locale }: { boatId: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLInputElement>(null);
  const departureRef = useRef<HTMLInputElement>(null);
  const arrivalRef = useRef<HTMLInputElement>(null);
  const feeRef = useRef<HTMLInputElement>(null);
  const depositRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [contractFiles, setContractFiles] = useState<{ path: string; name: string }[]>([]);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanOk, setScanOk] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // The file is uploaded directly from the browser to Supabase Storage
  // (bypassing our server entirely) so large scanned contracts don't hit
  // the ~4.5MB request-body limit Vercel imposes on server actions/routes.
  // AI auto-fill is still attempted afterwards, but only for files small
  // enough to send to the scan endpoint, and only for the first file
  // picked - a contract can span several files (extra pages, an
  // addendum), and only the primary one should drive the form's fields.
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const isFirstFile = contractFiles.length === 0;
    setScanOk(false);
    setUploading(true);
    setScanMsg(null);
    let path: string;
    try {
      const uploaded = await createMybaUploadUrl(boatId, file.name);
      path = uploaded.path;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("documents").uploadToSignedUrl(path, uploaded.token, file);
      if (uploadError) throw uploadError;
      setContractFiles((prev) => [...prev, { path, name: file.name }]);
    } catch (e) {
      // A signed-out session makes requireProfile() throw Next's special
      // redirect signal rather than a real error - let it propagate so the
      // framework actually sends the user to /login instead of showing a
      // generic "upload failed" message while stranding them on this page.
      if (e && typeof e === "object" && "digest" in e && typeof e.digest === "string" && e.digest.startsWith("NEXT_REDIRECT")) {
        throw e;
      }
      setScanMsg(t("upload_failed"));
      setUploading(false);
      return;
    }
    setUploading(false);

    if (!isFirstFile) return;

    if (file.size > MAX_SCAN_FILE_BYTES) {
      setScanMsg(t("scan_file_too_large_uploaded"));
      return;
    }

    setScanning(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/scan-myba-contract", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanOk(false);
        setScanMsg(data.error ?? t("scan_fail"));
        return;
      }
      const result: ScanResult = data.result ?? {};
      if (result.customer_name && nameRef.current) nameRef.current.value = result.customer_name;
      if (result.start_date) setStartDate(result.start_date);
      if (result.end_date) setEndDate(result.end_date);
      if (result.sailing_area && areaRef.current) areaRef.current.value = result.sailing_area;
      if (result.departure_port && departureRef.current) departureRef.current.value = result.departure_port;
      if (result.arrival_port && arrivalRef.current) arrivalRef.current.value = result.arrival_port;
      if (result.fee_amount != null && feeRef.current) feeRef.current.value = String(result.fee_amount);
      if (result.deposit_amount != null && depositRef.current) depositRef.current.value = String(result.deposit_amount);
      if (result.payment_date) setPaymentDate(result.payment_date);
      if (result.booking_reference && refRef.current) refRef.current.value = result.booking_reference;
      setScanOk(true);
      setScanMsg(t("scan_ok"));
    } catch {
      setScanOk(false);
      setScanMsg(t("scan_connect_fail"));
    } finally {
      setScanning(false);
    }
  };

  const busy = uploading || scanning;
  const { dragging, dropHandlers } = useFileDrop(onFile);

  return (
    <div className="flex justify-end">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full border border-fleet-brass px-4 py-2 text-sm font-semibold text-fleet-navy hover:bg-fleet-paper"
        >
          + {t("add_myba_contract")}
        </button>
      ) : (
        <form
          action={async (formData) => {
            setSaving(true);
            const result = await createMybaContract(boatId, formData);
            setSaving(false);
            if (result.error) {
              setScanOk(false);
              setScanMsg(result.error);
              return;
            }
            setSaved(true);
            setTimeout(() => {
              setSaved(false);
              setOpen(false);
              setScanMsg(null);
              setContractFiles([]);
            }, 1400);
          }}
          className="flex w-full flex-col gap-2.5 rounded-xl border border-fleet-border bg-white p-4"
        >
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <FileText size={16} className="text-fleet-brass" /> {t("add_myba_contract")}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="flex items-center gap-1 text-xs text-fleet-ink">
              <X size={14} /> {t("close_word")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            {...dropHandlers}
            className={`relative flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm disabled:opacity-60 ${
              dragging
                ? "border-fleet-teal bg-fleet-teal/10 text-fleet-navy"
                : contractFiles.length > 0
                  ? "border-fleet-moss bg-fleet-moss/10 text-fleet-moss-text"
                  : "border-fleet-brass bg-fleet-paper text-fleet-navy"
            }`}
          >
            {busy ? <Sparkles size={16} className="animate-twinkle" /> : <Upload size={16} />}
            {uploading ? t("uploading_word") : scanning ? t("scanning") : contractFiles.length > 0 ? t("add_another_file") : t("myba_upload_cta")}
            {dragging && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                <Plus size={16} className="text-fleet-teal" />
              </span>
            )}
          </button>
          {contractFiles.length > 0 && (
            <div className="flex flex-col gap-1">
              {contractFiles.map((f, i) => (
                <div
                  key={f.path}
                  className="flex items-center gap-2 rounded-lg border border-fleet-moss bg-fleet-moss/10 px-3 py-1.5 text-xs text-fleet-moss-text"
                >
                  <FileText size={14} className="shrink-0" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <ClearFileButton
                    onClear={() => setContractFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    label={t("remove_word")}
                  />
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          {contractFiles.map((f) => (
            <input key={f.path} type="hidden" name="contract_path" value={f.path} />
          ))}
          {scanMsg && (
            <div className={`flex items-center gap-1 text-xs ${scanOk ? "text-fleet-moss-text" : "text-fleet-coral-text"}`}>
              <Sparkles size={14} /> {scanMsg}
            </div>
          )}
          <input ref={nameRef} name="customer_name" placeholder={`${t("myba_customer_name")} *`} required className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <DateInput name="start_date" value={startDate} onChange={setStartDate} locale={locale} className={inputClass} />
            <DateInput name="end_date" value={endDate} onChange={setEndDate} locale={locale} className={inputClass} />
          </div>
          <input ref={areaRef} name="sailing_area" placeholder={t("booking_area")} className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <input ref={departureRef} name="departure_port" placeholder={t("booking_departure_port")} className={inputClass} />
            <input ref={arrivalRef} name="arrival_port" placeholder={t("booking_arrival_port")} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input ref={feeRef} name="fee_amount" type="number" step="0.01" placeholder={t("myba_fee")} className={inputClass} />
            <input ref={depositRef} name="deposit_amount" type="number" step="0.01" placeholder={t("myba_deposit")} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DateInput name="payment_date" value={paymentDate} onChange={setPaymentDate} locale={locale} className={inputClass} />
            <input ref={refRef} name="booking_reference" placeholder={t("myba_reference")} className={inputClass} />
          </div>
          <p className="rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-xs text-fleet-ink">
            {t("myba_info")}
          </p>
          <button
            type="submit"
            disabled={contractFiles.length === 0 || busy || saving || saved}
            className="flex items-center justify-center gap-2 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RippleLoader size="sm" /> {t("saving_word")}
              </>
            ) : saved ? (
              <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
            ) : (
              t("save_contract")
            )}
          </button>
        </form>
      )}
    </div>
  );
}
