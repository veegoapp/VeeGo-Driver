---
name: i18nContext split
description: lib/i18nContext.tsx (2,476 lines) was split into lib/i18n/ without changing any consumer imports.
---

## Rule
`lib/i18nContext.tsx` is now a 4-line thin re-export (`export * from './i18n/index'`).
Implementation lives in `lib/i18n/`.

## Structure
```
lib/i18n/
  translations/
    en.ts        — export const en + export type Translations
    ar.ts        — import Translations from en, export const ar
    index.ts     — re-exports en, ar, Translations, Language type
  utils.ts       — LANG_STORAGE_KEY, getTranslation, makeSafeTranslations
  context.tsx    — I18nContextValue, I18nContext, I18nProvider, useI18n
  components.tsx — DirectionalIconProps, DirectionalIcon
  index.tsx      — barrel re-export of all above
```

**Why:** Zero consumer import changes — all existing `@/lib/i18nContext` and `./i18nContext` imports still resolve through the thin wrapper.

**How to apply:** When adding new translation keys, edit both `en.ts` and `ar.ts`. When touching provider logic, edit `context.tsx`. When touching the Proxy/fallback safety layer, edit `utils.ts`.
