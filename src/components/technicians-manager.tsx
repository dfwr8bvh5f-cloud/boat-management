"use client";

import { useState } from "react";
import { Mail, MessageCircle, Pencil, Phone, Search, Smartphone, Trash2, User } from "lucide-react";
import { createTechnician, updateTechnician, deleteTechnician } from "@/lib/actions/technicians";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Technician } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

const inputClass = INPUT_CLASS;

// wa.me needs a full international number with no leading zeros/spaces -
// these are Greek supplier numbers, almost always written as a bare local
// mobile number, so a 10-digit (or shorter, already-missing-country-code)
// number gets Greece's country code (30) prepended. A "00"-prefixed number
// (already international) just has the "00" stripped. Only the first
// number is used when a cell has two separated by " - ".
function whatsAppNumber(phone: string) {
  let digits = phone.split("-")[0].replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (!digits.startsWith("30")) digits = `30${digits}`;
  return digits;
}

// Greek numbering plan: mobiles start with 6, landlines with 2 - a landline
// can't have WhatsApp, so its icon is skipped and only the call link shows.
function isLikelyGreekLandline(phone: string): boolean {
  let digits = phone.split("-")[0].replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("30") && digits.length > 10) digits = digits.slice(2);
  return digits.startsWith("2");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TechniciansManager({ technicians, locale }: { technicians: Technician[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);

  const startEdit = (tech: Technician) => {
    setEditing(tech);
    setShowForm(true);
  };
  const startNew = () => {
    setEditing(null);
    setShowForm((s) => (editing ? true : !s));
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };
  const formAction = editing ? updateTechnician.bind(null, editing.id) : createTechnician;

  const searchTerm = search.trim().toLowerCase();
  const filtered = technicians.filter((tech) => {
    if (!searchTerm) return true;
    return [tech.name, tech.contact_name, tech.contact, tech.phone, tech.notes]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(searchTerm));
  });

  const renderForm = () => (
    <form
      key={editing?.id ?? "new"}
      action={async (formData) => {
        await formAction(formData);
        closeForm();
      }}
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("technician_name")} *</label>
        <input name="name" required defaultValue={editing?.name ?? ""} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("technician_contact_name")}</label>
          <input name="contact_name" defaultValue={editing?.contact_name ?? ""} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("technician_phone")}</label>
          <input name="phone" defaultValue={editing?.phone ?? ""} className={inputClass} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("technician_contact")}</label>
        <input name="contact" defaultValue={editing?.contact ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("technician_notes")}</label>
        <textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} className={inputClass} />
      </div>
      <div className="flex gap-2">
        {editing && (
          <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
            {t("close_word")}
          </button>
        )}
        <button type="submit" className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
          {editing ? t("save_edit") : t("technician_add")}
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={startNew}
          className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
        >
          {showForm ? `✕ ${t("close_word")}` : `+ ${t("technician_add")}`}
        </button>
      </div>

      {showForm && !editing && renderForm()}

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("technician_search_placeholder")}
          className="w-full rounded-lg border border-fleet-border bg-white py-2 ps-9 pe-3 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("technician_none")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((tech) =>
            editing?.id === tech.id ? (
              <div key={tech.id}>{renderForm()}</div>
            ) : (
              <div key={tech.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
                  <User size={16} className="text-fleet-brass" />
                </div>
                <div className="min-w-[160px] flex-1">
                  <div className="text-sm font-semibold">{tech.name}</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fleet-ink">
                    {tech.contact_name && <span>{tech.contact_name}</span>}
                    {tech.phone && (
                      <span className="flex items-center gap-2" dir="ltr">
                        <a
                          href={`tel:${tech.phone.split("-")[0].trim()}`}
                          className="flex items-center gap-1 text-fleet-teal hover:underline"
                        >
                          {isLikelyGreekLandline(tech.phone) ? <Phone size={11} /> : <Smartphone size={11} />}{" "}
                          {tech.phone}
                        </a>
                        {!isLikelyGreekLandline(tech.phone) && (
                          <a
                            href={`https://wa.me/${whatsAppNumber(tech.phone)}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="WhatsApp"
                            title="WhatsApp"
                            className="text-fleet-moss hover:text-fleet-moss/70"
                          >
                            <MessageCircle size={13} />
                          </a>
                        )}
                      </span>
                    )}
                    {tech.contact &&
                      (EMAIL_PATTERN.test(tech.contact.trim()) ? (
                        <a
                          href={`mailto:${tech.contact.trim()}`}
                          className="flex items-center gap-1 text-fleet-teal hover:underline"
                          dir="ltr"
                        >
                          <Mail size={11} /> {tech.contact}
                        </a>
                      ) : (
                        <span dir="ltr">{tech.contact}</span>
                      ))}
                  </div>
                  {tech.notes && <div className="mt-0.5 text-xs italic text-fleet-ink">{tech.notes}</div>}
                </div>
                <button onClick={() => startEdit(tech)} aria-label="edit" className="text-fleet-ink hover:text-fleet-navy">
                  <Pencil size={16} />
                </button>
                <form action={deleteTechnician.bind(null, tech.id)}>
                  <ConfirmSubmitButton confirmMessage={t("technician_delete_confirm")} className="text-fleet-ink hover:text-fleet-coral">
                    <Trash2 size={16} />
                  </ConfirmSubmitButton>
                </form>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
