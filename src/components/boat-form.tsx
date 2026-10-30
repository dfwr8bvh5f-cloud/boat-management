import { getTranslator } from "@/lib/i18n/locale";
import { BoatStatusToggle } from "@/components/boat-status-toggle";
import { UncontrolledCustomSelect } from "@/components/uncontrolled-custom-select";
import { NumberInput } from "@/components/number-input";
import { INPUT_CLASS_COMPACT } from "@/lib/ui-classes";
import type { Boat } from "@/lib/types/database";

const inputClass = `${INPUT_CLASS_COMPACT} disabled:bg-fleet-paper disabled:text-fleet-ink`;
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
  const { t, locale } = await getTranslator();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      {/* Name stands alone - the one field worth its own full-width row. */}
      <div className="flex flex-col gap-1">
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

      {/* Identification - two medium-length text fields. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="model" className={labelClass}>
            {t("spec_model")}
          </label>
          <input id="model" name="model" disabled={disabled} defaultValue={boat?.model ?? ""} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
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
      </div>

      {/* Dimensions - four short numeric fields, packed together since none
          of them needs more than a few digits of width. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
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
        <div className="flex flex-col gap-1">
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
        <div className="flex flex-col gap-1">
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
        <div className="flex flex-col gap-1">
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
      </div>

      {/* Location/registry - short text fields, same density as above. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
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
        <div className="flex flex-col gap-1">
          <label htmlFor="flag" className={labelClass}>
            {t("spec_flag")}
          </label>
          <input id="flag" name="flag" disabled={disabled} defaultValue={boat?.flag ?? ""} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="berth" className={labelClass}>
            {t("spec_berth")}
          </label>
          <input id="berth" name="berth" disabled={disabled} defaultValue={boat?.berth ?? ""} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
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
      </div>

      {/* Status/type/price - a status toggle, a type select, and the
          conditional sale price that only appears once type = for_sale. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>{t("status_word")}</label>
          <BoatStatusToggle
            initialStatus={boat?.status ?? "active"}
            disabled={disabled}
            activeLabel={t("badge_active")}
            inactiveLabel={t("badge_inactive")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="boat_type" className={labelClass}>
            {t("boat_type_field")}
          </label>
          <UncontrolledCustomSelect
            name="boat_type"
            disabled={disabled}
            required
            locale={locale}
            defaultValue={boat?.boat_type ?? ""}
            placeholder={t("choose_boat_type")}
            emphasizeEmpty
            options={[
              { value: "commercial", label: t("type_commercial") },
              { value: "private", label: t("type_private") },
              { value: "for_sale", label: t("type_forSale") },
            ]}
            className={inputClass}
          />
        </div>
        {boat?.boat_type === "for_sale" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="sale_price" className={labelClass}>
              {t("sale_price_field")}
            </label>
            <NumberInput
              id="sale_price"
              name="sale_price"
              disabled={disabled}
              defaultValue={boat?.sale_price ?? ""}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {otherBoats && (
        <div className="flex flex-col gap-1 sm:w-1/2">
          <label htmlFor="parent_boat_id" className={labelClass}>
            {t("sub_boat_of_field")}
          </label>
          <UncontrolledCustomSelect
            name="parent_boat_id"
            disabled={disabled}
            defaultValue={boat?.parent_boat_id ?? ""}
            options={[{ value: "", label: t("boat_no_parent") }, ...otherBoats.map((b) => ({ value: b.id, label: b.name }))]}
            className={inputClass}
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className={labelClass}>
          {t("notes_field")}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          disabled={disabled}
          defaultValue={boat?.notes ?? ""}
          className={`${inputClass} h-auto resize-none py-1.5`}
        />
      </div>
    </div>
  );
}
