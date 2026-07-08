"use client";

import { useRef, useState } from "react";
import { FileText, Plus, Sparkles } from "lucide-react";
import { createMybaContract, createMybaUploadUrl } from "@/lib/actions/bookings";
import { createClient } from "@/lib/supabase/client";
import { DateInput } from "@/components/date-input";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { useFileDrop } from "@/lib/use-file-drop";
import { ClearFileButton } from "@/components/clear-file-button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

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

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

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
  const [contractPath, setContractPath] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanOk, setScanOk] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");

  // The file is uploaded directly from the browser to Supabase Storage
  // (bypassing our server entirely) so large scanned contracts don't hit
  // the ~4.5MB request-body limit Vercel imposes on server actions/routes.
  // AI auto-fill is still attempted afterwards, but only for files small
  // enough to send to the scan endpoint.
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setContractPath(null);
    setScanOk(false);
    setUploading(true);
    setScanMsg(null);
    try {
      const { path, token } = await createMybaUploadUrl(boatId, file.name);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("documents").uploadToSignedUrl(path, token, file);
      if (uploadError) throw uploadError;
      setContractPath(path);
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
            const result = await createMybaContract(boatId, formData);
            if (result.error) {
              setScanOk(false);
              setScanMsg(result.error);
              return;
            }
            setOpen(false);
            setScanMsg(null);
            setContractPath(null);
          }}
          className="flex w-full flex-col gap-2.5 rounded-xl border border-fleet-border bg-white p-4"
        >
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <FileText size={15} className="text-fleet-brass" /> {t("add_myba_contract")}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-fleet-ink">
              ✕ {t("close_word")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              {...dropHandlers}
              className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm disabled:opacity-60 ${
                dragging
                  ? "border-fleet-teal bg-fleet-teal/10 text-fleet-navy"
                  : contractPath
                    ? "border-fleet-moss bg-fleet-moss/10 text-fleet-moss"
                    : "border-fleet-brass bg-fleet-paper text-fleet-navy"
              }`}
            >
              <Sparkles size={15} className={busy ? "animate-twinkle" : undefined} />{" "}
              {uploading ? t("uploading_word") : scanning ? t("scanning") : contractPath ? t("file_uploaded") : t("myba_upload_cta")}
              {dragging && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                  <Plus size={18} className="text-fleet-teal" />
                </span>
              )}
            </button>
            {contractPath && !busy && (
              <ClearFileButton
                onClear={() => {
                  setContractPath(null);
                  setScanMsg(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                label={t("remove_word")}
              />
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <input type="hidden" name="contract_path" value={contractPath ?? ""} />
          {scanMsg && (
            <div className={`flex items-center gap-1 text-xs ${scanOk ? "text-fleet-moss" : "text-fleet-coral"}`}>
              <Sparkles size={12} /> {scanMsg}
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
            disabled={!contractPath || busy}
            className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {t("save_contract")}
          </button>
        </form>
      )}
    </div>
  );
}
