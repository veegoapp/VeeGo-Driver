import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setApiLanguage } from '../api';
import { applyRTLEngine } from '../rtlUtils';
import { en } from './translations';
import type { Language, Translations } from './translations';
import { LANG_STORAGE_KEY, makeSafeTranslations } from './utils';

// ── Context ────────────────────────────────────────────────────────────────────

type I18nContextValue = {
  language: Language | null;
  isLanguageLoading: boolean;
  isSwitchingLanguage: boolean;
  setLanguage: (lang: Language) => void;
  t: Translations;
  isRTL: boolean;
};

const I18nContext = createContext<I18nContextValue>({
  language: null,
  isLanguageLoading: true,
  isSwitchingLanguage: false,
  setLanguage: () => {},
  t: en,
  isRTL: false,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language | null>(null);
  const [isLanguageLoading, setIsLanguageLoading] = useState(true);
  const [isSwitchingLanguage, setIsSwitchingLanguage] = useState(false);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted language on mount and sync I18nManager silently (no alert at boot).
  // If no language is stored yet (first launch), default to Arabic so the
  // language-select screen is never shown as a mandatory first-run step.
  // The driver can still change the language at any time from Settings.
  useEffect(() => {
    AsyncStorage.getItem(LANG_STORAGE_KEY)
      .then((stored) => {
        const lang: Language = (stored === 'ar' || stored === 'en') ? stored : 'en';
        if (!stored) {
          // Persist the default so subsequent cold-starts don't re-evaluate.
          AsyncStorage.setItem(LANG_STORAGE_KEY, lang).catch(() => {});
        }
        setLanguageState(lang);
        applyRTLEngine(lang);
        setApiLanguage(lang);
      })
      .catch(() => {})
      .finally(() => {
        setIsLanguageLoading(false);
      });
  }, []);

  const setLanguage = useCallback((lang: Language): void => {
    if (lang === language) return;

    setIsSwitchingLanguage(true);

    (async () => {
      await AsyncStorage.setItem(LANG_STORAGE_KEY, lang).catch(() => {});

      applyRTLEngine(lang);
      setApiLanguage(lang);
      // No app restart needed — layout direction is driven entirely by this
      // app's own isRTL checks (not React Native's native RTL engine, see
      // rtlUtils.ts), so re-rendering with the new language is sufficient.
      setLanguageState(lang);

      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      switchTimerRef.current = setTimeout(() => setIsSwitchingLanguage(false), 1400);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Memoized: makeSafeTranslations builds a fresh Proxy on every call for
  // Arabic, so without this every I18nProvider re-render (which wraps the
  // whole app) changed `t`'s reference and defeated React.memo everywhere
  // it's passed down as a prop.
  const t = useMemo(() => makeSafeTranslations(language ?? 'en'), [language]);
  const isRTL = language === 'ar';

  // Memoized: React Context re-renders every consumer whenever the value
  // object's reference changes. An inline object literal here would do that
  // on every I18nProvider render (e.g. isSwitchingLanguage toggling),
  // regardless of whether language/t/isRTL actually changed.
  const value = useMemo(
    () => ({ language, isLanguageLoading, isSwitchingLanguage, setLanguage, t, isRTL }),
    [language, isLanguageLoading, isSwitchingLanguage, setLanguage, t, isRTL],
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
