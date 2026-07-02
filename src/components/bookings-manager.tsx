"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BookUser, Camera, CheckCircle2, Copy, Download, Trash2 } from "lucide-react";
import { createBooking, deleteBooking, approveBooking } from "@/lib/actions/bookings";
import { addBookingGuest, removeBookingGuest } from "@/lib/actions/booking-guests";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { BookingCalendar } from "@/components/booking-calendar";
import { USAGE_TYPE_COLORS, USAGE_TYPE_LABELS, USAGE_TYPES } from "@/lib/labels";
import type { Booking, BookingGuest } from "@/lib/types/database";

type GuestWithUrl = BookingGuest & { photoUrl: string | null };
type BookingWithGuests = Booking & { guests: GuestWithUrl[] };

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function BookingsManager({
  boatId,
  bookings,
  canAdd,
  isManagement,
}: {
  boatId: string;
  bookings: BookingWithGuests[];
  canAdd: boolean;
  isManagement: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleDayClick = (iso: string) => {
    const match = bookings.find((b) => b.start_date <= iso && iso <= b.end_date);
    if (match) {
      setHighlightId(match.id);
      setShowForm(false);
      setTimeout(() => cardRefs.current[match.id]?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } else {
      setPrefillDate(iso);
      setShowForm(true);
      setHighlightId(null);
    }
  };

  const copyGuestList = async (booking: BookingWithGuests) => {
    const lines = booking.guests.map(
      (g) => `${g.name}${g.passport_number ? ` · #${g.passport_number}` : ""}${g.nationality ? ` · ${g.nationality}` : ""}`
    );
    const text = [
      `רשימת אורחים — ${booking.customer_name} (${booking.start_date} – ${booking.end_date})`,
      "",
      ...(lines.length ? lines : ["לא נוספו אורחים."]),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(booking.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // clipboard unavailable - silently ignore
    }
  };

  const sorted = [...bookings].sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <div className="flex flex-col gap-4">
      <BookingCalendar bookings={bookings} onDayClick={handleDayClick} />

      {canAdd && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setShowForm((s) => !s);
              setHighlightId(null);
              if (showForm) setPrefillDate(null);
            }}
            className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
          >
            {showForm ? "✕ סגור" : "+ הוסף טיול חדש"}
          </button>
        </div>
      )}

      {showForm && canAdd && (
        <form
          action={async (formData) => {
            await createBooking(boatId, formData);
            setShowForm(false);
            setPrefillDate(null);
          }}
          className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">שם האורח / קבוצה *</label>
            <input name="customer_name" required className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">סוג שימוש</label>
            <select name="usage_type" defaultValue="charter" className={inputClass}>
              {USAGE_TYPES.map((k) => (
                <option key={k} value={k}>
                  {USAGE_TYPE_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">תאריך הגעה *</label>
              <input name="start_date" type="date" required defaultValue={prefillDate ?? todayISO()} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">תאריך עזיבה *</label>
              <input name="end_date" type="date" required defaultValue={prefillDate ?? todayISO()} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">מספר אורחים</label>
              <input name="guests_count" type="number" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">אזור הפלגה</label>
              <input name="sailing_area" className={inputClass} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">מחיר (₪)</label>
            <input name="price" type="number" step="0.01" className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">הערות</label>
            <textarea name="notes" rows={2} className={inputClass} />
          </div>
          <button type="submit" className="mt-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            שמור הזמנה
          </button>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          אין הזמנות רשומות.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((booking) => (
            <div
              key={booking.id}
              ref={(el) => {
                cardRefs.current[booking.id] = el;
              }}
              className={`rounded-xl border bg-white p-4 ${
                highlightId === booking.id ? "border-2 border-fleet-teal" : "border-fleet-border"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: USAGE_TYPE_COLORS[booking.usage_type] }}
                    />
                    <span className="text-sm font-bold">{booking.customer_name}</span>
                    <span className="text-[10px] text-fleet-ink">· {USAGE_TYPE_LABELS[booking.usage_type]}</span>
                  </div>
                  <div className="text-xs text-fleet-ink">
                    {booking.start_date} – {booking.end_date} · {booking.guests_count ?? 0} אורחים
                    {booking.sailing_area ? ` · ${booking.sailing_area}` : ""}
                  </div>
                  {booking.notes && <div className="mt-0.5 text-xs text-fleet-ink">{booking.notes}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={booking.status} />
                  {isManagement && booking.status === "pending" && (
                    <form action={approveBooking.bind(null, boatId, booking.id)}>
                      <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                        אשר
                      </button>
                    </form>
                  )}
                  {(canAdd || (isManagement && booking.status === "pending")) && (
                    <form action={deleteBooking.bind(null, boatId, booking.id)}>
                      <ConfirmSubmitButton
                        confirmMessage="למחוק את ההזמנה?"
                        className="text-fleet-ink hover:text-fleet-coral"
                      >
                        <Trash2 size={16} />
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
              </div>

              <div className="mt-3 border-t border-dashed border-fleet-border pt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-xs font-bold text-fleet-ink">דרכוני אורחים</div>
                  <div className="flex gap-1.5">
                    <Link
                      href={`/boats/${boatId}/bookings/${booking.id}/manifest`}
                      className="flex items-center gap-1 rounded-full border border-fleet-border px-2.5 py-1 text-[11px] font-bold text-fleet-navy"
                    >
                      <Download size={12} /> הורד רשימת צוות
                    </Link>
                    <button
                      onClick={() => copyGuestList(booking)}
                      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                        copiedId === booking.id ? "border-fleet-moss text-fleet-moss" : "border-fleet-border text-fleet-navy"
                      }`}
                    >
                      {copiedId === booking.id ? <CheckCircle2 size={12} /> : <Copy size={12} />}{" "}
                      {copiedId === booking.id ? "הועתק ללוח" : "העתק רשימת אורחים"}
                    </button>
                  </div>
                </div>

                {booking.guests.length === 0 ? (
                  <div className="mb-2 text-xs text-fleet-ink">לא נוספו אורחים.</div>
                ) : (
                  <div className="mb-2 flex flex-col gap-1.5">
                    {booking.guests.map((g) => (
                      <div key={g.id} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2 py-1.5 text-xs">
                        {g.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={g.photoUrl} alt="" className="h-7 w-7 rounded object-cover" />
                        ) : (
                          <BookUser size={16} className="text-fleet-brass" />
                        )}
                        <span className="flex-1">
                          {g.name}
                          {g.passport_number ? ` · #${g.passport_number}` : ""}
                          {g.nationality ? ` · ${g.nationality}` : ""}
                        </span>
                        {canAdd && (
                          <form action={removeBookingGuest.bind(null, boatId, g.id, g.photo_path)}>
                            <button type="submit" aria-label="remove guest" className="text-fleet-ink hover:text-fleet-coral">
                              <Trash2 size={14} />
                            </button>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {canAdd && <AddGuestForm boatId={boatId} bookingId={booking.id} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddGuestForm({ boatId, bookingId }: { boatId: string; bookingId: string }) {
  const [showPhotoPicked, setShowPhotoPicked] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await addBookingGuest(boatId, bookingId, formData);
        formRef.current?.reset();
        setShowPhotoPicked(false);
      }}
      className="flex flex-col gap-1.5"
    >
      <input name="name" placeholder="שם מלא" className={inputClass} />
      <div className="flex gap-1.5">
        <input name="passport_number" placeholder="מספר דרכון" className={inputClass} />
        <input name="nationality" placeholder="אזרחות" className={inputClass} />
      </div>
      <input name="date_of_birth" type="date" className={inputClass} />
      <div className="flex items-center gap-1.5">
        <input
          ref={fileRef}
          type="file"
          name="photo"
          accept="image/*"
          className="hidden"
          onChange={(e) => setShowPhotoPicked(Boolean(e.target.files?.length))}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-2.5 py-1.5 text-xs text-fleet-navy"
        >
          <Camera size={13} /> {showPhotoPicked ? "✓ נבחרה תמונה" : "סרוק דרכון"}
        </button>
        <button type="submit" className="rounded-lg bg-fleet-teal px-3 py-1.5 text-xs font-bold text-white">
          הוסף אורח
        </button>
      </div>
    </form>
  );
}
