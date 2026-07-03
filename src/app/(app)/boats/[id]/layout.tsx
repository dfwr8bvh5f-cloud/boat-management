import Link from "next/link";
import { Camera, ChevronLeft, Ship } from "lucide-react";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { TabLink } from "@/components/tab-link";
import { BoatPhotoGallery, type GalleryPhoto } from "@/components/boat-photo-gallery";
import { getTranslator } from "@/lib/i18n/locale";

export default async function BoatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const { t, locale } = await getTranslator();
  const canUploadPhotos = profile.role === "management" || profile.boat_id === boat.id;

  const OPERATIONAL_TABS = [
    { href: "", label: t("nav_overview"), icon: "overview" as const },
    { href: "/maintenance", label: t("nav_maintenance"), icon: "maintenance" as const },
    { href: "/finance", label: t("nav_finance"), icon: "finance" as const },
    { href: "/bookings", label: t("nav_bookings"), icon: "bookings" as const },
    { href: "/documents", label: t("nav_documents"), icon: "documents" as const },
    { href: "/reports", label: t("nav_reports"), icon: "reports" as const },
    { href: "/staff", label: t("nav_staff"), icon: "staff" as const },
    { href: "/store", label: t("nav_store"), icon: "store" as const },
  ];

  // A boat marked for sale doesn't need day-to-day operational tabs - it gets
  // a trimmed nav plus the sale Catalog tab instead.
  const FOR_SALE_TABS = [
    { href: "", label: t("nav_overview"), icon: "overview" as const },
    { href: "/finance", label: t("nav_finance"), icon: "finance" as const },
    { href: "/documents", label: t("nav_documents"), icon: "documents" as const },
    { href: "/catalog", label: t("nav_catalog"), icon: "catalog" as const },
  ];

  // A sub-boat (tender/annex under a parent boat) doesn't run its own
  // finance, schedule, reports or crew - only overview/maintenance/documents.
  const SUB_BOAT_TABS = OPERATIONAL_TABS.filter(
    (tab) => !["/finance", "/bookings", "/reports", "/staff", "/store"].includes(tab.href)
  );

  const tabs =
    boat.boat_type === "for_sale" ? FOR_SALE_TABS : boat.parent_boat_id ? SUB_BOAT_TABS : OPERATIONAL_TABS;

  const supabase = await createClient();

  const { data: galleryRows } = await supabase.from("boat_gallery_photos").select("*").eq("boat_id", boat.id).order("created_at");

  const photoPaths = [
    ...new Set([...(boat.logo_path ? [boat.logo_path] : []), ...(galleryRows ?? []).map((p) => p.photo_path)]),
  ];
  const signedUrlByPath = new Map<string, string>();
  if (photoPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage.from("boat-photos").createSignedUrls(photoPaths, 3600);
    for (const s of signedUrls ?? []) {
      if (s.signedUrl) signedUrlByPath.set(s.path ?? "", s.signedUrl);
    }
  }

  const logoUrl: string | null = (boat.logo_path && signedUrlByPath.get(boat.logo_path)) ?? null;

  const galleryPhotos: GalleryPhoto[] = (galleryRows ?? []).map((p) => ({
    id: p.id,
    path: p.photo_path,
    url: signedUrlByPath.get(p.photo_path) ?? "",
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/boats"
            aria-label={t("nav_all_boats")}
            title={t("nav_all_boats")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fleet-brass hover:bg-fleet-paper"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-fleet-paper">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <Ship size={28} className="text-fleet-brass" />
            )}
          </div>
          <div className="h-12 w-px shrink-0 bg-fleet-border" />
          <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{boat.name}</h1>
        </div>

        <BoatPhotoGallery
          boatId={boat.id}
          photos={galleryPhotos}
          primaryPath={boat.image_path}
          canUpload={canUploadPhotos}
          canManage={canEdit}
          locale={locale}
          trigger={
            <div className="flex -space-x-2.5 rtl:space-x-reverse">
              {galleryPhotos.length > 0 ? (
                galleryPhotos.slice(0, 4).map((p) => (
                  <div key={p.id} className="h-12 w-12 overflow-hidden rounded-lg border-2 border-white bg-fleet-paper shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  </div>
                ))
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-fleet-brass bg-fleet-paper text-fleet-brass">
                  <Camera size={16} />
                </div>
              )}
            </div>
          }
        />
      </div>

      <nav className="flex w-full border-b border-fleet-border print:hidden">
        {tabs.map((tab) => (
          <TabLink
            key={tab.href}
            href={`/boats/${boat.id}${tab.href}`}
            label={tab.label}
            icon={tab.icon}
            exact={tab.href === ""}
          />
        ))}
      </nav>

      {children}
    </div>
  );
}
