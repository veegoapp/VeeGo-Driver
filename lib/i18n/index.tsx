// Single barrel export for lib/i18n — consumers import from '@/lib/i18nContext'
// which re-exports everything from here.

export { en, ar } from './translations';
export type { Translations, Language } from './translations';
export { LANG_STORAGE_KEY, getTranslation, makeSafeTranslations } from './utils';
export { I18nProvider, useI18n } from './context';
export { DirectionalIcon } from './components';
export type { DirectionalIconProps } from './components';
