import type { Locale } from "./dictionaries";

export const LOCALE_COOKIE = "locale";

export const LOCALE_INFO: Record<Locale, { label: string; dir: "rtl" | "ltr" }> = {
  he: { label: "עברית", dir: "rtl" },
  en: { label: "English", dir: "ltr" },
  el: { label: "Ελληνικά", dir: "ltr" },
};
