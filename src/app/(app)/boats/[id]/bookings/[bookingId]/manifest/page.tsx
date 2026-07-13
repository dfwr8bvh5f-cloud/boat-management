import Link from "next/link";
import { notFound } from "next/navigation";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getUsageTypeLabels } from "@/lib/labels";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { PrintButton } from "@/components/print-button";
import { getTranslator } from "@/lib/i18n/locale";

export default async function ManifestPage({
  params,
}: {
  params: Promise<{ id: string; bookingId: string }>;
}) {
  const { id, bookingId } = await params;
  const { boat } = await getBoatContext(id);
  const { t, locale } = await getTranslator();
  const usageTypeLabels = getUsageTypeLabels(locale);

  const supabase = await createClient();
  const [{ data: booking }, { data: guests }, { data: legs }, { data: crew }, { data: settings }] = await Promise.all([
    supabase.from("bookings").select("*").eq("id", bookingId).single(),
    supabase.from("booking_guests").select("*").eq("booking_id", bookingId).order("created_at"),
    supabase.from("booking_legs").select("*").eq("booking_id", bookingId).order("leg_number"),
    supabase.from("staff_visible").select("id, name, position").eq("boat_id", id).order("start_date"),
    supabase.from("app_settings").select("company_logo_path").eq("id", true).single(),
  ]);

  if (!booking) notFound();

  const legsList = legs ?? [];
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
            label: `${t("leg_word")} ${leg.leg_number}${leg.destination ? ` · ${leg.destination}` : ""}`,
            guests: guestsByLeg.get(leg.id) ?? [],
          })),
          ...(generalGuests.length > 0 ? [{ label: t("legs_general_guests"), guests: generalGuests }] : []),
        ]
      : [{ label: t("manifest_passengers"), guests: guests ?? [] }];

  const [boatLogoResult, companyLogoResult] = await Promise.all([
    boat.logo_path
      ? supabase.storage.from("boat-photos").createSignedUrl(boat.logo_path, 3600)
      : Promise.resolve({ data: null }),
    settings?.company_logo_path
      ? supabase.storage.from("company-assets").createSignedUrl(settings.company_logo_path, 3600)
      : Promise.resolve({ data: null }),
  ]);
  const boatLogoUrl = boatLogoResult.data?.signedUrl ?? null;
  const companyLogoUrl = companyLogoResult.data?.signedUrl ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/boats/${boat.id}/bookings`} className="text-sm font-medium text-fleet-teal hover:underline">
          ← {t("back_to_bookings")}
        </Link>
        <PrintButton locale={locale} />
      </div>

      <div className="rounded-xl border border-fleet-border bg-white p-6">
        {(companyLogoUrl || boatLogoUrl) && (
          <div className="mb-3 flex items-center justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {companyLogoUrl ? <img src={companyLogoUrl} alt="" className="h-12 w-auto object-contain" /> : <span />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {boatLogoUrl && <img src={boatLogoUrl} alt="" className="h-12 w-auto object-contain" />}
          </div>
        )}
        <h1 className="mb-3 text-lg font-bold tracking-wide text-fleet-navy">{t("manifest_title")}</h1>
        <div className="mb-4">
          <div className="mb-1 text-sm text-fleet-ink">
            {t("manifest_boat")}: <b className="text-fleet-navy">{boat.name}</b>
          </div>
          <div className="mb-1 text-sm text-fleet-ink">
            {t("manifest_trip")}: <b className="text-fleet-navy">{booking.booking_reference || booking.customer_name}</b> ({usageTypeLabels[booking.usage_type]})
          </div>
          <div className="mb-1 text-sm text-fleet-ink">
            {t("manifest_dates")}: <b className="text-fleet-navy" dir="ltr">{formatDateDisplay(booking.start_date)} – {formatDateDisplay(booking.end_date)}</b>
            {booking.sailing_area ? ` · ${booking.sailing_area}` : ""}
          </div>
          {(booking.departure_port || booking.arrival_port) && (
            <div className="text-sm text-fleet-ink">
              {t("manifest_route")}:{" "}
              <b className="text-fleet-navy">
                {booking.departure_port || "—"} → {booking.arrival_port || "—"}
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
          {t("manifest_passengers")} ({guests?.length ?? 0})
        </div>
        {passengerGroups.map((group, i) => (
          <div key={i} className={i > 0 ? "mt-3" : undefined}>
            {legsList.length > 0 && <div className="mb-1 text-xs font-bold text-fleet-ink">{group.label}</div>}
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
