"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, ChevronDown, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { createShoppingList, uploadShoppingItemPhoto, toggleShoppingItem, deleteShoppingList } from "@/lib/actions/shopping";
import { SHOPPING_UNITS, getShoppingUnitLabels } from "@/lib/labels";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { useFileDrop } from "@/lib/use-file-drop";
import { ClearFileButton } from "@/components/clear-file-button";
import { todayLocalISO } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ShoppingList, ShoppingListItem, ShoppingUnit } from "@/lib/types/database";
import { INPUT_CLASS } from "@/lib/ui-classes";

type ListWithItems = ShoppingList & { items: (ShoppingListItem & { photoUrl: string | null })[] };
type BasketDraft = { name: string; quantity: number; unit: ShoppingUnit; photoPath: string | null };

const inputClass = INPUT_CLASS;

export function ShoppingManager({
  boatId,
  lists,
  trips,
  canCreate,
  locale,
}: {
  boatId: string;
  lists: ListWithItems[];
  trips: { id: string; customer_name: string; start_date: string; end_date: string }[];
  canCreate: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const shoppingUnitLabels = getShoppingUnitLabels(locale);
  const [building, setBuilding] = useState(false);
  const [title, setTitle] = useState("");
  const [tripId, setTripId] = useState("");
  const [basket, setBasket] = useState<BasketDraft[]>([]);
  const [draft, setDraft] = useState({ name: "", quantity: "1", unit: "pcs" as ShoppingUnit });
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Instant feedback for the item checkbox, reverted if toggleShoppingItem
  // fails - same pattern as StaffManager's activeOverrides.
  const [checkedOverrides, setCheckedOverrides] = useState<Record<string, boolean>>({});
  const [, startCheckedTransition] = useTransition();
  const effectiveChecked = (it: ListWithItems["items"][number]) =>
    it.id in checkedOverrides ? checkedOverrides[it.id] : it.checked;
  const toggleItem = (it: ListWithItems["items"][number]) => {
    const next = !effectiveChecked(it);
    setCheckedOverrides((prev) => ({ ...prev, [it.id]: next }));
    startCheckedTransition(async () => {
      try {
        await toggleShoppingItem(boatId, it.id, next);
      } catch (e) {
        console.error("toggleShoppingItem failed:", e);
        setCheckedOverrides((prev) => ({ ...prev, [it.id]: it.checked }));
      }
    });
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const [itemPhotoPicked, setItemPhotoPicked] = useState(false);
  const { dragging: photoDragging, dropHandlers: photoDropHandlers } = useFileDrop((file) => {
    pendingFileRef.current = file;
    setItemPhotoPicked(true);
  });
  const clearItemPhoto = () => {
    pendingFileRef.current = null;
    if (fileRef.current) fileRef.current.value = "";
    setItemPhotoPicked(false);
  };

  const addToBasket = async () => {
    if (!draft.name.trim()) return;
    setErrorMsg(null);
    let photoPath: string | null = null;
    if (pendingFileRef.current) {
      setBusy(true);
      try {
        photoPath = await uploadShoppingItemPhoto(boatId, pendingFileRef.current);
      } catch {
        setBusy(false);
        setErrorMsg(t("upload_failed"));
        return;
      } finally {
        setBusy(false);
        pendingFileRef.current = null;
        setItemPhotoPicked(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    }
    setBasket((b) => [...b, { name: draft.name, quantity: Number(draft.quantity || 1), unit: draft.unit, photoPath }]);
    setDraft({ name: "", quantity: "1", unit: "pcs" });
  };

  const sendList = async () => {
    if (basket.length === 0) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      await createShoppingList(boatId, title, tripId || null, basket);
      setBasket([]);
      setTitle("");
      setTripId("");
      setBuilding(false);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setBusy(false);
    }
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
            {building ? (
              <span className="inline-flex items-center gap-1">
                <X size={14} /> {t("close_word")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Plus size={14} /> {t("shopping_new_list")}
              </span>
            )}
          </button>
        </div>
      )}

      {building && canCreate && (
        <div className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`${t("shopping_list_default_title")} ${todayLocalISO()}`}
            className={inputClass}
          />
          {trips.length > 0 && (
            <CustomSelect
              value={tripId}
              onChange={setTripId}
              options={[
                { value: "", label: t("shopping_no_trip") },
                ...trips.map((b) => ({ value: b.id, label: `${b.customer_name} (${b.start_date} – ${b.end_date})` })),
              ]}
              className={inputClass}
            />
          )}

          {basket.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-fleet-ink">{t("shopping_basket")} ({basket.length})</div>
              {basket.map((it, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2 py-1.5 text-sm">
                  <ShoppingCart size={14} className="text-fleet-brass" />
                  <span className="flex-1">{it.name}</span>
                  <span className="text-xs text-fleet-ink">
                    {it.quantity} {shoppingUnitLabels[it.unit]}
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
                placeholder={t("shopping_item_name")}
                className={`${inputClass} flex-[2]`}
              />
              <input
                type="number"
                min={1}
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                className={`${inputClass} flex-1`}
              />
              <CustomSelect
                value={draft.unit}
                onChange={(v) => setDraft({ ...draft, unit: v as ShoppingUnit })}
                options={SHOPPING_UNITS.map((u) => ({ value: u, label: shoppingUnitLabels[u] }))}
                className={`${inputClass} flex-1`}
              />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                pendingFileRef.current = file;
                setItemPhotoPicked(Boolean(file));
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                {...photoDropHandlers}
                className={`relative flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm ${
                  photoDragging
                    ? "border-fleet-teal bg-fleet-teal/10 text-fleet-navy"
                    : itemPhotoPicked
                      ? "border-fleet-moss bg-fleet-moss/10 text-fleet-moss-text"
                      : "border-fleet-brass bg-fleet-paper text-fleet-navy"
                }`}
              >
                <Camera size={16} /> {t("photo_word")}
                {photoDragging && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                    <Plus size={16} className="text-fleet-teal" />
                  </span>
                )}
              </button>
              {itemPhotoPicked && <ClearFileButton onClear={clearItemPhoto} label={t("remove_word")} />}
              <button
                type="button"
                onClick={addToBasket}
                disabled={busy}
                className="flex-1 rounded-lg bg-fleet-navy py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? "…" : t("shopping_add_item")}
              </button>
            </div>
          </div>

          {errorMsg && <p className="text-xs font-medium text-fleet-coral-text">{errorMsg}</p>}

          <div className="flex gap-2">
            <button
              onClick={sendList}
              disabled={basket.length === 0 || busy}
              className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white disabled:bg-fleet-brass/40"
            >
              {busy ? "…" : t("shopping_send")}
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("shopping_none")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((list) => {
            const isOpen = openId === list.id;
            const checkedCount = list.items.filter((it) => effectiveChecked(it)).length;
            const complete = list.items.length > 0 && checkedCount === list.items.length;
            const trip = list.booking_id ? trips.find((b) => b.id === list.booking_id) : null;
            return (
              <div key={list.id} className="rounded-xl border border-fleet-border bg-white p-3">
                <button
                  onClick={() => setOpenId(isOpen ? null : list.id)}
                  className="flex w-full items-center gap-2.5 text-start"
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${complete ? "bg-fleet-moss/10" : "bg-fleet-paper"}`}>
                    <ShoppingCart size={16} className={complete ? "text-fleet-moss-text" : "text-fleet-brass"} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {trip && <div className="text-3xs font-bold text-fleet-teal">{trip.customer_name}</div>}
                    <div className="text-sm font-bold">{list.title}</div>
                    <div className="text-xs text-fleet-ink">
                      {checkedCount}/{list.items.length} {t("shopping_collected")}
                    </div>
                  </div>
                  <ChevronDown size={16} className={`text-fleet-brass transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                </button>
                {isOpen && (
                  <div className="mt-3 border-t border-dashed border-fleet-border pt-3">
                    <div className="mb-2.5 flex flex-col gap-1.5">
                      {list.items.map((it) => {
                        const checked = effectiveChecked(it);
                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => toggleItem(it)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm ${checked ? "bg-fleet-moss/10" : "bg-fleet-paper"}`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${checked ? "border-fleet-moss bg-fleet-moss" : "border-fleet-border bg-white"}`}
                            >
                              {checked && <span className="text-3xs text-white">✓</span>}
                            </span>
                            {it.photoUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.photoUrl} alt="" loading="lazy" className="h-7 w-7 rounded object-cover" />
                            )}
                            <span className={`flex-1 ${checked ? "text-fleet-ink line-through" : ""}`}>{it.name}</span>
                            <span className="text-xs text-fleet-ink">
                              {it.quantity} {shoppingUnitLabels[it.unit]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {canCreate && (
                      <form action={deleteShoppingList.bind(null, boatId, list.id)}>
                        <ConfirmSubmitButton
                          locale={locale}
                          confirmMessage={t("delete_list_confirm")}
                          className="flex items-center gap-1 text-xs font-medium text-fleet-coral-text"
                        >
                          <Trash2 size={14} /> {t("delete_list_word")}
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
