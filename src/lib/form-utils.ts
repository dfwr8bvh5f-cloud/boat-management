export function emptyToNull(value: FormDataEntryValue | null): string | null {
  const str = typeof value === "string" ? value.trim() : "";
  return str === "" ? null : str;
}

// For a `date not null default current_date` column: when the field is left
// empty in the UI (the date picker shows no default, per design), omitting
// the key from the insert lets Postgres' own column default fill it in,
// instead of sending an empty string that would fail the not-null check.
export function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const str = typeof value === "string" ? value.trim() : "";
  return str === "" ? undefined : str;
}

export function numberOrNull(value: FormDataEntryValue | null): number | null {
  const str = typeof value === "string" ? value.trim() : "";
  if (str === "") return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}
