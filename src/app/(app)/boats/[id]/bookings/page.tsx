import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { BookingsManager } from "@/components/bookings-manager";
import { getLocale } from "@/lib/i18n/locale";

export default async function BookingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const [{ data: bookings }, { data: guests }, { data: crew }, { data: events }] = await Promise.all([
    supabase.from("bookings").select("*").eq("boat_id", boat.id).order("start_date", { ascending: false }),
    supabase.from("booking_guests").select("*").eq("boat_id", boat.id).order("created_at"),
    supabase.from("staff_visible").select("name, position, date_of_birth").eq("boat_id", boat.id).order("start_date"),
    supabase.from("boat_events").select("*").eq("boat_id", boat.id).order("event_date"),
  ]);

  const guestPaths = [...new Set((guests ?? []).flatMap((g) => (g.photo_path ? [g.photo_path] : [])))];
  const signedUrlByPath = new Map<string, string>();
  if (guestPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage.from("booking-guests").createSignedUrls(guestPaths, 3600);
    for (const s of signedUrls ?? []) {
      if (s.signedUrl) signedUrlByPath.set(s.path ?? "", s.signedUrl);
    }
  }
  const guestsWithUrls = (guests ?? []).map((g) => ({
    ...g,
    photoUrl: (g.photo_path && signedUrlByPath.get(g.photo_path)) ?? null,
  }));

  const bookingsWithGuests = (bookings ?? []).map((b) => ({
    ...b,
    guests: guestsWithUrls.filter((g) => g.booking_id === b.id),
  }));

  return (
    <BookingsManager
      boatId={boat.id}
      bookings={bookingsWithGuests}
      events={events ?? []}
      crew={crew ?? []}
      canAdd={canEdit}
      isManagement={profile.role === "management"}
      showMybaOption={boat.boat_type !== "private"}
      isPrivate={boat.boat_type === "private"}
      locale={locale}
    />
  );
}
