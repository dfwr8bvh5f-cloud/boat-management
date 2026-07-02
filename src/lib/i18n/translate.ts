import { dictionaries, type Locale, type TranslationKey } from "./dictionaries";

// Locale-explicit translate, safe to import from Client Components (no
// "server-only" / cookies dependency) - unlike getTranslator() in locale.ts.
export function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>) {
  const dict = dictionaries[locale];
  const fallback = dictionaries.he;
  let text: string = dict[key] ?? fallback[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
