import { getTranslator } from "@/lib/i18n/locale";
import { BoatStatusToggle } from "@/components/boat-status-toggle";
import { INPUT_CLASS } from "@/lib/ui-classes";
import type { Boat } from "@/lib/types/database";

const inputClass = `${INPUT_CLASS} disabled:bg-fleet-paper disabled:text-fleet-ink`;
const labelClass = "text-xs text-fleet-ink";

export async function BoatForm({
  boat,
  disabled = false,
  otherBoats,
}: {
  boat?: Boat;
  disabled?: boolean;
  otherBoats?: { id: string; name: string }[];
}) {
  const { t } = await getTranslator();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="name" className={labelClass}>
          {t("boat_name_field")} *
        </label>
        <input
          id="name"
          name="name"
          required
          disabled={disabled}
          defaultValue={boat?.name}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="model" className={labelClass}>
          {t("spec_model")}
        </label>
        <input id="model" name="model" disabled={disabled} defaultValue={boat?.model ?? ""} className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="registration_number" className={labelClass}>
          {t("spec_registration_number")}
        </label>
        <input
          id="registration_number"
          name="registration_number"
          disabled={disabled}
          defaultValue={boat?.registration_number ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="year_built" className={labelClass}>
          {t("spec_year_built")}
        </label>
        <input
          id="year_built"
          name="year_built"
          type="number"
          disabled={disabled}
          defaultValue={boat?.year_built ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="length_meters" className={labelClass}>
          {t("spec_length")} ({t("unit_meters")})
        </label>
        <input
          id="length_meters"
          name="length_meters"
          type="number"
          step="any"
          disabled={disabled}
          defaultValue={boat?.length_meters ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="beam_meters" className={labelClass}>
          {t("spec_beam")} ({t("unit_meters")})
        </label>
        <input
          id="beam_meters"
          name="beam_meters"
          type="number"
          step="any"
          disabled={disabled}
          defaultValue={boat?.beam_meters ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="draft_meters" className={labelClass}>
          {t("spec_draft")} ({t("unit_meters")})
        </label>
        <input
          id="draft_meters"
          name="draft_meters"
          type="number"
          step="any"
          disabled={disabled}
          defaultValue={boat?.draft_meters ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="home_port" className={labelClass}>
          {t("spec_homeport")}
        </label>
        <input
          id="home_port"
          name="home_port"
          disabled={disabled}
          defaultValue={boat?.home_port ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="flag" className={labelClass}>
          {t("spec_flag")}
        </label>
        <input id="flag" name="flag" disabled={disabled} defaultValue={boat?.flag ?? ""} className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="berth" className={labelClass}>
          {t("spec_berth")}
        </label>
        <input id="berth" name="berth" disabled={disabled} defaultValue={boat?.berth ?? ""} className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="mmsi" className={labelClass}>
          {t("mmsi_field")}
        </label>
        <input
          id="mmsi"
          name="mmsi"
          disabled={disabled}
          defaultValue={boat?.mmsi ?? ""}
          placeholder={t("boat_mmsi_placeholder")}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>{t("status_word")}</label>
        <BoatStatusToggle
          initialStatus={boat?.status ?? "active"}
          disabled={disabled}
          activeLabel={t("badge_active")}
          inactiveLabel={t("badge_inactive")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="boat_type" className={labelClass}>
          {t("boat_type_field")}
        </label>
        <select
          id="boat_type"
          name="boat_type"
          disabled={disabled}
          defaultValue={boat?.boat_type ?? "private"}
          className={inputClass}
        >
          <option value="commercial">{t("type_commercial")}</option>
          <option value="private">{t("type_private")}</option>
          <option value="for_sale">{t("type_forSale")}</option>
        </select>
      </div>

      {boat?.boat_type === "for_sale" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sale_price" className={labelClass}>
            {t("sale_price_field")}
          </label>
          <input
            id="sale_price"
            name="sale_price"
            type="number"
            step="0.01"
            disabled={disabled}
            defaultValue={boat?.sale_price ?? ""}
            className={inputClass}
          />
        </div>
      )}

      {otherBoats && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="parent_boat_id" className={labelClass}>
            {t("sub_boat_of_field")}
          </label>
          <select
            id="parent_boat_id"
            name="parent_boat_id"
            disabled={disabled}
            defaultValue={boat?.parent_boat_id ?? ""}
            className={inputClass}
          >
            <option value="">{t("boat_no_parent")}</option>
            {otherBoats.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="notes" className={labelClass}>
          {t("notes_field")}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          disabled={disabled}
          defaultValue={boat?.notes ?? ""}
          className={inputClass}
        />
      </div>
    </div>
  );
}
