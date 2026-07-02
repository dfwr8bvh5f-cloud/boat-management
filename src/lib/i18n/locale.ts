import "server-only";
import { cookies } from "next/headers";
import { dictionaries, type Locale, type TranslationKey } from "./dictionaries";

export const LOCALE_COOKIE = "locale";

export const LOCALE_INFO: Record<Locale, { label: string; dir: "rtl" | "ltr" }> = {
  he: { label: "עברית", dir: "rtl" },
  en: { label: "English", dir: "ltr" },
  el: { label: "Ελληνικά", dir: "ltr" },
};

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return value === "en" || value === "el" ? value : "he";
}

export async function getTranslator() {
  const locale = await getLocale();
  const dict = dictionaries[locale];
  const fallback = dictionaries.he;

  function t(key: TranslationKey, vars?: Record<string, string | number>) {
    let text: string = dict[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  }

  return { t, locale };
}
