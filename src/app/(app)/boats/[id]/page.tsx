import Link from "next/link";
import { Wallet, Wrench, Users, ChevronDown, Ship, MapPin } from "lucide-react";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { updateBoat, deleteBoat, uploadBoatLogo, uploadBoatImage } from "@/lib/actions/boats";
import { BoatForm } from "@/components/boat-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CATEGORY_LABELS, OP_STATUS_LABELS } from "@/lib/labels";

function formatCurrency(n: number) {
  return `₪${n.toLocaleString("he-IL")}`;
}

export default async function BoatOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit, profile } = await getBoatContext(id);
  const isOperational = boat.boat_type !== "for_sale";

  const supabase = await createClient();
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [
    { data: budgetRows },
    { data: expensesYTD },
    { data: recentExpenses },
    { data: openIssues },
    { data: recentIssues },
    { count: crewCountRaw },
  ] = await Promise.all([
    isOperational
      ? supabase.from("budget_categories").select("amount").eq("boat_id", boat.id)
      : Promise.resolve({ data: null }),
    isOperational
      ? supabase
          .from("expenses")
          .select("amount")
          .eq("boat_id", boat.id)
          .eq("status", "approved")
          .gte("expense_date", yearStart)
      : Promise.resolve({ data: null }),
    supabase
      .from("expenses")
      .select("*")
      .eq("boat_id", boat.id)
      .order("expense_date", { ascending: false })
      .limit(5),
    isOperational
      ? supabase.from("issues").select("id").eq("boat_id", boat.id).not("op_status", "in", "(completed,cancelled)")
      : Promise.resolve({ data: null }),
    isOperational
      ? supabase.from("issues").select("*").eq("boat_id", boat.id).order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: null }),
    isOperational
      ? supabase.from("staff_visible").select("id", { count: "exact", head: true }).eq("boat_id", boat.id).eq("status", "approved")
      : Promise.resolve({ count: 0 }),
  ]);

  const [{ data: logoUrlData }, { data: imageUrlData }] = await Promise.all([
    boat.logo_path
      ? supabase.storage.from("boat-photos").createSignedUrl(boat.logo_path, 3600)
      : Promise.resolve({ data: null }),
    boat.image_path
      ? supabase.storage.from("boat-photos").createSignedUrl(boat.image_path, 3600)
      : Promise.resolve({ data: null }),
  ]);
  const logoUrl = logoUrlData?.signedUrl ?? null;
  const imageUrl = imageUrlData?.signedUrl ?? null;

  const annualBudget = (budgetRows ?? []).reduce((s, b) => s + b.amount, 0);
  const spentYTD = (expensesYTD ?? []).reduce((s, e) => s + e.amount, 0);
  const budgetPct = annualBudget ? Math.min(100, Math.round((spentYTD / annualBudget) * 100)) : 0;
  const openIssuesCount = openIssues?.length ?? 0;
  const crewCount = crewCountRaw ?? 0;

  const specs = [
    { label: "דגם", value: boat.model },
    { label: "שנת ייצור", value: boat.year_built ? String(boat.year_built) : null },
    { label: "אורך", value: boat.length_meters ? `${boat.length_meters}m` : null },
    { label: "רוחב", value: boat.beam_meters ? `${boat.beam_meters}m` : null },
    { label: "שוקע", value: boat.draft_meters ? `${boat.draft_meters}m` : null },
    { label: "נמל בית", value: boat.home_port },
    { label: "דגל", value: boat.flag },
    { label: "מקום עגינה", value: boat.berth },
    { label: "מספר רישוי", value: boat.registration_number },
    { label: "MMSI", value: boat.mmsi },
  ].filter((s) => s.value);

  return (
    <div className="flex flex-col gap-6">
      {imageUrl && (
        <div className="overflow-hidden rounded-xl border border-fleet-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={boat.name} className="h-48 w-full object-cover sm:h-64" />
        </div>
      )}

      {isOperational && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-fleet-border bg-white p-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-fleet-ink">
              <Wallet size={13} /> הוצאות השנה
            </div>
            <div className="text-lg font-bold text-fleet-navy">{formatCurrency(spentYTD)}</div>
            {annualBudget > 0 && (
              <>
                <div className="mt-1 text-[11px] text-fleet-ink">
                  מתוך {formatCurrency(annualBudget)} תקציב שנתי
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fleet-border">
                  <div
                    className={`h-full ${budgetPct <= 70 ? "bg-fleet-moss" : "bg-fleet-coral"}`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-fleet-border bg-white p-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-fleet-ink">
              <Wrench size={13} /> תקלות פתוחות
            </div>
            <div className={`text-lg font-bold ${openIssuesCount > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
              {openIssuesCount}
            </div>
            <div className="mt-1 text-[11px] text-fleet-ink">
              {openIssuesCount > 0 ? "דורש טיפול" : "אין תקלות פתוחות"}
            </div>
          </div>

          <div className="rounded-xl border border-fleet-border bg-white p-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-fleet-ink">
              <Users size={13} /> אנשי צוות
            </div>
            <div className="text-lg font-bold text-fleet-navy">{crewCount}</div>
            <div className="mt-1 text-[11px] text-fleet-ink">על הסירה</div>
          </div>
        </div>
      )}

      {specs.length > 0 && (
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <Ship size={15} className="text-fleet-brass" /> מפרט הסירה
            </div>
            {boat.mmsi && (
              <a
                href={`https://www.marinetraffic.com/en/ais/details/ships/mmsi:${encodeURIComponent(boat.mmsi)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-fleet-brass hover:underline"
              >
                <MapPin size={13} /> מיקום חי (AIS)
              </a>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            {specs.map((s) => (
              <div key={s.label}>
                <dt className="text-[11px] text-fleet-ink">{s.label}</dt>
                <dd className="font-medium text-fleet-navy">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {isOperational && recentIssues && recentIssues.length > 0 && (
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <Wrench size={15} className="text-fleet-brass" /> תקלות אחרונות
            </div>
            <Link href={`/boats/${boat.id}/maintenance`} className="text-xs font-medium text-fleet-brass hover:underline">
              הצג הכל
            </Link>
          </div>
          <div className="flex flex-col gap-1.5">
            {recentIssues.map((i) => (
              <div key={i.id} className="flex items-center justify-between border-b border-dotted border-fleet-border py-1.5 text-sm last:border-0">
                <span className="text-fleet-navy">{i.title}</span>
                <span className="text-xs text-fleet-ink">{OP_STATUS_LABELS[i.op_status]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentExpenses && recentExpenses.length > 0 && (
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <Wallet size={15} className="text-fleet-brass" /> הוצאות אחרונות
            </div>
            <Link href={`/boats/${boat.id}/finance`} className="text-xs font-medium text-fleet-brass hover:underline">
              הצג הכל
            </Link>
          </div>
          <div className="flex flex-col gap-1.5">
            {recentExpenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 border-b border-dotted border-fleet-border py-1.5 text-sm last:border-0">
                <span className="min-w-0 flex-1 truncate text-fleet-navy">{e.description}</span>
                <span className="shrink-0 text-xs text-fleet-ink">{CATEGORY_LABELS[e.category]}</span>
                <span className="shrink-0 font-medium text-fleet-navy">{formatCurrency(e.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="group rounded-xl border border-fleet-border bg-white p-4 open:pb-5">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-fleet-navy">
          פרטי הסירה
          <ChevronDown size={16} className="text-fleet-brass transition-transform group-open:rotate-180" />
        </summary>
        {canEdit && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <form
              action={uploadBoatLogo.bind(null, boat.id)}
              encType="multipart/form-data"
              className="flex items-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper p-3"
            >
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md bg-white object-contain" />
              )}
              <input name="logo" type="file" accept="image/*" required className="min-w-0 flex-1 text-xs" />
              <button type="submit" className="shrink-0 rounded-md bg-fleet-teal px-3 py-1.5 text-xs font-bold text-white">
                לוגו הסירה
              </button>
            </form>
            <form
              action={uploadBoatImage.bind(null, boat.id)}
              encType="multipart/form-data"
              className="flex items-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper p-3"
            >
              <input name="image" type="file" accept="image/*" required className="min-w-0 flex-1 text-xs" />
              <button type="submit" className="shrink-0 rounded-md bg-fleet-teal px-3 py-1.5 text-xs font-bold text-white">
                תמונת הסירה
              </button>
            </form>
          </div>
        )}
        <form action={updateBoat.bind(null, boat.id)} className="mt-4 flex flex-col gap-6">
          <BoatForm boat={boat} disabled={!canEdit} />
          {canEdit && (
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-fleet-teal px-6 py-2.5 text-sm font-bold text-white hover:opacity-90"
              >
                שמור שינויים
              </button>
            </div>
          )}
        </form>
      </details>

      {profile.role === "management" && (
        <div className="flex items-center justify-between rounded-xl border border-fleet-coral/40 bg-fleet-coral/10 p-4">
          <div>
            <h2 className="text-sm font-bold text-fleet-coral">מחיקת סירה</h2>
            <p className="text-xs text-fleet-coral/80">פעולה זו תמחק לצמיתות את הסירה ואת כל הנתונים המקושרים אליה.</p>
          </div>
          <form action={deleteBoat.bind(null, boat.id)}>
            <ConfirmSubmitButton
              confirmMessage="למחוק את הסירה לצמיתות? הפעולה בלתי הפיכה."
              className="rounded-lg border border-fleet-coral/50 bg-white px-4 py-2 text-xs font-bold text-fleet-coral hover:bg-fleet-coral/10"
            >
              מחק סירה
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
