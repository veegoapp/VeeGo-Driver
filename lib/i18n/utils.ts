import { en, ar } from './translations';
import type { Language, Translations } from './translations';

// ── Persistence key ────────────────────────────────────────────────────────────
export const LANG_STORAGE_KEY = 'veego_language';

// ── i18n Safety Layer ─────────────────────────────────────────────────────────
//
// getTranslation(key, locale)
//   1. Returns the translation for the current locale if it exists.
//   2. If missing, logs a dev warning and falls back to English.
//   3. If missing in English too, returns the raw key as a last resort.
//
// makeSafeTranslations(locale)
//   Wraps the translation dictionary in a Proxy so every property access
//   goes through getTranslation. This means callers keep using `t.some_key`
//   syntax and never receive undefined or crash.

const _translationDicts: Record<Language, Record<string, string>> = {
  en: en as Record<string, string>,
  ar: ar as Record<string, string>,
};

export function getTranslation(key: string, locale: Language): string {
  const dict = _translationDicts[locale];
  if (dict && Object.prototype.hasOwnProperty.call(dict, key)) {
    return dict[key];
  }
  if (__DEV__) {
    console.warn(`⚠️ Missing translation key: "${key}" in locale: ${locale}`);
  }
  const enValue = (en as Record<string, string>)[key];
  if (enValue !== undefined) {
    return enValue;
  }
  return key;
}

export function makeSafeTranslations(locale: Language): Translations {
  if (locale === 'en') return en;
  return new Proxy(ar as unknown as Translations, {
    get(_target, prop: string | symbol) {
      if (typeof prop !== 'string') return undefined;
      return getTranslation(prop, locale);
    },
  });
}
