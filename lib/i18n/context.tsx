import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setApiLanguage } from '../api';
import { applyRTLEngine, triggerAppRestart } from '../rtlUtils';
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

  // Load persisted language on mount and sync I18nManager silently (no alert at boot)
  useEffect(() => {
    AsyncStorage.getItem(LANG_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'ar' || stored === 'en') {
          setLanguageState(stored);
          applyRTLEngine(stored);
          setApiLanguage(stored);
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsLanguageLoading(false);
      });
  }, []);

  const setLanguage = useCallback((lang: Language): void => {
    if (lang === language) return;

    setIsSwitchingLanguage(true);

    // IMPORTANT: AsyncStorage.setItem MUST be awaited before applyRTLEngine is
    // called. On Android, I18nManager.forceRTL() inside applyRTLEngine triggers
    // an immediate OS-level activity restart. If the write happens after that
    // call, the process is killed before the write commits, the next cold-start
    // reads null from AsyncStorage, language stays null, and index.tsx redirects
    // back to /language-select — making it appear as if the selection was never
    // saved. Writing first guarantees the value is durable before any restart.
    (async () => {
      await AsyncStorage.setItem(LANG_STORAGE_KEY, lang).catch(() => {});

      applyRTLEngine(lang);
      setApiLanguage(lang);
      setLanguageState(lang);

      // On Android, forceRTL() above already triggers an OS-level activity
      // restart on its own (see app/language-select.tsx's androidRtlRestart
      // handling) — calling triggerAppRestart() again here would race with
      // that. iOS/web have no such automatic restart, so this is the only
      // place the reload actually happens for them — without it, forceRTL()
      // flips the native flag but the mounted layout never re-mirrors.
      if (Platform.OS !== 'android') {
        triggerAppRestart();
      }

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
