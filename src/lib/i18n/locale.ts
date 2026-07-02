import "server-only";
import { cookies } from "next/headers";
import type { Locale, TranslationKey } from "./dictionaries";
import { translate } from "./translate";

export { LOCALE_COOKIE, LOCALE_INFO } from "./constants";
import { LOCALE_COOKIE } from "./constants";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return value === "en" || value === "el" ? value : "he";
}

export async function getTranslator() {
  const locale = await getLocale();

  function t(key: TranslationKey, vars?: Record<string, string | number>) {
    return translate(locale, key, vars);
  }

  return { t, locale };
}
