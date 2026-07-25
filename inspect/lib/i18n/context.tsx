import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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

  const setLanguage = (lang: Language): void => {
    if (lang === language) return;

    setIsSwitchingLanguage(true);

    applyRTLEngine(lang);
    setApiLanguage(lang);
    setLanguageState(lang);
    AsyncStorage.setItem(LANG_STORAGE_KEY, lang).catch(() => {});

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
  };

  const t = makeSafeTranslations(language ?? 'en');
  const isRTL = language === 'ar';

  return (
    <I18nContext.Provider value={{ language, isLanguageLoading, isSwitchingLanguage, setLanguage, t, isRTL }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
