"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { createMysClient, updateMysClient, deleteMysClient } from "@/lib/actions/mys";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { RippleLoader } from "@/components/ripple-loader";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysClient } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SEARCH_INPUT_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

export function MysClientsManager({ clients, locale }: { clients: MysClient[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const deferredSearchTerm = useDeferredValue(search.trim().toLowerCase());
  const filteredClients = useMemo(
    () =>
      clients.filter((c) => {
        if (!deferredSearchTerm) return true;
        return [c.name, c.email, c.phone, c.company_details].filter(Boolean).some((field) => field!.toLowerCase().includes(deferredSearchTerm));
      }),
    [clients, deferredSearchTerm]
  );
  const { visibleItems: visibleClients, hasMore: hasMoreClients, loadMore: loadMoreClients } = usePagedList(filteredClients);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MysClient | null>(null);

  const [nameValue, setNameValue] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [companyDetailsValue, setCompanyDetailsValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resetForm = () => {
    setNameValue("");
    setEmailValue("");
    setPhoneValue("");
    setCompanyDetailsValue("");
    setSaveError(null);
  };
  const startNew = () => {
    setEditing(null);
    resetForm();
    setShowForm(true);
  };
  const startEdit = (c: MysClient) => {
    setEditing(c);
    setNameValue(c.name);
    setEmailValue(c.email ?? "");
    setPhoneValue(c.phone ?? "");
    setCompanyDetailsValue(c.company_details ?? "");
    setSaveError(null);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setSaveError(null);
  };

  const doSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("name", nameValue);
      fd.set("email", emailValue);
      fd.set("phone", phoneValue);
      fd.set("company_details", companyDetailsValue);

      if (editing) {
        const result = await updateMysClient(editing.id, fd);
        if (result?.error) {
          setSaveError(result.error);
          setSaving(false);
          return;
        }
      } else {
        await createMysClient(fd);
      }
      setSaving(false);
      setSaved(true);
      router.refresh();
      setTimeout(() => {
        setSaved(false);
        closeForm();
      }, 1400);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_clients_title")}</h1>
        <button
          onClick={() => (showForm ? closeForm() : startNew())}
          className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper transition-transform hover:opacity-90 active:scale-[0.97]"
        >
          {showForm ? (
            <span className="inline-flex items-center gap-1">
              <X size={14} /> {t("close_word")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Plus size={14} /> {t("mys_add_client")}
            </span>
          )}
        </button>
      </div>

      {showForm && (
        <div className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_client_name_label")} *</label>
            <input value={nameValue} onChange={(e) => setNameValue(e.target.value)} className={INPUT_CLASS} />
            {editing && <p className="text-2xs text-fleet-ink">{t("mys_client_rename_note")}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
              <input type="email" value={emailValue} onChange={(e) => setEmailValue(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("phone_field")}</label>
              <input type="tel" value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} className={INPUT_CLASS} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_client_company_details_label")}</label>
            <textarea
              value={companyDetailsValue}
              onChange={(e) => setCompanyDetailsValue(e.target.value)}
              placeholder={t("mys_client_company_details_placeholder")}
              rows={3}
              className={INPUT_CLASS}
            />
          </div>
          {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button
              type="button"
              disabled={saving || saved || !nameValue.trim()}
              onClick={doSave}
              className={`flex flex-1 items-center justify-center gap-2 ${PRIMARY_BUTTON_CLASS}`}
            >
              {saving ? (
                <>
                  <RippleLoader size="sm" /> {t("saving_word")}
                </>
              ) : saved ? (
                <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
              ) : (
                t("save_word")
              )}
            </button>
          </div>
        </div>
      )}

      {clients.length > 0 && (
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search_placeholder")}
            className={SEARCH_INPUT_CLASS}
          />
        </div>
      )}

      {filteredClients.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_clients")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleClients.map((c) => (
            <div key={c.id} className="flex flex-nowrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-fleet-navy">{c.name}</div>
                {(c.email || c.phone) && (
                  <div className="truncate text-xs text-fleet-ink">
                    {c.email}
                    {c.email && c.phone && " · "}
                    {c.phone && <span dir="ltr">{c.phone}</span>}
                  </div>
                )}
                {c.company_details && <div className="truncate text-xs text-fleet-ink/70">{c.company_details}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  aria-label="edit"
                  className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                >
                  <Pencil size={16} />
                </button>
                <form action={deleteMysClient.bind(null, c.id)}>
                  <ConfirmSubmitButton
                    locale={locale}
                    confirmMessage={t("mys_delete_client_confirm")}
                    ariaLabel={t("delete_word")}
                    className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                  >
                    <Trash2 size={16} />
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ))}
          {hasMoreClients && (
            <button
              type="button"
              onClick={loadMoreClients}
              className="rounded-lg border border-fleet-border bg-white py-2.5 text-sm font-bold text-fleet-teal hover:bg-fleet-paper"
            >
              {t("load_more_word")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
