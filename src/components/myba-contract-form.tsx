"use client";

import { useRef, useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { createMybaContract } from "@/lib/actions/bookings";

type ScanResult = {
  customer_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  sailing_area?: string | null;
  fee_amount?: number | null;
  deposit_amount?: number | null;
  payment_date?: string | null;
  booking_reference?: string | null;
};

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export function MybaContractForm({ boatId }: { boatId: string }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLInputElement>(null);
  const feeRef = useRef<HTMLInputElement>(null);
  const depositRef = useRef<HTMLInputElement>(null);
  const paymentDateRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/scan-myba-contract", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanMsg(data.error ?? "לא הצלחנו לזהות אוטומטית. ניתן למלא ידנית.");
        return;
      }
      const result: ScanResult = data.result ?? {};
      if (result.customer_name && nameRef.current) nameRef.current.value = result.customer_name;
      if (result.start_date && startRef.current) startRef.current.value = result.start_date;
      if (result.end_date && endRef.current) endRef.current.value = result.end_date;
      if (result.sailing_area && areaRef.current) areaRef.current.value = result.sailing_area;
      if (result.fee_amount != null && feeRef.current) feeRef.current.value = String(result.fee_amount);
      if (result.deposit_amount != null && depositRef.current) depositRef.current.value = String(result.deposit_amount);
      if (result.payment_date && paymentDateRef.current) paymentDateRef.current.value = result.payment_date;
      if (result.booking_reference && refRef.current) refRef.current.value = result.booking_reference;
      setScanMsg("הזיהוי האוטומטי מולא — בדוק ועדכן במידת הצורך.");
    } catch {
      setScanMsg("לא הצלחנו להתחבר לשירות הסריקה.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex justify-end">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full border border-fleet-brass px-4 py-2 text-sm font-semibold text-fleet-navy hover:bg-fleet-paper"
        >
          + הוסף חוזה MYBA
        </button>
      ) : (
        <form
          action={async (formData) => {
            await createMybaContract(boatId, formData);
            setOpen(false);
            setScanMsg(null);
          }}
          encType="multipart/form-data"
          className="flex w-full flex-col gap-2.5 rounded-xl border border-fleet-border bg-white p-4"
        >
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <FileText size={15} className="text-fleet-brass" /> הוסף חוזה MYBA
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-fleet-ink">
              ✕ סגור
            </button>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy disabled:opacity-60"
          >
            <Sparkles size={15} /> {scanning ? "סורק עם AI…" : "העלה חוזה חתום (תמונה/PDF) לסריקה"}
          </button>
          <input
            ref={fileRef}
            type="file"
            name="contract"
            accept="image/*,application/pdf"
            required
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          {scanMsg && (
            <div className={`flex items-center gap-1 text-xs ${scanMsg.startsWith("הזיהוי") ? "text-fleet-moss" : "text-fleet-coral"}`}>
              <Sparkles size={12} /> {scanMsg}
            </div>
          )}
          <input ref={nameRef} name="customer_name" placeholder="שם השוכר *" required className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <input ref={startRef} name="start_date" type="date" placeholder="תאריך התחלה" required className={inputClass} />
            <input ref={endRef} name="end_date" type="date" placeholder="תאריך סיום" required className={inputClass} />
          </div>
          <input ref={areaRef} name="sailing_area" placeholder="אזור הפלגה" className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <input ref={feeRef} name="fee_amount" type="number" step="0.01" placeholder="שכר ההשכרה (€)" className={inputClass} />
            <input ref={depositRef} name="deposit_amount" type="number" step="0.01" placeholder="מקדמה (€)" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input ref={paymentDateRef} name="payment_date" type="date" placeholder="תאריך תשלום" className={inputClass} />
            <input ref={refRef} name="booking_reference" placeholder="מספר הזמנה" className={inputClass} />
          </div>
          <p className="rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-xs text-fleet-ink">
            הנתונים יתווספו אוטומטית ליומן ולהכנסות העתידיות. החוזה יישמר במסמכים תחת חוזי MYBA לפי שנה.
          </p>
          <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            שמור חוזה
          </button>
        </form>
      )}
    </div>
  );
}
