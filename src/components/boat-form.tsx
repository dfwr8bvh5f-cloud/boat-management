import type { Boat } from "@/lib/types/database";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500";
const labelClass = "text-sm font-medium text-slate-700";

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
