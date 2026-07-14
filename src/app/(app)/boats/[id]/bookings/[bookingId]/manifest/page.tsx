import Link from "next/link";
import { notFound } from "next/navigation";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { PrintButton } from "@/components/print-button";
import { getTranslator } from "@/lib/i18n/locale";

export default async function ManifestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; bookingId: string }>;
  searchParams: Promise<{ leg?: string }>;
}) {
  const { id, bookingId } = await params;
  const { leg: legParam } = await searchParams;
  const { boat } = await getBoatContext(id);
  const { t, locale } = await getTranslator();

  const supabase = await createClient();
  const [{ data: booking }, { data: guests }, { data: legs }, { data: crew }, { data: settings }] = await Promise.all([
    supabase.from("bookings").select("*").eq("id", bookingId).single(),
    supabase.from("booking_guests").select("*").eq("booking_id", bookingId).order("created_at"),
    supabase.from("booking_legs").select("*").eq("booking_id", bookingId).order("leg_number"),
    supabase.from("staff_visible").select("id, name, position").eq("boat_id", id).order("start_date"),
    supabase.from("app_settings").select("company_logo_path").eq("id", true).single(),
  ]);

  if (!booking) notFound();

  const allLegs = legs ?? [];
  const selectedLeg = legParam ? (allLegs.find((l) => l.id === legParam) ?? null) : null;
  // A specific ?leg= link scopes the whole manifest to just that leg's own
  // route and passengers - the other legs (and any trip-level "general"
  // guests) don't belong on that leg's separate list.
  const legsList = selectedLeg ? [selectedLeg] : allLegs;
  const guestsByLeg = new Map<string, NonNullable<typeof guests>>();
  const generalGuests: NonNullable<typeof guests> = [];
  for (const g of guests ?? []) {
    if (g.leg_id) {
      const arr = guestsByLeg.get(g.leg_id) ?? [];
      arr.push(g);
      guestsByLeg.set(g.leg_id, arr);
    } else {
      generalGuests.push(g);
    }
  }
  const passengerGroups =
    legsList.length > 0
      ? [
          ...legsList.map((leg) => ({
            label:
              allLegs.length > 1
                ? `${t("leg_word")} ${leg.leg_number}${leg.destination ? ` · ${leg.destination}` : ""}`
                : leg.destination,
            route: [leg.departure_port, leg.arrival_port].filter(Boolean).join(" → "),
            guests: guestsByLeg.get(leg.id) ?? [],
          })),
          ...(!selectedLeg && generalGuests.length > 0
            ? [{ label: t("legs_general_guests"), route: "", guests: generalGuests }]
            : []),
        ]
      : [{ label: t("manifest_passengers"), route: "", guests: guests ?? [] }];
  const displayedGuestCount = selectedLeg ? (guestsByLeg.get(selectedLeg.id) ?? []).length : (guests?.length ?? 0);

  const [boatLogoResult, companyLogoResult] = await Promise.all([
    boat.logo_path
      ? supabase.storage.from("boat-photos").createSignedUrl(boat.logo_path, 3600)
      : Promise.resolve({ data: null }),
    settings?.company_logo_path
      ? supabase.storage.from("company-assets").createSignedUrl(settings.company_logo_path, 3600)
      : Promise.resolve({ data: null }),
  ]);
  const boatLogoUrl = boatLogoResult.data?.signedUrl ?? null;
  const companyLogoUrl = companyLogoResult.data?.signedUrl ?? "/mys-logo.png";

  return (
    <div className="flex flex-col gap-2">
      {/* The passenger table (name/passport number/date of birth/nationality)
          is wide - landscape gives it room without wrapping. Scoped to this
          page only, so it doesn't change orientation for reports/invoices
          printed elsewhere in the app. */}
      <style>{"@media print { @page { size: landscape; } }"}</style>
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/boats/${boat.id}/bookings`} className="text-sm font-medium text-fleet-teal hover:underline">
          ← {t("back_to_bookings")}
        </Link>
        <PrintButton locale={locale} />
      </div>

      <div className="relative rounded-xl border border-fleet-border bg-white p-6 print:p-0 print:border-0">
        {/* On a narrow phone screen the logos flow normally, above the title,
            at a modest size - there isn't room to reserve a side column for
            them without the trip info text wrapping badly. From the sm
            breakpoint up (and always when printing, where the page is wide
            like a desktop), they switch to sitting out of the document flow
            in the top-right corner at full size, so their height never
            pushes the title/info/table down. */}
        {(companyLogoUrl || boatLogoUrl) && (
          <div className="mb-3 flex items-end justify-end gap-3 sm:absolute sm:end-6 sm:top-6 sm:mb-0 sm:gap-4 print:absolute print:end-0 print:top-0 print:mb-0">
            {companyLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={companyLogoUrl} alt="" className="h-12 w-auto object-contain sm:h-24 print:h-24" />
            )}
            {boatLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={boatLogoUrl} alt="" className="h-12 w-auto object-contain sm:h-24 print:h-24" />
            )}
          </div>
        )}
        <h1 className="mb-2 text-lg font-bold tracking-wide text-fleet-navy sm:max-w-[55%] print:max-w-[55%]">{t("manifest_title")}</h1>
        <div className="mb-4 sm:max-w-[55%] print:max-w-[55%]">
          <div className="mb-1 text-sm text-fleet-ink">
            {t("manifest_boat")}: <b className="text-fleet-navy">{boat.name}</b>
          </div>
          {boat.registration_number && (
            <div className="mb-1 text-sm text-fleet-ink">
              {t("boat_registration_number")}: <b className="text-fleet-navy">{boat.registration_number}</b>
            </div>
          )}
          {boat.home_port && (
            <div className="mb-1 text-sm text-fleet-ink">
              {t("spec_homeport")}: <b className="text-fleet-navy">{boat.home_port}</b>
            </div>
          )}
          {boat.flag && (
            <div className="mb-1 text-sm text-fleet-ink">
              {t("spec_flag")}: <b className="text-fleet-navy">{boat.flag}</b>
            </div>
          )}
          {boat.length_meters && (
            <div className="mb-1 text-sm text-fleet-ink">
              {t("spec_length")}: <b className="text-fleet-navy">{boat.length_meters} {t("unit_meters")}</b>
            </div>
          )}
          {boat.beam_meters && (
            <div className="mb-1 text-sm text-fleet-ink">
              {t("spec_beam")}: <b className="text-fleet-navy">{boat.beam_meters} {t("unit_meters")}</b>
            </div>
          )}
          {((selectedLeg ? selectedLeg.destination : booking.sailing_area) ||
            (selectedLeg ? selectedLeg.departure_port || selectedLeg.arrival_port : booking.departure_port || booking.arrival_port)) && (
            <div className="text-sm text-fleet-ink">
              {t("manifest_route")}:{" "}
              <b className="text-fleet-navy">
                {(selectedLeg ? selectedLeg.destination : booking.sailing_area)
                  ? `${selectedLeg ? selectedLeg.destination : booking.sailing_area} · `
                  : ""}
                {(selectedLeg ? selectedLeg.departure_port : booking.departure_port) || "—"} →{" "}
                {(selectedLeg ? selectedLeg.arrival_port : booking.arrival_port) || "—"}
              </b>
            </div>
          )}
        </div>

        <div className="mb-1.5 border-b-2 border-fleet-navy pb-1 text-sm font-bold">{t("crew_word")} ({crew?.length ?? 0})</div>
        <table className="mb-4 w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border-b border-fleet-border px-1 py-1.5 text-start">{t("name")}</th>
              <th className="border-b border-fleet-border px-1 py-1.5 text-start">{t("position")}</th>
            </tr>
          </thead>
          <tbody>
            {!crew || crew.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-1 py-2 text-fleet-ink">
                  {t("no_crew_registered")}
                </td>
              </tr>
            ) : (
              crew.map((m) => (
                <tr key={m.id}>
                  <td className="border-b border-dotted border-fleet-border px-1 py-1.5">{m.name}</td>
                  <td className="border-b border-dotted border-fleet-border px-1 py-1.5">{m.position || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mb-1.5 border-b-2 border-fleet-navy pb-1 text-sm font-bold">
          {t("manifest_passengers")} ({displayedGuestCount})
        </div>
        {passengerGroups.map((group, i) => (
          <div key={i} className={i > 0 ? "mt-3" : undefined}>
            {legsList.length > 0 && (
              <div className="mb-1 flex items-baseline gap-1.5 text-xs">
                {group.label && <span className="font-bold text-fleet-ink">{group.label}</span>}
                {group.route && <span className="text-fleet-ink" dir="ltr">· {group.route}</span>}
              </div>
            )}
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border-b border-fleet-border px-1 py-1.5 text-start">{t("name")}</th>
                  <th className="border-b border-fleet-border px-1 py-1.5 text-start">{t("passport_number")}</th>
                  <th className="border-b border-fleet-border px-1 py-1.5 text-start">{t("passport_dob")}</th>
                  <th className="border-b border-fleet-border px-1 py-1.5 text-start">{t("passport_nationality")}</th>
                </tr>
              </thead>
              <tbody>
                {group.guests.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-1 py-2 text-fleet-ink">
                      {t("none_passports")}
                    </td>
                  </tr>
                ) : (
                  group.guests.map((g) => (
                    <tr key={g.id}>
                      <td className="border-b border-dotted border-fleet-border px-1 py-1.5">{g.name}</td>
                      <td className="border-b border-dotted border-fleet-border px-1 py-1.5">{g.passport_number || "—"}</td>
                      <td className="border-b border-dotted border-fleet-border px-1 py-1.5" dir="ltr">{g.date_of_birth ? formatDateDisplay(g.date_of_birth) : "—"}</td>
                      <td className="border-b border-dotted border-fleet-border px-1 py-1.5">{g.nationality || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ))}

        <div className="mt-4 text-[11px] text-fleet-ink">{t("manifest_generated")}: <span dir="ltr">{formatDateDisplay(todayLocalISO())}</span></div>
      </div>
    </div>
  );
}
