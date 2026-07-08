"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BookUser, Camera, CheckCircle2, Copy, Download, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { createBooking, updateBooking, deleteBooking, approveBooking } from "@/lib/actions/bookings";
import { addBookingGuest, removeBookingGuest } from "@/lib/actions/booking-guests";
import { createBoatEvent, deleteBoatEvent } from "@/lib/actions/calendar-events";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { BookingCalendar } from "@/components/booking-calendar";
import { MybaContractForm } from "@/components/myba-contract-form";
import { DateInput } from "@/components/date-input";
import { DateRangeCalendar } from "@/components/date-range-calendar";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { CALENDAR_EVENT_COLOR, USAGE_TYPE_COLORS, getUsageTypeLabels, USAGE_TYPES } from "@/lib/labels";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { compressImageToLimit } from "@/lib/image-compress";
import { useFileDrop, setInputFiles } from "@/lib/use-file-drop";
import { ClearFileButton } from "@/components/clear-file-button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Booking, BookingGuest, BoatEvent, UsageType } from "@/lib/types/database";

type GuestWithUrl = BookingGuest & { photoUrl: string | null };
type BookingWithGuests = Booking & { guests: GuestWithUrl[] };
type CrewMember = { name: string; position: string | null; date_of_birth: string | null };
type PendingGuest = {
  name: string;
  passport_number: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  photoFile: File | null;
};
type FormKind = UsageType | "event";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15 [&:user-invalid]:border-fleet-coral [&:user-invalid]:ring-2 [&:user-invalid]:ring-fleet-coral/20";

function tripPhase(booking: Booking, today: string): "past" | "running" | "future" {
  if (today > booking.end_date) return "past";
  if (today < booking.start_date) return "future";
  return "running";
}


export function BookingsManager({
  boatId,
  bookings,
  events,
  crew,
  canAdd,
  isManagement,
  showMybaOption,
  isPrivate,
  locale,
}: {
  boatId: string;
  bookings: BookingWithGuests[];
  events: BoatEvent[];
  crew: CrewMember[];
  canAdd: boolean;
  isManagement: boolean;
  showMybaOption: boolean;
  isPrivate: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const usageTypeLabels = getUsageTypeLabels(locale);
  const availableUsageTypes = isPrivate ? USAGE_TYPES.filter((k) => k !== "charter") : USAGE_TYPES;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const today = todayLocalISO();

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
      <BookingCalendar
        bookings={bookings}
        events={events}
        crew={crew}
        onDayClick={handleDayClick}
        usageTypes={availableUsageTypes}
        locale={locale}
      />

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
            {showForm ? `✕ ${t("close_word")}` : `+ ${t("add_word")}`}
          </button>
        </div>
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
                  {e.title} <span className="text-xs text-fleet-ink" dir="ltr">· {formatDateDisplay(e.event_date)}</span>
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
        <BookingForm
          key="new"
          boatId={boatId}
          bookings={bookings}
          prefillDate={prefillDate}
          isPrivate={isPrivate}
          availableUsageTypes={availableUsageTypes}
          usageTypeLabels={usageTypeLabels}
          locale={locale}
          onSaved={() => {
            setShowForm(false);
            setPrefillDate(null);
          }}
        />
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
              {editingId === booking.id ? (
                <BookingForm
                  key={booking.id}
                  boatId={boatId}
                  bookings={bookings}
                  existing={booking}
                  prefillDate={null}
                  isPrivate={isPrivate}
                  availableUsageTypes={availableUsageTypes}
                  usageTypeLabels={usageTypeLabels}
                  locale={locale}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: USAGE_TYPE_COLORS[booking.usage_type] }}
                        />
                        <span className="text-sm font-bold">{booking.booking_reference || booking.customer_name}</span>
                        <span className="text-[10px] text-fleet-ink">
                          · {booking.usage_type === "other" && booking.usage_type_other ? booking.usage_type_other : usageTypeLabels[booking.usage_type]}
                        </span>
                      </div>
                      {booking.booking_reference && (
                        <div className="mb-0.5 text-xs text-fleet-ink">{booking.customer_name}</div>
                      )}
                      <div className="text-xs text-fleet-ink">
                        <span dir="ltr">{formatDateDisplay(booking.start_date)} – {formatDateDisplay(booking.end_date)}</span>
                        {booking.usage_type === "owner" ? ` · ${booking.guests_count ?? 0} ${t("guests_word")}` : ""}
                        {booking.sailing_area ? ` · ${booking.sailing_area}` : ""}
                      </div>
                      {booking.notes && <div className="mt-0.5 text-xs text-fleet-ink">{booking.notes}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const phase = tripPhase(booking, today);
                        const phaseColorClass =
                          phase === "past"
                            ? "text-fleet-coral bg-fleet-coral/15"
                            : phase === "running"
                              ? "text-fleet-moss bg-fleet-moss/15"
                              : "text-fleet-brass bg-fleet-brass/15";
                        return (
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${phaseColorClass}`}
                          >
                            {t(`trip_status_${phase}`)}
                          </span>
                        );
                      })()}
                      {!(
                        (booking.usage_type === "charter" || booking.usage_type === "owner") &&
                        booking.status === "approved"
                      ) && <StatusBadge value={booking.status} locale={locale} />}
                      {isManagement && booking.status === "pending" && (
                        <form action={approveBooking.bind(null, boatId, booking.id)}>
                          <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                            {t("approve")}
                          </button>
                        </form>
                      )}
                      {canAdd && (
                        <button
                          type="button"
                          onClick={() => setEditingId(booking.id)}
                          aria-label="edit booking"
                          className="text-fleet-ink hover:text-fleet-teal"
                        >
                          <Pencil size={15} />
                        </button>
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

                  {booking.usage_type === "owner" && (
                    <details className="mt-3 border-t border-dashed border-fleet-border pt-3">
                      <summary className="cursor-pointer text-xs font-bold text-fleet-ink">
                        {t("passports_title")}
                        {booking.guests.length > 0 ? ` (${booking.guests.length})` : ""}
                      </summary>

                      <div className="mb-1.5 mt-2 flex items-center justify-end gap-1.5">
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
                    </details>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BookingForm({
  boatId,
  bookings,
  existing,
  prefillDate,
  isPrivate,
  availableUsageTypes,
  usageTypeLabels,
  locale,
  onCancel,
  onSaved,
}: {
  boatId: string;
  bookings: BookingWithGuests[];
  existing?: BookingWithGuests;
  prefillDate: string | null;
  isPrivate: boolean;
  availableUsageTypes: UsageType[];
  usageTypeLabels: Record<UsageType, string>;
  locale: Locale;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [formType, setFormType] = useState<FormKind>(existing?.usage_type ?? (isPrivate ? "owner" : "charter"));
  const [pendingGuests, setPendingGuests] = useState<PendingGuest[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [otherLabel, setOtherLabel] = useState(existing?.usage_type_other ?? "");

  return (
    <form
      action={async (formData) => {
        setFormError(null);
        // Bookings run noon-to-noon, so a shared boundary day (one ending the
        // same day another starts) is a normal turnover, not a conflict -
        // only a genuine overlap (start strictly before the other's end, and
        // vice versa) should prompt her to double-check before double-booking.
        if (formType === "charter" || formType === "owner") {
          const startDate = String(formData.get("start_date") ?? "");
          const endDate = String(formData.get("end_date") ?? "");
          const conflict = bookings.find(
            (b) => (!existing || b.id !== existing.id) && startDate < b.end_date && b.start_date < endDate
          );
          if (conflict) {
            const ok = window.confirm(`${t("booking_date_conflict_confirm")} (${conflict.booking_reference || conflict.customer_name})`);
            if (!ok) return;
          }
        }
        if (formType === "event") {
          const result = await createBoatEvent(boatId, formData);
          if (result.error) return setFormError(result.error);
        } else if (existing) {
          const result = await updateBooking(boatId, existing.id, formData);
          if (result.error) return setFormError(result.error);
        } else {
          const created = await createBooking(boatId, formData);
          if (!created.ok) return setFormError(created.error);
          for (const g of pendingGuests) {
            const gfd = new FormData();
            gfd.set("name", g.name);
            if (g.passport_number) gfd.set("passport_number", g.passport_number);
            if (g.nationality) gfd.set("nationality", g.nationality);
            if (g.date_of_birth) gfd.set("date_of_birth", g.date_of_birth);
            if (g.photoFile) gfd.set("photo", g.photoFile);
            const guestResult = await addBookingGuest(boatId, created.id, gfd);
            if (guestResult.error) return setFormError(guestResult.error);
          }
        }
        onSaved();
      }}
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
    >
      {formError && (
        <p className="rounded-lg border border-fleet-coral bg-fleet-coral/10 px-3 py-2 text-xs text-fleet-coral">{formError}</p>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("booking_usage_type_field")}</label>
        <select
          name="usage_type"
          value={formType}
          onChange={(e) => setFormType(e.target.value as FormKind)}
          className={inputClass}
        >
          {availableUsageTypes.map((k) => (
            <option key={k} value={k}>
              {usageTypeLabels[k]}
            </option>
          ))}
          {!existing && <option value="event">{t("usage_event")}</option>}
        </select>
      </div>

      {formType === "other" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("usage_other_label")}</label>
          <input
            name="usage_type_other"
            required
            value={otherLabel}
            onChange={(e) => setOtherLabel(e.target.value)}
            placeholder={t("usage_other_placeholder")}
            className={inputClass}
          />
        </div>
      )}

      {formType === "other" && <input type="hidden" name="customer_name" value={otherLabel} />}

      {formType === "event" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("event_title")} *</label>
            <input name="title" required placeholder={t("event_title_placeholder")} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("event_date_field")} *</label>
            <DateInput name="event_date" defaultValue={prefillDate ?? todayLocalISO()} locale={locale} className={inputClass} />
          </div>
        </>
      ) : formType === "other" ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("booking_dates_field")} *</label>
          <DateRangeCalendar
            startName="start_date"
            endName="end_date"
            defaultStart={existing?.start_date ?? prefillDate ?? undefined}
            defaultEnd={existing?.end_date ?? prefillDate ?? undefined}
            locale={locale}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("booking_guest")} *</label>
            <input name="customer_name" required defaultValue={existing?.customer_name} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("booking_dates_field")} *</label>
            <DateRangeCalendar
              startName="start_date"
              endName="end_date"
              defaultStart={existing?.start_date ?? prefillDate ?? undefined}
              defaultEnd={existing?.end_date ?? prefillDate ?? undefined}
              locale={locale}
            />
          </div>
          {formType === "owner" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_guests_count")}</label>
              <input name="guests_count" type="number" defaultValue={existing?.guests_count ?? undefined} className={inputClass} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_area")}</label>
              <input name="sailing_area" defaultValue={existing?.sailing_area ?? undefined} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_departure_port")}</label>
              <input name="departure_port" defaultValue={existing?.departure_port ?? undefined} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_arrival_port")}</label>
              <input name="arrival_port" defaultValue={existing?.arrival_port ?? undefined} className={inputClass} />
            </div>
          </div>
          {!isPrivate && formType !== "owner" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_price")}</label>
              <input name="price" type="number" step="0.01" defaultValue={existing?.price ?? undefined} className={inputClass} />
            </div>
          )}

          {!existing && formType === "owner" && (
            <div className="flex flex-col gap-1.5 border-t border-dashed border-fleet-border pt-3">
              <label className="text-xs text-fleet-ink">{t("passports_title")}</label>
              {pendingGuests.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {pendingGuests.map((g, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2 py-1.5 text-xs">
                      <BookUser size={16} className="text-fleet-brass" />
                      <span className="flex-1">
                        {g.name}
                        {g.passport_number ? ` · #${g.passport_number}` : ""}
                        {g.nationality ? ` · ${g.nationality}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingGuests((p) => p.filter((_, idx) => idx !== i))}
                        className="text-fleet-ink hover:text-fleet-coral"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <AddGuestForm boatId={boatId} onAdd={(g) => setPendingGuests((p) => [...p, g])} locale={locale} />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("booking_notes")}</label>
            <textarea name="notes" rows={2} defaultValue={existing?.notes ?? undefined} className={inputClass} />
          </div>
        </>
      )}

      <div className="flex gap-2">
        {existing && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-fleet-border py-2.5 text-sm font-bold text-fleet-ink hover:bg-fleet-paper"
          >
            {t("close_word")}
          </button>
        )}
        <button type="submit" className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
          {formType === "event" ? t("save_word") : t("save_booking")}
        </button>
      </div>
    </form>
  );
}

type PassportScanResult = {
  full_name?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  passport_number?: string | null;
};

function AddGuestForm({
  boatId,
  bookingId,
  onAdd,
  locale,
}: {
  boatId: string;
  bookingId?: string;
  onAdd?: (guest: PendingGuest) => void;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [showPhotoPicked, setShowPhotoPicked] = useState(false);
  const [dob, setDob] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const passportNumberRef = useRef<HTMLInputElement>(null);
  const nationalityRef = useRef<HTMLInputElement>(null);

  const onPassportFile = async (file: File | undefined) => {
    if (!file) {
      setShowPhotoPicked(false);
      setPhotoFile(null);
      return;
    }
    const compressed = await compressImageToLimit(file, MAX_SCAN_FILE_BYTES);
    setShowPhotoPicked(true);
    setPhotoFile(compressed);
    if (fileRef.current) setInputFiles(fileRef.current, compressed);
    if (compressed.size > MAX_SCAN_FILE_BYTES) {
      setScanMsg(t("scan_file_too_large"));
      return;
    }
    setScanning(true);
    setScanMsg(null);
    try {
      const body = new FormData();
      body.set("file", compressed);
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

  const { dragging: photoDragging, dropHandlers: photoDropHandlers } = useFileDrop((file) => {
    if (fileRef.current) setInputFiles(fileRef.current, file);
    onPassportFile(file);
  });

  const clearPhoto = () => {
    if (fileRef.current) fileRef.current.value = "";
    setShowPhotoPicked(false);
    setPhotoFile(null);
    setScanMsg(null);
  };

  const resetAll = () => {
    if (nameRef.current) nameRef.current.value = "";
    if (passportNumberRef.current) passportNumberRef.current.value = "";
    if (nationalityRef.current) nationalityRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
    setShowPhotoPicked(false);
    setPhotoFile(null);
    setDob("");
    setScanMsg(null);
  };

  const handlePendingSubmit = (e: FormEvent) => {
    e.preventDefault();
    const name = nameRef.current?.value.trim() ?? "";
    if (!name || !onAdd) return;
    onAdd({
      name,
      passport_number: passportNumberRef.current?.value.trim() || null,
      nationality: nationalityRef.current?.value.trim() || null,
      date_of_birth: dob || null,
      photoFile,
    });
    resetAll();
  };

  const fields = (
    <>
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
          {...photoDropHandlers}
          className={`relative flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-xs text-fleet-navy disabled:opacity-60 ${
            photoDragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
          }`}
        >
          {scanning ? <Sparkles size={13} className="animate-twinkle" /> : <Camera size={13} />}{" "}
          {scanning ? t("scanning") : showPhotoPicked ? `✓ ${t("passport_photo")}` : t("passport_scan")}
          {photoDragging && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
              <Plus size={14} className="text-fleet-teal" />
            </span>
          )}
        </button>
        {showPhotoPicked && <ClearFileButton onClear={clearPhoto} label={t("remove_word")} />}
        {onAdd ? (
          <button
            type="button"
            onClick={handlePendingSubmit}
            className="rounded-lg bg-fleet-teal px-3 py-1.5 text-xs font-bold text-white"
          >
            {t("add_passport")}
          </button>
        ) : (
          <button type="submit" className="rounded-lg bg-fleet-teal px-3 py-1.5 text-xs font-bold text-white">
            {t("add_passport")}
          </button>
        )}
      </div>
      {scanMsg && <div className="text-[11px] text-fleet-ink">{scanMsg}</div>}
    </>
  );

  // A nested <form> inside the new-trip form is invalid HTML and gets
  // collapsed into the outer form by the browser, so "add guest" would
  // submit (and close) the whole trip form instead of just queuing a
  // guest. Render a plain <div> in pending mode instead of a real <form>.
  if (onAdd) {
    return <div className="flex flex-col gap-1.5">{fields}</div>;
  }

  return (
    <form
      action={async (formData: FormData) => {
        await addBookingGuest(boatId, bookingId as string, formData);
        resetAll();
      }}
      className="flex flex-col gap-1.5"
    >
      {fields}
    </form>
  );
}
