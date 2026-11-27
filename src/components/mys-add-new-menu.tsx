"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { useRefreshTransition } from "@/lib/hooks/use-refresh-transition";
import { createMysClient } from "@/lib/actions/mys";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { INPUT_CLASS_COMPACT } from "@/lib/ui-classes";

// "Add new" on the MYS dashboard: a small menu so more "new ..." options can
// be added later; today it offers one - a new client (same fields and server
// action as the form on /mys/clients).
export function MysAddNewMenu({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { startTransition, router } = useRefreshTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyDetails, setCompanyDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const closeForm = () => {
    setFormOpen(false);
    setName("");
    setEmail("");
    setPhone("");
    setCompanyDetails("");
    setError(null);
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("email", email);
      fd.set("phone", phone);
      fd.set("company_details", companyDetails);
      await createMysClient(fd);
      setSaving(false);
      setSaved(true);
      startTransition(() => {
        router.refresh();
      });
      setTimeout(() => {
        setSaved(false);
        closeForm();
      }, 1400);
    } catch (e) {
      console.error("create client failed:", e);
      setError(e instanceof Error ? e.message : t("save_failed"));
      setSaving(false);
    }
  };

  return (
    <>
      {/* Physical left corner in every locale. */}
      <div ref={wrapRef} className="relative self-start rtl:self-end">
        <Button type="button" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
          <Plus size={14} /> {t("mys_add_new")}
        </Button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute bottom-full start-0 z-40 mb-1 min-w-[180px] rounded-xl border border-fleet-border bg-white p-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setFormOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-fleet-navy hover:bg-fleet-paper"
            >
              <UserPlus size={16} /> {t("mys_add_client")}
            </button>
          </div>
        )}
      </div>

      {formOpen && (
        <Modal tone="dialog" onClose={closeForm} closeOnBackdrop={false}>
          <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4 shadow-xl">
            <h2 className="text-base font-bold text-fleet-navy">{t("mys_add_client")}</h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-fleet-ink">{t("mys_client_name_label")} *</label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS_COMPACT} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT_CLASS_COMPACT} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-fleet-ink">{t("phone_field")}</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT_CLASS_COMPACT} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-fleet-ink">{t("mys_client_company_details_label")}</label>
              <textarea
                value={companyDetails}
                onChange={(e) => setCompanyDetails(e.target.value)}
                placeholder={t("mys_client_company_details_placeholder")}
                rows={3}
                className={`${INPUT_CLASS_COMPACT} h-auto resize-none py-1.5`}
              />
            </div>
            {error && <p className="text-xs text-fleet-coral-text">{error}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={closeForm}>
                {t("close_word")}
              </Button>
              <Button className="flex-1" disabled={saved || !name.trim()} loading={saving} onClick={save}>
                {saved ? <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span> : t("save_word")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
