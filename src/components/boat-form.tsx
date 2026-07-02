import type { Boat } from "@/lib/types/database";

const inputClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-2 text-sm text-fleet-navy outline-none focus:border-fleet-brass disabled:bg-fleet-paper disabled:text-fleet-ink";
const labelClass = "text-xs text-fleet-ink";

export function BoatForm({ boat, disabled = false }: { boat?: Boat; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="name" className={labelClass}>
          שם הסירה *
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
          דגם
        </label>
        <input id="model" name="model" disabled={disabled} defaultValue={boat?.model ?? ""} className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="registration_number" className={labelClass}>
          מספר רישוי
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
          שנת ייצור
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
          אורך (מטרים)
        </label>
        <input
          id="length_meters"
          name="length_meters"
          type="number"
          step="0.1"
          disabled={disabled}
          defaultValue={boat?.length_meters ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="beam_meters" className={labelClass}>
          רוחב (מטרים)
        </label>
        <input
          id="beam_meters"
          name="beam_meters"
          type="number"
          step="0.1"
          disabled={disabled}
          defaultValue={boat?.beam_meters ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="draft_meters" className={labelClass}>
          שוקע (מטרים)
        </label>
        <input
          id="draft_meters"
          name="draft_meters"
          type="number"
          step="0.1"
          disabled={disabled}
          defaultValue={boat?.draft_meters ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="home_port" className={labelClass}>
          נמל בית
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
          דגל
        </label>
        <input id="flag" name="flag" disabled={disabled} defaultValue={boat?.flag ?? ""} className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="berth" className={labelClass}>
          מקום עגינה
        </label>
        <input id="berth" name="berth" disabled={disabled} defaultValue={boat?.berth ?? ""} className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="mmsi" className={labelClass}>
          מספר MMSI
        </label>
        <input
          id="mmsi"
          name="mmsi"
          disabled={disabled}
          defaultValue={boat?.mmsi ?? ""}
          placeholder="לצורך מעקב מיקום חי (AIS)"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="status" className={labelClass}>
          סטטוס
        </label>
        <select
          id="status"
          name="status"
          disabled={disabled}
          defaultValue={boat?.status ?? "active"}
          className={inputClass}
        >
          <option value="active">פעילה</option>
          <option value="maintenance">בתחזוקה</option>
          <option value="inactive">לא פעילה</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="boat_type" className={labelClass}>
          סוג סירה
        </label>
        <select
          id="boat_type"
          name="boat_type"
          disabled={disabled}
          defaultValue={boat?.boat_type ?? "private"}
          className={inputClass}
        >
          <option value="commercial">מסחרית</option>
          <option value="private">פרטית</option>
          <option value="for_sale">יד שנייה למכירה</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sale_price" className={labelClass}>
          מחיר מבוקש (אם למכירה)
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

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="notes" className={labelClass}>
          הערות
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
