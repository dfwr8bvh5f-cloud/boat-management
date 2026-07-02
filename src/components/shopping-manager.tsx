"use client";

import { useRef, useState } from "react";
import { Camera, ChevronDown, ShoppingCart, Trash2 } from "lucide-react";
import { createShoppingList, uploadShoppingItemPhoto, toggleShoppingItem, deleteShoppingList } from "@/lib/actions/shopping";
import { SHOPPING_UNITS, SHOPPING_UNIT_LABELS } from "@/lib/labels";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import type { ShoppingList, ShoppingListItem, ShoppingUnit } from "@/lib/types/database";

type ListWithItems = ShoppingList & { items: (ShoppingListItem & { photoUrl: string | null })[] };
type BasketDraft = { name: string; quantity: number; unit: ShoppingUnit; photoPath: string | null };

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export function ShoppingManager({
  boatId,
  lists,
  trips,
  canCreate,
}: {
  boatId: string;
  lists: ListWithItems[];
  trips: { id: string; customer_name: string; start_date: string; end_date: string }[];
  canCreate: boolean;
}) {
  const [building, setBuilding] = useState(false);
  const [title, setTitle] = useState("");
  const [tripId, setTripId] = useState("");
  const [basket, setBasket] = useState<BasketDraft[]>([]);
  const [draft, setDraft] = useState({ name: "", quantity: "1", unit: "pcs" as ShoppingUnit });
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);

  const addToBasket = async () => {
    if (!draft.name.trim()) return;
    let photoPath: string | null = null;
    if (pendingFileRef.current) {
      setBusy(true);
      try {
        photoPath = await uploadShoppingItemPhoto(boatId, pendingFileRef.current);
      } finally {
        setBusy(false);
        pendingFileRef.current = null;
      }
    }
    setBasket((b) => [...b, { name: draft.name, quantity: Number(draft.quantity || 1), unit: draft.unit, photoPath }]);
    setDraft({ name: "", quantity: "1", unit: "pcs" });
  };

  const sendList = async () => {
    if (basket.length === 0) return;
    await createShoppingList(boatId, title, tripId || null, basket);
    setBasket([]);
    setTitle("");
    setTripId("");
    setBuilding(false);
  };

  const sorted = [...lists].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={() => setBuilding((s) => !s)}
            className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
          >
            {building ? "✕ סגור" : "+ רשימה חדשה"}
          </button>
        </div>
      )}

      {building && canCreate && (
        <div className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`רשימת קניות ${new Date().toISOString().slice(0, 10)}`}
            className={inputClass}
          />
          {trips.length > 0 && (
            <select value={tripId} onChange={(e) => setTripId(e.target.value)} className={inputClass}>
              <option value="">ללא טיול מקושר</option>
              {trips.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.customer_name} ({b.start_date} – {b.end_date})
                </option>
              ))}
            </select>
          )}

          {basket.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-fleet-ink">הסל ({basket.length})</div>
              {basket.map((it, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2 py-1.5 text-sm">
                  <ShoppingCart size={14} className="text-fleet-brass" />
                  <span className="flex-1">{it.name}</span>
                  <span className="text-xs text-fleet-ink">
                    {it.quantity} {SHOPPING_UNIT_LABELS[it.unit]}
                  </span>
                  <button onClick={() => setBasket((b) => b.filter((_, idx) => idx !== i))} className="text-fleet-ink">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5 border-t border-dashed border-fleet-border pt-3">
            <div className="flex gap-1.5">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="שם המוצר"
                className={`${inputClass} flex-[2]`}
              />
              <input
                type="number"
                min={1}
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                className={`${inputClass} flex-1`}
              />
              <select
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value as ShoppingUnit })}
                className={`${inputClass} flex-1`}
              >
                {SHOPPING_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {SHOPPING_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                pendingFileRef.current = e.target.files?.[0] ?? null;
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy"
              >
                <Camera size={15} /> תמונה
              </button>
              <button
                type="button"
                onClick={addToBasket}
                disabled={busy}
                className="flex-1 rounded-lg bg-fleet-navy py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? "…" : "הוסף לסל"}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={sendList}
              disabled={basket.length === 0}
              className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white disabled:bg-fleet-brass/40"
            >
              שלח לצוות
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          אין רשימות קניות עדיין.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((list) => {
            const isOpen = openId === list.id;
            const checkedCount = list.items.filter((it) => it.checked).length;
            const complete = list.items.length > 0 && checkedCount === list.items.length;
            const trip = list.booking_id ? trips.find((b) => b.id === list.booking_id) : null;
            return (
              <div key={list.id} className="rounded-xl border border-fleet-border bg-white p-3">
                <button
                  onClick={() => setOpenId(isOpen ? null : list.id)}
                  className="flex w-full items-center gap-2.5 text-start"
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${complete ? "bg-emerald-50" : "bg-fleet-paper"}`}>
                    <ShoppingCart size={17} className={complete ? "text-fleet-moss" : "text-fleet-brass"} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {trip && <div className="text-[10px] font-bold text-fleet-teal">{trip.customer_name}</div>}
                    <div className="text-sm font-bold">{list.title}</div>
                    <div className="text-xs text-fleet-ink">
                      {checkedCount}/{list.items.length} נאספו
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-fleet-brass transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                </button>
                {isOpen && (
                  <div className="mt-3 border-t border-dashed border-fleet-border pt-3">
                    <div className="mb-2.5 flex flex-col gap-1.5">
                      {list.items.map((it) => (
                        <form key={it.id} action={toggleShoppingItem.bind(null, boatId, it.id, !it.checked)}>
                          <button
                            type="submit"
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm ${it.checked ? "bg-emerald-50" : "bg-fleet-paper"}`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${it.checked ? "border-fleet-moss bg-fleet-moss" : "border-fleet-border bg-white"}`}
                            >
                              {it.checked && <span className="text-[10px] text-white">✓</span>}
                            </span>
                            {it.photoUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.photoUrl} alt="" className="h-7 w-7 rounded object-cover" />
                            )}
                            <span className={`flex-1 ${it.checked ? "text-fleet-ink line-through" : ""}`}>{it.name}</span>
                            <span className="text-xs text-fleet-ink">
                              {it.quantity} {SHOPPING_UNIT_LABELS[it.unit]}
                            </span>
                          </button>
                        </form>
                      ))}
                    </div>
                    {canCreate && (
                      <form action={deleteShoppingList.bind(null, boatId, list.id)}>
                        <ConfirmSubmitButton
                          confirmMessage="למחוק את הרשימה?"
                          className="flex items-center gap-1 text-xs font-medium text-fleet-coral"
                        >
                          <Trash2 size={13} /> מחק רשימה
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
