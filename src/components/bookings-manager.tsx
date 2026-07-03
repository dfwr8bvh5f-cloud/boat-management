"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BookUser, Calendar, Camera, CheckCircle2, Copy, Download, Sparkles, Trash2 } from "lucide-react";
import { createBooking, deleteBooking, approveBooking } from "@/lib/actions/bookings";
import { addBookingGuest, removeBookingGuest } from "@/lib/actions/booking-guests";
import { createBoatEvent, deleteBoatEvent } from "@/lib/actions/calendar-events";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { BookingCalendar } from "@/components/booking-calendar";
import { MybaContractForm } from "@/components/myba-contract-form";
import { DateInput } from "@/components/date-input";
import { CALENDAR_EVENT_COLOR, USAGE_TYPE_COLORS, getUsageTypeLabels, USAGE_TYPES } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Booking, BookingGuest, BoatEvent } from "@/lib/types/database";

type GuestWithUrl = BookingGuest & { photoUrl: string | null };
type BookingWithGuests = Booking & { guests: GuestWithUrl[] };
type CrewMember = { name: string; position: string | null };

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function BookingsManager({
  boatId,
  bookings,
  events,
  crew,
  canAdd,
  isManagement,
  showMybaOption,
  locale,
}: {
  boatId: string;
  bookings: BookingWithGuests[];
  events: BoatEvent[];
  crew: CrewMember[];
  canAdd: boolean;
  isManagement: boolean;
  showMybaOption: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const usageTypeLabels = getUsageTypeLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const eventFormRef = useRef<HTMLFormElement>(null);
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
    const crewLines = crew.map((m) => `${m.name} — ${m.position ?? ""}`);
    const guestLines = booking.guests.map(
      (g) => `${g.name}${g.passport_number ? ` · #${g.passport_number}` : ""}${g.nationality ? ` · ${g.nationality}` : ""}`
    );
    const text = [
      `${t("crew_list_title")} — ${booking.customer_name} (${booking.start_date} – ${booking.end_date})`,
      "",
      `${t("crew_word")}:`,
      ...(crewLines.length ? crewLines : [t("no_crew_registered")]),
      "",
      `${t("guests_word")}:`,
      ...(guestLines.length ? guestLines : [t("none_passports")]),
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
      <BookingCalendar bookings={bookings} events={events} onDayClick={handleDayClick} locale={locale} />

      {canAdd && (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setShowEventForm((s) => !s)}
            className="flex items-center gap-1.5 rounded-full border border-fleet-border px-4 py-2 text-sm font-semibold text-fleet-navy hover:bg-fleet-paper"
          >
            <Calendar size={14} /> {showEventForm ? `✕ ${t("close_word")}` : `+ ${t("add_event")}`}
          </button>
          <button
            onClick={() => {
              setShowForm((s) => !s);
              setHighlightId(null);
              if (showForm) setPrefillDate(null);
            }}
            className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
          >
            {showForm ? `✕ ${t("close_word")}` : `+ ${t("add_booking")}`}
          </button>
        </div>
      )}

      {showEventForm && canAdd && (
        <form
          ref={eventFormRef}
          action={async (formData) => {
            await createBoatEvent(boatId, formData);
            eventFormRef.current?.reset();
            setShowEventForm(false);
          }}
          className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("event_title")} *</label>
            <input name="title" required placeholder={t("event_title_placeholder")} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("event_date_field")} *</label>
            <DateInput name="event_date" defaultValue={todayISO()} locale={locale} className={inputClass} />
          </div>
          <button type="submit" className="mt-1 rounded-lg py-2.5 text-sm font-bold text-white hover:opacity-90" style={{ background: CALENDAR_EVENT_COLOR }}>
            {t("save_word")}
          </button>
        </form>
      )}

      {events.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-fleet-border bg-white p-3">
          <div className="text-xs font-bold text-fleet-ink">{t("cal_special_event")}</div>
          {[...events]
            .sort((a, b) => a.event_date.localeCompare(b.event_date))
            .map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CALENDAR_EVENT_COLOR }} />
                  {e.title} <span className="text-xs text-fleet-ink">· {e.event_date}</span>
                </span>
                {canAdd && (
                  <form action={deleteBoatEvent.bind(null, boatId, e.id)}>
                    <ConfirmSubmitButton confirmMessage={t("delete_event_confirm")} className="text-fleet-ink hover:text-fleet-coral">
                      <Trash2 size={14} />
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            ))}
        </div>
      )}

      {canAdd && showMybaOption && <MybaContractForm boatId={boatId} locale={locale} />}

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
            <label className="text-xs text-fleet-ink">{t("booking_guest")} *</label>
            <input name="customer_name" required className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("booking_usage_type_field")}</label>
            <select name="usage_type" defaultValue="charter" className={inputClass}>
              {USAGE_TYPES.map((k) => (
                <option key={k} value={k}>
                  {usageTypeLabels[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_from")} *</label>
              <DateInput name="start_date" defaultValue={prefillDate ?? todayISO()} locale={locale} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_to")} *</label>
              <DateInput name="end_date" defaultValue={prefillDate ?? todayISO()} locale={locale} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_guests_count")}</label>
              <input name="guests_count" type="number" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_area")}</label>
              <input name="sailing_area" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_departure_port")}</label>
              <input name="departure_port" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_arrival_port")}</label>
              <input name="arrival_port" className={inputClass} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("booking_price")}</label>
            <input name="price" type="number" step="0.01" className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("booking_notes")}</label>
            <textarea name="notes" rows={2} className={inputClass} />
          </div>
          <button type="submit" className="mt-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            {t("save_booking")}
          </button>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_bookings")}
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
                    <span className="text-[10px] text-fleet-ink">· {usageTypeLabels[booking.usage_type]}</span>
                  </div>
                  <div className="text-xs text-fleet-ink">
                    {booking.start_date} – {booking.end_date} · {booking.guests_count ?? 0} {t("guests_word")}
                    {booking.sailing_area ? ` · ${booking.sailing_area}` : ""}
                  </div>
                  {booking.notes && <div className="mt-0.5 text-xs text-fleet-ink">{booking.notes}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={booking.status} locale={locale} />
                  {isManagement && booking.status === "pending" && (
                    <form action={approveBooking.bind(null, boatId, booking.id)}>
                      <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                        {t("approve")}
                      </button>
                    </form>
                  )}
                  {(canAdd || (isManagement && booking.status === "pending")) && (
                    <form action={deleteBooking.bind(null, boatId, booking.id)}>
                      <ConfirmSubmitButton
                        confirmMessage={t("delete_booking_confirm")}
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
                  <div className="text-xs font-bold text-fleet-ink">{t("passports_title")}</div>
                  <div className="flex gap-1.5">
                    <Link
                      href={`/boats/${boatId}/bookings/${booking.id}/manifest`}
                      className="flex items-center gap-1 rounded-full border border-fleet-border px-2.5 py-1 text-[11px] font-bold text-fleet-navy"
                    >
                      <Download size={12} /> {t("manifest_download")}
                    </Link>
                    <button
                      onClick={() => copyGuestList(booking)}
                      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                        copiedId === booking.id ? "border-fleet-moss text-fleet-moss" : "border-fleet-border text-fleet-navy"
                      }`}
                    >
                      {copiedId === booking.id ? <CheckCircle2 size={12} /> : <Copy size={12} />}{" "}
                      {copiedId === booking.id ? t("crew_list_copied") : t("crew_list_export")}
                    </button>
                  </div>
                </div>

                {booking.guests.length === 0 ? (
                  <div className="mb-2 text-xs text-fleet-ink">{t("none_passports")}</div>
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

                {canAdd && <AddGuestForm boatId={boatId} bookingId={booking.id} locale={locale} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type PassportScanResult = {
  full_name?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  passport_number?: string | null;
};

function AddGuestForm({ boatId, bookingId, locale }: { boatId: string; bookingId: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [showPhotoPicked, setShowPhotoPicked] = useState(false);
  const [dob, setDob] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const passportNumberRef = useRef<HTMLInputElement>(null);
  const nationalityRef = useRef<HTMLInputElement>(null);

  const onPassportFile = async (file: File | undefined) => {
    setShowPhotoPicked(Boolean(file));
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/scan-passport", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanMsg(data.error ?? t("scan_fail"));
        return;
      }
      const result: PassportScanResult = data.result ?? {};
      if (result.full_name && nameRef.current) nameRef.current.value = result.full_name;
      if (result.passport_number && passportNumberRef.current) passportNumberRef.current.value = result.passport_number;
      if (result.nationality && nationalityRef.current) nationalityRef.current.value = result.nationality;
      if (result.date_of_birth) setDob(result.date_of_birth);
      setScanMsg(t("scan_ok"));
    } catch {
      setScanMsg(t("scan_connect_fail"));
    } finally {
      setScanning(false);
    }
  };

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await addBookingGuest(boatId, bookingId, formData);
        formRef.current?.reset();
        setShowPhotoPicked(false);
        setDob("");
        setScanMsg(null);
      }}
      className="flex flex-col gap-1.5"
    >
      <input ref={nameRef} name="name" placeholder={t("passport_name")} className={inputClass} />
      <div className="flex gap-1.5">
        <input ref={passportNumberRef} name="passport_number" placeholder={t("passport_number")} className={inputClass} />
        <input ref={nationalityRef} name="nationality" placeholder={t("passport_nationality")} className={inputClass} />
      </div>
      <DateInput name="date_of_birth" value={dob} onChange={setDob} locale={locale} className={inputClass} />
      <div className="flex items-center gap-1.5">
        <input
          ref={fileRef}
          type="file"
          name="photo"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPassportFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={scanning}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-2.5 py-1.5 text-xs text-fleet-navy disabled:opacity-60"
        >
          {scanning ? <Sparkles size={13} /> : <Camera size={13} />}{" "}
          {scanning ? t("scanning") : showPhotoPicked ? `✓ ${t("passport_photo")}` : t("passport_scan")}
        </button>
        <button type="submit" className="rounded-lg bg-fleet-teal px-3 py-1.5 text-xs font-bold text-white">
          {t("add_passport")}
        </button>
      </div>
      {scanMsg && <div className="text-[11px] text-fleet-ink">{scanMsg}</div>}
    </form>
  );
}
