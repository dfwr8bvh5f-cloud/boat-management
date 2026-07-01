export function emptyToNull(value: FormDataEntryValue | null): string | null {
  const str = typeof value === "string" ? value.trim() : "";
  return str === "" ? null : str;
}

export function numberOrNull(value: FormDataEntryValue | null): number | null {
  const str = typeof value === "string" ? value.trim() : "";
  if (str === "") return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}
