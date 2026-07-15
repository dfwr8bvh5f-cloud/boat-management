"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BookUser, Camera, Eye, FileText, Pencil, Plus, Sparkles, Star, Trash2 } from "lucide-react";
import { createBooking, updateBooking, deleteBooking, approveBooking } from "@/lib/actions/bookings";
import { addBookingGuest, removeBookingGuest, updateBookingGuest } from "@/lib/actions/booking-guests";
import { addBookingLeg, removeBookingLeg, updateBookingLeg } from "@/lib/actions/booking-legs";
import {
  addFavoriteGuest,
  addFavoriteGuestFromBookingGuest,
  updateFavoriteGuest,
  removeFavoriteGuest,
} from "@/lib/actions/favorite-guests";
import { createBoatEvent, updateBoatEvent, deleteBoatEvent } from "@/lib/actions/calendar-events";
import { clearStaffBirthday } from "@/lib/actions/staff";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { BookingCalendar, isBirthdayEventTitle, stripBirthdayPrefix } from "@/components/booking-calendar";
import { MybaContractForm } from "@/components/myba-contract-form";
import { DateInput } from "@/components/date-input";
import { DateRangeCalendar } from "@/components/date-range-calendar";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { TRIP_UPCOMING_COLOR, USAGE_TYPE_COLORS, getUsageTypeLabels, USAGE_TYPES } from "@/lib/labels";
import { MAX_SCAN_FILE_BYTES, isPdfUrl } from "@/lib/upload";
import { compressImageToLimit } from "@/lib/image-compress";
import { useFileDrop, setInputFiles } from "@/lib/use-file-drop";
import { ClearFileButton } from "@/components/clear-file-button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Booking, BookingGuest, BookingLeg, BoatEvent, FavoriteGuest, UsageType } from "@/lib/types/database";
import { INPUT_CLASS } from "@/lib/ui-classes";

type GuestWithUrl = BookingGuest & { photoUrl: string | null };
type FavoriteGuestWithUrl = FavoriteGuest & { photoUrl: string | null };
type BookingWithGuests = Booking & { guests: GuestWithUrl[]; legs: BookingLeg[] };
type CrewMember = { id: string; name: string; position: string | null; date_of_birth: string | null };
type PendingGuest = {
  name: string;
  passport_number: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  photoFile: File | null;
  favoritePhotoPath?: string | null;
};

// A favorite "matches" a guest when name + passport number line up - used to
// decide whether the star next to a guest should render filled (already
// saved) or outline (not yet saved).
function favoriteKey(name: string, passportNumber: string | null) {
  return `${name.trim().toLowerCase()}|${(passportNumber ?? "").trim().toLowerCase()}`;
}
type PendingLeg = {
  destination: string;
  departure_port: string;
  arrival_port: string;
  start_date: string;
  end_date: string;
  notes: string;
  guests: PendingGuest[];
};
type FormKind = UsageType | "event";

// Splits a booking's flat guest list into per-leg buckets plus a "general"
// bucket for guests with no leg_id (pre-legs data, or a trip with no legs).
function groupGuestsByLeg(guests: GuestWithUrl[]) {
  const byLeg = new Map<string, GuestWithUrl[]>();
  const general: GuestWithUrl[] = [];
  for (const g of guests) {
    if (g.leg_id) {
      const arr = byLeg.get(g.leg_id) ?? [];
      arr.push(g);
      byLeg.set(g.leg_id, arr);
    } else {
      general.push(g);
    }
  }
  return { byLeg, general };
}

const inputClass = INPUT_CLASS;

function tripPhase(booking: Booking, today: string): "past" | "running" | "future" {
  if (today > booking.end_date) return "past";
  if (today < booking.start_date) return "future";
  return "running";
}

// Crew birthdays recur every year, so only the month-day part is meaningful
// - showing the stored birth year here would read as "the event is in
// 1994", not "recurring on this date".
function formatMonthDay(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}-${month}`;
}


export function BookingsManager({
  boatId,
  bookings,
  events,
  crew,
  favorites,
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
  favorites: FavoriteGuestWithUrl[];
  canAdd: boolean;
  isManagement: boolean;
  showMybaOption: boolean;
  isPrivate: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const usageTypeLabels = getUsageTypeLabels(locale);
  const availableUsageTypes = isPrivate ? USAGE_TYPES.filter((k) => k !== "charter") : USAGE_TYPES;

  const [formMode, setFormMode] = useState<"trip" | "event" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<BoatEvent | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openGuestSection, setOpenGuestSection] = useState<string | null>(null);
  const [editingGuest, setEditingGuest] = useState<GuestWithUrl | null>(null);
  // A guest/leg's own edit/delete icons only show once this booking's
  // passports section has been switched into edit mode - keeps the normal
  // (read-only) view of a trip's passenger list uncluttered.
  const [guestsEditMode, setGuestsEditMode] = useState<string | null>(null);
  const [editingLegId, setEditingLegId] = useState<string | null>(null);
  const [showFavoritesManager, setShowFavoritesManager] = useState(false);
  const [showAddFavorite, setShowAddFavorite] = useState(false);
  const [editingFavorite, setEditingFavorite] = useState<FavoriteGuestWithUrl | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const today = todayLocalISO();

  const handleDayClick = (iso: string) => {
    const match = bookings.find((b) => b.start_date <= iso && iso <= b.end_date);
    if (match) {
      setHighlightId(match.id);
      setFormMode(null);
      setTimeout(() => cardRefs.current[match.id]?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } else {
      setPrefillDate(iso);
      setFormMode("trip");
      setHighlightId(null);
    }
  };

  // Merges the boat's one-off calendar events with recurring crew
  // birthdays into a single dated list - birthday-titled events (added
  // via the generic "add event" flow) get folded in with the automatic
  // ones instead of appearing twice under different icons.
  const specialEvents = events.filter((e) => !isBirthdayEventTitle(e.title));
  const birthdayItems = [
    ...crew
      .filter((m): m is CrewMember & { date_of_birth: string } => Boolean(m.date_of_birth))
      .map((m) => ({
        key: `crew-${m.id}`,
        icon: "🎂",
        label: m.name,
        sortKey: m.date_of_birth.slice(5),
        dateDisplay: formatMonthDay(m.date_of_birth),
        eventId: null as string | null,
        staffId: m.id as string | null,
        event: null as BoatEvent | null,
      })),
    ...events
      .filter((e) => isBirthdayEventTitle(e.title))
      .map((e) => ({
        key: `event-${e.id}`,
        icon: "🎂",
        label: e.title,
        // Month-day only, like the crew birthdays above - a birthday event
        // recurs every year, so sorting/displaying its literal stored date
        // (often the person's actual birth year) would misplace it and
        // show a misleading year.
        sortKey: e.event_date.slice(5),
        dateDisplay: formatMonthDay(e.event_date),
        eventId: e.id as string | null,
        staffId: null as string | null,
        event: e as BoatEvent | null,
      })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const copyGuestList = async (booking: BookingWithGuests) => {
    const crewLines = crew.map((m) => `${m.name} — ${m.position ?? ""}`);
    const guestLine = (g: GuestWithUrl) =>
      `${g.name}${g.passport_number ? ` · #${g.passport_number}` : ""}${g.nationality ? ` · ${g.nationality}` : ""}`;
    const { byLeg, general } = groupGuestsByLeg(booking.guests);
    const guestLines =
      booking.legs.length > 0
        ? booking.legs.flatMap((leg) => [
            `${t("leg_word")} ${leg.leg_number}${leg.destination ? ` · ${leg.destination}` : ""}:`,
            ...(byLeg.get(leg.id) ?? []).map(guestLine),
            ...(general.length > 0 && leg === booking.legs[booking.legs.length - 1]
              ? [`${t("legs_general_guests")}:`, ...general.map(guestLine)]
              : []),
          ])
        : booking.guests.map(guestLine);
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
  const favoriteKeys = new Set(favorites.map((f) => favoriteKey(f.name, f.passport_number)));

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
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setShowFavoritesManager((s) => !s);
              setShowAddFavorite(false);
              setEditingFavorite(null);
            }}
            className="flex items-center gap-1 rounded-full border border-fleet-brass px-4 py-2 text-sm font-semibold text-fleet-brass hover:bg-fleet-paper"
          >
            <Star size={14} fill={showFavoritesManager ? "currentColor" : "none"} />
            {showFavoritesManager ? `✕ ${t("close_word")}` : t("favorites_list_button")}
          </button>
          <button
            onClick={() => {
              setFormMode((m) => (m === "event" ? null : "event"));
              setHighlightId(null);
              setPrefillDate(null);
            }}
            className="rounded-full border border-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-navy hover:bg-fleet-paper"
          >
            {formMode === "event" ? `✕ ${t("close_word")}` : t("add_event_button")}
          </button>
          <button
            onClick={() => {
              setFormMode((m) => (m === "trip" ? null : "trip"));
              setHighlightId(null);
              setPrefillDate(null);
            }}
            className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
          >
            {formMode === "trip" ? `✕ ${t("close_word")}` : t("add_trip_button")}
          </button>
        </div>
      )}

      {canAdd && showFavoritesManager && (
        <div className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <Star size={15} fill="currentColor" className="text-fleet-brass" /> {t("favorites_list_button")}
            </div>
            <button
              type="button"
              onClick={() => {
                if (showAddFavorite && !editingFavorite) {
                  setShowAddFavorite(false);
                } else {
                  setShowAddFavorite(true);
                  setEditingFavorite(null);
                }
              }}
              className="text-xs font-bold text-fleet-teal"
            >
              {showAddFavorite && !editingFavorite ? `✕ ${t("close_word")}` : `+ ${t("add_passport")}`}
            </button>
          </div>

          {favorites.length === 0 && !showAddFavorite ? (
            <p className="text-sm text-fleet-ink">{t("none_passports")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {favorites.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2 py-1.5 text-xs">
                  {f.photoUrl && isPdfUrl(f.photoUrl) ? (
                    <FileText size={16} className="text-fleet-brass" />
                  ) : f.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.photoUrl} alt="" className="h-7 w-7 rounded object-cover" />
                  ) : (
                    <BookUser size={16} className="text-fleet-brass" />
                  )}
                  <span className="flex-1">
                    {f.name}
                    {f.passport_number ? ` · #${f.passport_number}` : ""}
                    {f.nationality ? ` · ${f.nationality}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFavorite(f);
                      setShowAddFavorite(true);
                    }}
                    aria-label="edit favorite"
                    className="text-fleet-ink hover:text-fleet-navy"
                  >
                    <Pencil size={13} />
                  </button>
                  <form action={removeFavoriteGuest.bind(null, boatId, f.id, f.photo_path)}>
                    <button type="submit" aria-label="remove favorite" className="text-fleet-ink hover:text-fleet-coral">
                      <Trash2 size={14} />
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {showAddFavorite && (
            <AddGuestForm
              key={editingFavorite?.id ?? "new-favorite"}
              boatId={boatId}
              favorites={favorites}
              favoriteMode
              favoriteId={editingFavorite?.id}
              initial={editingFavorite ?? undefined}
              onDone={() => {
                setShowAddFavorite(false);
                setEditingFavorite(null);
              }}
              locale={locale}
            />
          )}
        </div>
      )}

      {(birthdayItems.length > 0 || specialEvents.length > 0) && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-fleet-border bg-white p-3">
          {birthdayItems.length > 0 && (
            <>
              <div className="text-xs font-bold text-fleet-ink">{t("cal_staff_birthday")}</div>
              {birthdayItems.map((item) =>
                item.event && editingEvent?.id === item.event.id ? (
                  <BookingForm
                    key={item.key}
                    boatId={boatId}
                    bookings={bookings}
                    prefillDate={null}
                    isPrivate={isPrivate}
                    availableUsageTypes={availableUsageTypes}
                    usageTypeLabels={usageTypeLabels}
                    favorites={favorites}
                    locale={locale}
                    lockToEvent
                    existingEvent={item.event}
                    onCancel={() => setEditingEvent(null)}
                    onSaved={() => setEditingEvent(null)}
                  />
                ) : (
                  <div key={item.key} className="flex items-center justify-between gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span aria-hidden className="shrink-0">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                      <span className="shrink-0 text-xs text-fleet-ink" dir="ltr">· {item.dateDisplay}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {item.event ? (
                        canAdd && (
                          <button
                            type="button"
                            onClick={() => setEditingEvent(item.event)}
                            aria-label="edit"
                            className="text-fleet-ink hover:text-fleet-teal"
                          >
                            <Pencil size={14} />
                          </button>
                        )
                      ) : (
                        <Link href={`/boats/${boatId}/staff`} aria-label="edit" className="text-fleet-ink hover:text-fleet-teal">
                          <Pencil size={14} />
                        </Link>
                      )}
                      {item.eventId && canAdd && (
                        <form action={deleteBoatEvent.bind(null, boatId, item.eventId)}>
                          <ConfirmSubmitButton confirmMessage={t("delete_event_confirm")} className="text-fleet-ink hover:text-fleet-coral">
                            <Trash2 size={14} />
                          </ConfirmSubmitButton>
                        </form>
                      )}
                      {item.staffId && isManagement && (
                        <form action={clearStaffBirthday.bind(null, boatId, item.staffId)}>
                          <ConfirmSubmitButton confirmMessage={t("clear_birthday_confirm")} className="text-fleet-ink hover:text-fleet-coral">
                            <Trash2 size={14} />
                          </ConfirmSubmitButton>
                        </form>
                      )}
                    </span>
                  </div>
                )
              )}
            </>
          )}
          {specialEvents.length > 0 && (
            <>
              <div className="mt-1 text-xs font-bold text-fleet-ink">{t("cal_special_event")}</div>
              {[...specialEvents]
                .sort((a, b) => a.event_date.localeCompare(b.event_date))
                .map((e) =>
                  editingEvent?.id === e.id ? (
                    <BookingForm
                      key={e.id}
                      boatId={boatId}
                      bookings={bookings}
                      prefillDate={null}
                      isPrivate={isPrivate}
                      availableUsageTypes={availableUsageTypes}
                      usageTypeLabels={usageTypeLabels}
                      favorites={favorites}
                      locale={locale}
                      lockToEvent
                      existingEvent={e}
                      onCancel={() => setEditingEvent(null)}
                      onSaved={() => setEditingEvent(null)}
                    />
                  ) : (
                    <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span aria-hidden className="shrink-0">🥂</span>
                        <span className="truncate">{e.title}</span>
                        <span className="shrink-0 text-xs text-fleet-ink" dir="ltr">· {formatDateDisplay(e.event_date)}</span>
                      </span>
                      {canAdd && (
                        <span className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingEvent(e)}
                            aria-label="edit"
                            className="text-fleet-ink hover:text-fleet-teal"
                          >
                            <Pencil size={14} />
                          </button>
                          <form action={deleteBoatEvent.bind(null, boatId, e.id)}>
                            <ConfirmSubmitButton confirmMessage={t("delete_event_confirm")} className="text-fleet-ink hover:text-fleet-coral">
                              <Trash2 size={14} />
                            </ConfirmSubmitButton>
                          </form>
                        </span>
                      )}
                    </div>
                  )
                )}
            </>
          )}
        </div>
      )}

      {canAdd && showMybaOption && <MybaContractForm boatId={boatId} locale={locale} />}

      {formMode && canAdd && (
        <BookingForm
          key="new"
          boatId={boatId}
          bookings={bookings}
          prefillDate={prefillDate}
          isPrivate={isPrivate}
          availableUsageTypes={availableUsageTypes}
          usageTypeLabels={usageTypeLabels}
          favorites={favorites}
          locale={locale}
          lockToEvent={formMode === "event"}
          onSaved={() => {
            setFormMode(null);
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
                  favorites={favorites}
                  locale={locale}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: USAGE_TYPE_COLORS[booking.usage_type] }}
                        />
                        <span className="truncate text-sm font-bold">{booking.booking_reference || booking.customer_name}</span>
                        <span className="shrink-0 text-[10px] text-fleet-ink">· {usageTypeLabels[booking.usage_type]}</span>
                      </div>
                      {booking.booking_reference && (
                        <div className="mb-0.5 truncate text-xs text-fleet-ink">{booking.customer_name}</div>
                      )}
                      <div className="truncate text-xs text-fleet-ink">
                        <span dir="ltr">{formatDateDisplay(booking.start_date)} – {formatDateDisplay(booking.end_date)}</span>
                        {booking.sailing_area ? ` · ${booking.sailing_area}` : ""}
                      </div>
                      {booking.notes && <div className="mt-0.5 truncate text-xs text-fleet-ink">{booking.notes}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {(() => {
                        const phase = tripPhase(booking, today);
                        if (phase === "future") {
                          return (
                            <span
                              style={{ color: TRIP_UPCOMING_COLOR, background: `${TRIP_UPCOMING_COLOR}26` }}
                              className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold"
                            >
                              {t("trip_status_future")}
                            </span>
                          );
                        }
                        const phaseColorClass =
                          phase === "past" ? "text-fleet-coral bg-fleet-coral/15" : "text-fleet-moss bg-fleet-moss/15";
                        return (
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${phaseColorClass}`}
                          >
                            {t(`trip_status_${phase}`)}
                          </span>
                        );
                      })()}
                      {booking.status !== "approved" && <StatusBadge value={booking.status} locale={locale} />}
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

                  {(booking.usage_type === "owner" || isPrivate) && (() => {
                    const { byLeg, general } = groupGuestsByLeg(booking.guests);
                    const inGuestsEditMode = guestsEditMode === booking.id;
                    const guestRow = (g: GuestWithUrl) => (
                      <div key={g.id} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2 py-1.5 text-xs">
                        {g.photoUrl && isPdfUrl(g.photoUrl) ? (
                          <FileText size={16} className="text-fleet-brass" />
                        ) : g.photoUrl ? (
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
                        {canAdd && inGuestsEditMode && (
                          <form
                            action={async () => {
                              await addFavoriteGuestFromBookingGuest(boatId, g.id);
                            }}
                          >
                            <button
                              type="submit"
                              aria-label="favorite guest"
                              className={favoriteKeys.has(favoriteKey(g.name, g.passport_number)) ? "text-fleet-brass" : "text-fleet-ink hover:text-fleet-brass"}
                            >
                              <Star size={13} fill={favoriteKeys.has(favoriteKey(g.name, g.passport_number)) ? "currentColor" : "none"} />
                            </button>
                          </form>
                        )}
                        {canAdd && inGuestsEditMode && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenGuestSection(`${booking.id}:${g.leg_id ?? "general"}`);
                              setEditingGuest(g);
                            }}
                            aria-label="edit guest"
                            className="text-fleet-ink hover:text-fleet-navy"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {canAdd && inGuestsEditMode && (
                          <form action={removeBookingGuest.bind(null, boatId, g.id, g.photo_path)}>
                            <button type="submit" aria-label="remove guest" className="text-fleet-ink hover:text-fleet-coral">
                              <Trash2 size={14} />
                            </button>
                          </form>
                        )}
                      </div>
                    );
                    const guestFormToggle = (sectionKey: string) => (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (openGuestSection === sectionKey && !editingGuest) {
                              setOpenGuestSection(null);
                            } else {
                              setOpenGuestSection(sectionKey);
                              setEditingGuest(null);
                            }
                          }}
                          className="text-xs font-bold text-fleet-teal"
                        >
                          {openGuestSection === sectionKey && !editingGuest ? `✕ ${t("close_word")}` : `+ ${t("add_passport")}`}
                        </button>
                      </div>
                    );
                    return (
                      <details open className="mt-3 border-t border-dashed border-fleet-border pt-3">
                        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-fleet-ink">
                          <span>
                            {t("passports_title")}
                            {booking.guests.length > 0 ? ` (${booking.guests.length})` : ""}
                          </span>
                          {canAdd && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setGuestsEditMode((id) => (id === booking.id ? null : booking.id));
                              }}
                              aria-label="edit passports"
                              className={inGuestsEditMode ? "text-fleet-teal" : "text-fleet-ink hover:text-fleet-teal"}
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                        </summary>

                        <div className="mb-1.5 mt-2 flex flex-wrap items-center justify-end gap-1.5">
                          {booking.legs.length === 0 && (
                            <Link
                              href={`/boats/${boatId}/bookings/${booking.id}/manifest`}
                              className="flex items-center gap-1 rounded-full border border-fleet-border px-2.5 py-1 text-[11px] font-bold text-fleet-navy"
                            >
                              <Eye size={12} /> {t("manifest_download")}
                            </Link>
                          )}
                          <button
                            onClick={() => copyGuestList(booking)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                              copiedId === booking.id ? "border-fleet-moss text-fleet-moss" : "border-fleet-border text-fleet-navy"
                            }`}
                          >
                            {copiedId === booking.id ? t("crew_list_copied") : t("crew_list_export")}
                          </button>
                        </div>

                        {booking.legs.map((leg) => {
                          const sectionKey = `${booking.id}:${leg.id}`;
                          return (
                            <div key={leg.id} className="mb-2 flex flex-col gap-1.5 rounded-lg border border-fleet-border p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-fleet-navy">
                                  {booking.legs.length > 1
                                    ? `${t("leg_word")} ${leg.leg_number}${leg.destination ? ` · ${leg.destination}` : ""}`
                                    : leg.destination}
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <Link
                                    href={`/boats/${boatId}/bookings/${booking.id}/manifest?leg=${leg.id}`}
                                    aria-label={t("manifest_download")}
                                    title={t("manifest_download")}
                                    className="text-fleet-ink hover:text-fleet-teal"
                                  >
                                    <Eye size={14} />
                                  </Link>
                                  {canAdd && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const opening = editingLegId !== leg.id;
                                        setEditingLegId(opening ? leg.id : null);
                                        // Editing a leg's own fields and editing its guests are the
                                        // same "I'm working on this leg" moment for her - opening one
                                        // switches guest rows into edit mode too, instead of requiring
                                        // a separate click on the passports-section toggle.
                                        if (opening) setGuestsEditMode(booking.id);
                                      }}
                                      aria-label="edit leg"
                                      className="text-fleet-ink hover:text-fleet-navy"
                                    >
                                      <Pencil size={13} />
                                    </button>
                                  )}
                                  {canAdd && (
                                    <form action={removeBookingLeg.bind(null, boatId, leg.id)}>
                                      <ConfirmSubmitButton
                                        confirmMessage={t("remove_leg_confirm")}
                                        className="text-fleet-ink hover:text-fleet-coral"
                                      >
                                        <Trash2 size={13} />
                                      </ConfirmSubmitButton>
                                    </form>
                                  )}
                                </span>
                              </div>
                              {editingLegId === leg.id ? (
                                <EditLegForm
                                  boatId={boatId}
                                  bookingId={booking.id}
                                  leg={leg}
                                  bookingStartDate={booking.start_date}
                                  bookingEndDate={booking.end_date}
                                  locale={locale}
                                  onDone={() => setEditingLegId(null)}
                                />
                              ) : (
                                <>
                                  {(leg.departure_port || leg.arrival_port) && (
                                    <div className="text-[11px] text-fleet-ink">
                                      {[leg.departure_port, leg.arrival_port].filter(Boolean).join(" → ")}
                                    </div>
                                  )}
                                  {(leg.start_date || leg.end_date) && (
                                    <div className="text-[11px] text-fleet-ink" dir="ltr">
                                      {[leg.start_date, leg.end_date]
                                        .filter((d): d is string => Boolean(d))
                                        .map((d) => formatDateDisplay(d))
                                        .join(" – ")}
                                    </div>
                                  )}
                                </>
                              )}
                              {(byLeg.get(leg.id) ?? []).map(guestRow)}
                              {canAdd && guestFormToggle(sectionKey)}
                              {canAdd && openGuestSection === sectionKey && (
                                <AddGuestForm
                                  key={editingGuest?.id ?? "new"}
                                  boatId={boatId}
                                  bookingId={booking.id}
                                  legId={leg.id}
                                  editingGuestId={editingGuest?.id}
                                  initial={editingGuest ?? undefined}
                                  favorites={favorites}
                                  onDone={() => {
                                    setOpenGuestSection(null);
                                    setEditingGuest(null);
                                  }}
                                  locale={locale}
                                />
                              )}
                            </div>
                          );
                        })}

                        {(general.length > 0 || booking.legs.length === 0) && (() => {
                          const sectionKey = `${booking.id}:general`;
                          return (
                            <div className="mb-2 flex flex-col gap-1.5">
                              {booking.legs.length > 0 && (
                                <div className="text-xs font-bold text-fleet-ink">{t("legs_general_guests")}</div>
                              )}
                              {general.length === 0 && booking.legs.length === 0 ? (
                                <div className="text-xs text-fleet-ink">{t("none_passports")}</div>
                              ) : (
                                general.map(guestRow)
                              )}
                              {canAdd && booking.legs.length === 0 && guestFormToggle(sectionKey)}
                              {canAdd && booking.legs.length === 0 && openGuestSection === sectionKey && (
                                <AddGuestForm
                                  key={editingGuest?.id ?? "new"}
                                  boatId={boatId}
                                  bookingId={booking.id}
                                  editingGuestId={editingGuest?.id}
                                  initial={editingGuest ?? undefined}
                                  favorites={favorites}
                                  onDone={() => {
                                    setOpenGuestSection(null);
                                    setEditingGuest(null);
                                  }}
                                  locale={locale}
                                />
                              )}
                            </div>
                          );
                        })()}

                        {canAdd && (
                          <AddLegForm
                            boatId={boatId}
                            bookingId={booking.id}
                            bookingStartDate={booking.start_date}
                            bookingEndDate={booking.end_date}
                            locale={locale}
                          />
                        )}
                      </details>
                    );
                  })()}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Edits an existing leg's own destination/ports/dates/notes in place -
// rendered inline in the leg card once its pencil icon is clicked.
function EditLegForm({
  boatId,
  bookingId,
  leg,
  bookingStartDate,
  bookingEndDate,
  locale,
  onDone,
}: {
  boatId: string;
  bookingId: string;
  leg: BookingLeg;
  bookingStartDate: string;
  bookingEndDate: string;
  locale: Locale;
  onDone: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <form
      action={async (formData: FormData) => {
        setFormError(null);
        const result = await updateBookingLeg(boatId, bookingId, leg.id, formData);
        if (!result.ok) return setFormError(result.error);
        onDone();
      }}
      className="flex flex-col gap-1.5 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper p-2"
    >
      {formError && (
        <p className="rounded-lg border border-fleet-coral bg-fleet-coral/10 px-2 py-1 text-[11px] text-fleet-coral">{formError}</p>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        <input name="destination" defaultValue={leg.destination ?? undefined} placeholder={t("booking_area")} className={inputClass} />
        <input
          name="departure_port"
          defaultValue={leg.departure_port ?? undefined}
          placeholder={t("booking_departure_port")}
          className={inputClass}
        />
        <input
          name="arrival_port"
          defaultValue={leg.arrival_port ?? undefined}
          placeholder={t("booking_arrival_port")}
          className={inputClass}
        />
      </div>
      <DateRangeCalendar
        startName="start_date"
        endName="end_date"
        defaultStart={leg.start_date ?? undefined}
        defaultEnd={leg.end_date ?? undefined}
        locale={locale}
        min={bookingStartDate}
        max={bookingEndDate}
        required={false}
      />
      <div className="flex items-center gap-1.5">
        <input name="notes" defaultValue={leg.notes ?? undefined} placeholder={t("booking_notes")} className={inputClass} />
        <button type="submit" className="shrink-0 rounded-lg bg-fleet-navy px-3 py-1.5 text-xs font-bold text-fleet-paper">
          {t("save_word")}
        </button>
        <button type="button" onClick={onDone} className="shrink-0 text-xs font-bold text-fleet-ink hover:text-fleet-coral">
          {t("close_word")}
        </button>
      </div>
    </form>
  );
}

function BookingForm({
  boatId,
  bookings,
  existing,
  existingEvent,
  prefillDate,
  isPrivate,
  availableUsageTypes,
  usageTypeLabels,
  favorites,
  locale,
  lockToEvent,
  onCancel,
  onSaved,
}: {
  boatId: string;
  bookings: BookingWithGuests[];
  existing?: BookingWithGuests;
  existingEvent?: BoatEvent;
  prefillDate: string | null;
  isPrivate: boolean;
  availableUsageTypes: UsageType[];
  usageTypeLabels: Record<UsageType, string>;
  favorites: FavoriteGuestWithUrl[];
  locale: Locale;
  lockToEvent?: boolean;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [formType, setFormType] = useState<FormKind>(lockToEvent ? "event" : (existing?.usage_type ?? (isPrivate ? "owner" : "charter")));
  // Guests are added into whichever leg is last ("current") - clicking
  // "+ Add leg" closes that one off and starts a fresh, empty one, so a
  // leg always exists to receive guests from the very first "+ Add guest".
  const [pendingLegs, setPendingLegs] = useState<PendingLeg[]>([
    { destination: "", departure_port: "", arrival_port: "", start_date: "", end_date: "", notes: "", guests: [] },
  ]);
  // Tracks the trip's own dates live (DateRangeCalendar is otherwise an
  // uncontrolled field, only exposed via hidden form inputs at submit time)
  // so each leg's date pickers can be bounded to fall inside them.
  const [tripStart, setTripStart] = useState<string | null>(existing?.start_date ?? prefillDate ?? null);
  const [tripEnd, setTripEnd] = useState<string | null>(existing?.end_date ?? prefillDate ?? null);
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [editingGuestIdx, setEditingGuestIdx] = useState<number | null>(null);
  const [editingLegIdx, setEditingLegIdx] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [otherLabel, setOtherLabel] = useState(existing?.usage_type_other ?? "");
  const [eventKind, setEventKind] = useState<"event" | "birthday">(
    existingEvent && isBirthdayEventTitle(existingEvent.title) ? "birthday" : "event"
  );
  const favoriteKeys = new Set(favorites.map((f) => favoriteKey(f.name, f.passport_number)));

  const favoritePendingGuest = (g: PendingGuest) => {
    const fd = new FormData();
    fd.set("name", g.name);
    if (g.passport_number) fd.set("passport_number", g.passport_number);
    if (g.nationality) fd.set("nationality", g.nationality);
    if (g.date_of_birth) fd.set("date_of_birth", g.date_of_birth);
    if (g.photoFile) fd.set("photo", g.photoFile);
    void addFavoriteGuest(boatId, fd);
  };

  return (
    <form
      action={async (formData) => {
        setFormError(null);
        // Bookings run noon-to-noon, so a shared boundary day (one ending the
        // same day another starts) is a normal turnover, not a conflict -
        // only a genuine overlap (start strictly before the other's end, and
        // vice versa) should prompt her to double-check before double-booking.
        // "other" bookings (on either side of the comparison) are never
        // flagged - an owner trip running alongside something separately
        // logged as "other" on the same dates is a normal, expected setup,
        // not a mistake to warn about.
        if (formType === "charter" || formType === "owner") {
          const startDate = String(formData.get("start_date") ?? "");
          const endDate = String(formData.get("end_date") ?? "");
          const conflict = bookings.find(
            (b) =>
              (!existing || b.id !== existing.id) &&
              b.usage_type !== "other" &&
              startDate < b.end_date &&
              b.start_date < endDate
          );
          if (conflict) {
            const ok = window.confirm(`${t("booking_date_conflict_confirm")} (${conflict.booking_reference || conflict.customer_name})`);
            if (!ok) return;
          }
        }
        if (formType === "event") {
          // Which icon a calendar entry gets is decided by scanning the
          // title for a birthday word (isBirthdayEventTitle) - prefixing it
          // here means picking "Birthday" above is what actually drives
          // that, not whatever wording the user happens to type.
          if (eventKind === "birthday") {
            const enteredTitle = String(formData.get("title") ?? "").trim();
            formData.set("title", `${t("cal_staff_birthday")} - ${enteredTitle}`);
          }
          const result = existingEvent
            ? await updateBoatEvent(boatId, existingEvent.id, formData)
            : await createBoatEvent(boatId, formData);
          if (result.error) return setFormError(result.error);
        } else if (existing) {
          const result = await updateBooking(boatId, existing.id, formData);
          if (result.error) return setFormError(result.error);
        } else {
          const created = await createBooking(boatId, formData);
          if (!created.ok) return setFormError(created.error);
          // Drop a leg nobody actually used (e.g. the always-present first
          // leg, if it was never given a guest or a sailing detail).
          const usedLegs = pendingLegs.filter(
            (leg) =>
              leg.guests.length > 0 ||
              leg.destination ||
              leg.departure_port ||
              leg.arrival_port ||
              leg.start_date ||
              leg.end_date ||
              leg.notes
          );
          for (const leg of usedLegs) {
            const lfd = new FormData();
            if (leg.destination) lfd.set("destination", leg.destination);
            if (leg.departure_port) lfd.set("departure_port", leg.departure_port);
            if (leg.arrival_port) lfd.set("arrival_port", leg.arrival_port);
            if (leg.start_date) lfd.set("start_date", leg.start_date);
            if (leg.end_date) lfd.set("end_date", leg.end_date);
            if (leg.notes) lfd.set("notes", leg.notes);
            const legResult = await addBookingLeg(boatId, created.id, lfd);
            if (!legResult.ok) return setFormError(legResult.error);
            for (const g of leg.guests) {
              const gfd = new FormData();
              gfd.set("name", g.name);
              if (g.passport_number) gfd.set("passport_number", g.passport_number);
              if (g.nationality) gfd.set("nationality", g.nationality);
              if (g.date_of_birth) gfd.set("date_of_birth", g.date_of_birth);
              if (g.photoFile) gfd.set("photo", g.photoFile);
              const guestResult = await addBookingGuest(
                boatId,
                created.id,
                gfd,
                legResult.id,
                g.photoFile ? undefined : g.favoritePhotoPath ?? undefined
              );
              if (guestResult.error) return setFormError(guestResult.error);
            }
          }
        }
        onSaved();
      }}
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
    >
      {formError && (
        <p className="rounded-lg border border-fleet-coral bg-fleet-coral/10 px-3 py-2 text-xs text-fleet-coral">{formError}</p>
      )}
      {lockToEvent ? (
        <input type="hidden" name="usage_type" value="event" />
      ) : isPrivate ? (
        // A private boat has no charter/owner distinction to make - every
        // trip on it is inherently owner use, so the choice itself is
        // pointless clutter here.
        <input type="hidden" name="usage_type" value={formType} />
      ) : (
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
          </select>
        </div>
      )}

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
            <label className="text-xs text-fleet-ink">{t("event_kind_field")}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEventKind("birthday")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  eventKind === "birthday" ? "border-fleet-teal bg-fleet-teal/10 text-fleet-navy" : "border-fleet-border text-fleet-ink"
                }`}
              >
                🎂 {t("cal_staff_birthday")}
              </button>
              <button
                type="button"
                onClick={() => setEventKind("event")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  eventKind === "event" ? "border-fleet-teal bg-fleet-teal/10 text-fleet-navy" : "border-fleet-border text-fleet-ink"
                }`}
              >
                🥂 {t("usage_event")}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("event_title")} *</label>
            <input
              name="title"
              required
              defaultValue={existingEvent ? stripBirthdayPrefix(existingEvent.title) : undefined}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("event_date_field")} *</label>
            <DateInput
              name="event_date"
              defaultValue={existingEvent?.event_date ?? prefillDate ?? undefined}
              locale={locale}
              className={inputClass}
            />
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
              onChange={(s, e) => {
                setTripStart(s);
                setTripEnd(e);
              }}
            />
          </div>
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
          {formType === "charter" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-fleet-ink">{t("booking_departure_time")}</label>
                <input type="time" name="departure_time" defaultValue={existing?.departure_time ?? undefined} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-fleet-ink">{t("booking_arrival_time")}</label>
                <input type="time" name="arrival_time" defaultValue={existing?.arrival_time ?? undefined} className={inputClass} />
              </div>
            </div>
          )}
          {!isPrivate && formType !== "owner" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("booking_price")}</label>
              <input name="price" type="number" step="0.01" defaultValue={existing?.price ?? undefined} className={inputClass} />
            </div>
          )}

          {!existing && (formType === "owner" || isPrivate) && (
            <div className="flex flex-col gap-2 border-t border-dashed border-fleet-border pt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-fleet-ink">{t("passports_title")}</label>
                <button
                  type="button"
                  onClick={() => {
                    if (showAddGuest && editingGuestIdx == null) {
                      setShowAddGuest(false);
                    } else {
                      setShowAddGuest(true);
                      setEditingGuestIdx(null);
                      setEditingLegIdx(null);
                    }
                  }}
                  className="text-xs font-bold text-fleet-teal"
                >
                  {showAddGuest && editingGuestIdx == null ? `✕ ${t("close_word")}` : `+ ${t("add_passport")}`}
                </button>
              </div>
              {showAddGuest && editingGuestIdx == null && (
                <AddGuestForm
                  key="new"
                  boatId={boatId}
                  favorites={favorites}
                  onAdd={(g) =>
                    setPendingLegs((p) => p.map((l, idx) => (idx === p.length - 1 ? { ...l, guests: [...l.guests, g] } : l)))
                  }
                  onDone={() => setShowAddGuest(false)}
                  locale={locale}
                />
              )}
              {pendingLegs.map((leg, i) => {
                const updateLeg = (patch: Partial<PendingLeg>) =>
                  setPendingLegs((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
                return (
                  <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-fleet-border p-2">
                    {pendingLegs.length > 1 && (
                      <span className="text-xs font-bold text-fleet-navy">
                        {t("leg_word")} {i + 1}
                      </span>
                    )}
                    {pendingLegs.length > 1 && (
                      <div className="grid grid-cols-3 gap-1.5">
                        <input
                          value={leg.destination}
                          onChange={(e) => updateLeg({ destination: e.target.value })}
                          placeholder={t("booking_area")}
                          className={inputClass}
                        />
                        <input
                          value={leg.departure_port}
                          onChange={(e) => updateLeg({ departure_port: e.target.value })}
                          placeholder={t("booking_departure_port")}
                          className={inputClass}
                        />
                        <input
                          value={leg.arrival_port}
                          onChange={(e) => updateLeg({ arrival_port: e.target.value })}
                          placeholder={t("booking_arrival_port")}
                          className={inputClass}
                        />
                      </div>
                    )}
                    {pendingLegs.length > 1 && (
                      <DateRangeCalendar
                        startName={`leg_${i}_start_date`}
                        endName={`leg_${i}_end_date`}
                        defaultStart={leg.start_date || undefined}
                        defaultEnd={leg.end_date || undefined}
                        locale={locale}
                        min={tripStart ?? undefined}
                        max={tripEnd ?? undefined}
                        required={false}
                        onChange={(s, e) => updateLeg({ start_date: s ?? "", end_date: e ?? "" })}
                      />
                    )}
                    {leg.guests.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {leg.guests.map((g, gi) => (
                          <div key={gi} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2 py-1.5 text-xs">
                            <BookUser size={16} className="text-fleet-brass" />
                            <span className="flex-1">
                              {g.name}
                              {g.passport_number ? ` · #${g.passport_number}` : ""}
                              {g.nationality ? ` · ${g.nationality}` : ""}
                            </span>
                            <button
                              type="button"
                              onClick={() => favoritePendingGuest(g)}
                              aria-label="favorite guest"
                              className={favoriteKeys.has(favoriteKey(g.name, g.passport_number)) ? "text-fleet-brass" : "text-fleet-ink hover:text-fleet-brass"}
                            >
                              <Star size={13} fill={favoriteKeys.has(favoriteKey(g.name, g.passport_number)) ? "currentColor" : "none"} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLegIdx(i);
                                setEditingGuestIdx(gi);
                                setShowAddGuest(true);
                              }}
                              className="text-fleet-ink hover:text-fleet-navy"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLeg({ guests: leg.guests.filter((_, gidx) => gidx !== gi) })}
                              className="text-fleet-ink hover:text-fleet-coral"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {showAddGuest && editingGuestIdx != null && editingLegIdx === i && (
                      <AddGuestForm
                        key={editingGuestIdx}
                        boatId={boatId}
                        initial={leg.guests[editingGuestIdx]}
                        favorites={favorites}
                        onAdd={(g) =>
                          updateLeg({
                            guests: leg.guests.map((existing, gidx) => (gidx === editingGuestIdx ? g : existing)),
                          })
                        }
                        onDone={() => {
                          setShowAddGuest(false);
                          setEditingGuestIdx(null);
                          setEditingLegIdx(null);
                        }}
                        locale={locale}
                      />
                    )}
                  </div>
                );
              })}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setPendingLegs((p) => [...p, { destination: "", departure_port: "", arrival_port: "", start_date: "", end_date: "", notes: "", guests: [] }]);
                    setShowAddGuest(false);
                    setEditingGuestIdx(null);
                    setEditingLegIdx(null);
                  }}
                  className="rounded-full bg-fleet-navy px-4 py-1.5 text-xs font-bold text-fleet-paper hover:opacity-90"
                >
                  {t("add_leg_button")}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex gap-2">
        {(existing || existingEvent) && (
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

type GuestFormInitial = {
  name: string;
  passport_number: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  photoUrl?: string | null;
};

function AddGuestForm({
  boatId,
  bookingId,
  legId,
  editingGuestId,
  initial,
  favorites,
  favoriteMode,
  favoriteId,
  onAdd,
  onDone,
  locale,
}: {
  boatId: string;
  bookingId?: string;
  legId?: string;
  editingGuestId?: string;
  initial?: GuestFormInitial;
  favorites: FavoriteGuestWithUrl[];
  favoriteMode?: boolean;
  favoriteId?: string;
  onAdd?: (guest: PendingGuest) => void;
  onDone?: () => void;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showPhotoPicked, setShowPhotoPicked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dob, setDob] = useState(initial?.date_of_birth ?? "");
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
    onDone?.();
  };

  const pickFavorite = async (f: FavoriteGuestWithUrl) => {
    if (onAdd) {
      onAdd({
        name: f.name,
        passport_number: f.passport_number,
        nationality: f.nationality,
        date_of_birth: f.date_of_birth,
        photoFile: null,
        favoritePhotoPath: f.photo_path ?? undefined,
      });
      resetAll();
      onDone?.();
      return;
    }
    const fd = new FormData();
    fd.set("name", f.name);
    if (f.passport_number) fd.set("passport_number", f.passport_number);
    if (f.nationality) fd.set("nationality", f.nationality);
    if (f.date_of_birth) fd.set("date_of_birth", f.date_of_birth);
    await addBookingGuest(boatId, bookingId as string, fd, legId, f.photo_path ?? undefined);
    resetAll();
    onDone?.();
  };

  const fields = (
    <>
      {!initial && !favoriteMode && favorites.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowFavorites((s) => !s)}
            className="flex items-center gap-1 self-start text-xs font-bold text-fleet-brass"
          >
            <Star size={12} fill="currentColor" /> {t("favorite_guests_title")}
          </button>
          {showFavorites && (
            <div className="flex flex-col gap-1 rounded-lg border border-fleet-border p-1.5">
              {favorites.map((f) => (
                <div key={f.id} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs hover:bg-fleet-paper">
                  <button
                    type="button"
                    onClick={() => pickFavorite(f)}
                    className="flex flex-1 items-center gap-2 text-start"
                  >
                    {f.photoUrl && isPdfUrl(f.photoUrl) ? (
                      <FileText size={14} className="shrink-0 text-fleet-brass" />
                    ) : f.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.photoUrl} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                    ) : (
                      <BookUser size={14} className="shrink-0 text-fleet-brass" />
                    )}
                    <span className="flex-1">
                      {f.name}
                      {f.passport_number ? ` · #${f.passport_number}` : ""}
                      {f.nationality ? ` · ${f.nationality}` : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeFavoriteGuest(boatId, f.id, f.photo_path)}
                    aria-label="remove favorite"
                    className="shrink-0 text-fleet-ink hover:text-fleet-coral"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <input ref={nameRef} name="name" defaultValue={initial?.name} placeholder={t("passport_name")} className={inputClass} />
      <div className="flex gap-1.5">
        <input
          ref={passportNumberRef}
          name="passport_number"
          defaultValue={initial?.passport_number ?? undefined}
          placeholder={t("passport_number")}
          className={inputClass}
        />
        <input
          ref={nationalityRef}
          name="nationality"
          defaultValue={initial?.nationality ?? undefined}
          placeholder={t("passport_nationality")}
          className={inputClass}
        />
      </div>
      <DateInput
        name="date_of_birth"
        value={dob}
        onChange={setDob}
        locale={locale}
        className={inputClass}
        placeholder={t("passport_dob")}
      />
      <div className="flex items-center gap-1.5">
        <input
          ref={fileRef}
          type="file"
          name="photo"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => onPassportFile(e.target.files?.[0])}
        />
        {!showPhotoPicked && initial?.photoUrl && isPdfUrl(initial.photoUrl) && (
          <FileText size={20} className="shrink-0 text-fleet-brass" />
        )}
        {!showPhotoPicked && initial?.photoUrl && !isPdfUrl(initial.photoUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={initial.photoUrl} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
        )}
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
            {t("save_guest_button")}
          </button>
        ) : (
          <button type="submit" className="rounded-lg bg-fleet-teal px-3 py-1.5 text-xs font-bold text-white">
            {t("save_guest_button")}
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
        setFormError(null);
        const result = favoriteMode
          ? favoriteId
            ? await updateFavoriteGuest(boatId, favoriteId, formData)
            : await addFavoriteGuest(boatId, formData)
          : editingGuestId
            ? await updateBookingGuest(boatId, editingGuestId, formData)
            : await addBookingGuest(boatId, bookingId as string, formData, legId);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        resetAll();
        onDone?.();
      }}
      className="flex flex-col gap-1.5"
    >
      {formError && (
        <p className="rounded-lg border border-fleet-coral bg-fleet-coral/10 px-2 py-1 text-[11px] text-fleet-coral">{formError}</p>
      )}
      {fields}
    </form>
  );
}

// Only used for a booking that already exists - a new/pending booking
// builds its legs client-side (see BookingForm) and submits them all at
// once when the trip itself is created.
function AddLegForm({
  boatId,
  bookingId,
  bookingStartDate,
  bookingEndDate,
  locale,
}: {
  boatId: string;
  bookingId: string;
  bookingStartDate: string;
  bookingEndDate: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-end">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-bold text-fleet-teal">
          {open ? `✕ ${t("close_word")}` : t("add_leg_button")}
        </button>
      </div>
      {open && (
        <form
          key={formKey}
          ref={formRef}
          action={async (formData: FormData) => {
            await addBookingLeg(boatId, bookingId, formData);
            setFormKey((k) => k + 1);
            setOpen(false);
          }}
          className="flex flex-col gap-1.5"
        >
          <div className="grid grid-cols-3 gap-1.5">
            <input name="destination" placeholder={t("booking_area")} className={inputClass} />
            <input name="departure_port" placeholder={t("booking_departure_port")} className={inputClass} />
            <input name="arrival_port" placeholder={t("booking_arrival_port")} className={inputClass} />
          </div>
          <DateRangeCalendar
            startName="start_date"
            endName="end_date"
            locale={locale}
            min={bookingStartDate}
            max={bookingEndDate}
            required={false}
          />
          <div className="flex items-center gap-1.5">
            <input name="notes" placeholder={t("booking_notes")} className={inputClass} />
            <button type="submit" className="shrink-0 rounded-lg bg-fleet-navy px-3 py-1.5 text-xs font-bold text-fleet-paper">
              {t("add_leg_button")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
