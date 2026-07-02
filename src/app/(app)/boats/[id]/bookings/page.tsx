import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { BookingsManager } from "@/components/bookings-manager";
import { getLocale } from "@/lib/i18n/locale";

export default async function BookingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const [{ data: bookings }, { data: guests }, { data: crew }] = await Promise.all([
    supabase.from("bookings").select("*").eq("boat_id", boat.id).order("start_date", { ascending: false }),
    supabase.from("booking_guests").select("*").eq("boat_id", boat.id).order("created_at"),
    supabase.from("staff_visible").select("name, position").eq("boat_id", boat.id).order("start_date"),
  ]);

  const guestsWithUrls = await Promise.all(
    (guests ?? []).map(async (g) => {
      if (!g.photo_path) return { ...g, photoUrl: null };
      const { data } = await supabase.storage.from("booking-guests").createSignedUrl(g.photo_path, 3600);
      return { ...g, photoUrl: data?.signedUrl ?? null };
    })
  );

  const bookingsWithGuests = (bookings ?? []).map((b) => ({
    ...b,
    guests: guestsWithUrls.filter((g) => g.booking_id === b.id),
  }));

  return (
    <BookingsManager
      boatId={boat.id}
      bookings={bookingsWithGuests}
      crew={crew ?? []}
      canAdd={canEdit}
      isManagement={profile.role === "management"}
      showMybaOption={boat.boat_type !== "private"}
      locale={locale}
    />
  );
}
