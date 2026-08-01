import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useI18n } from '@/lib/i18nContext';
import { useAuth } from '@/lib/authContext';

const ONBOARDING_KEY = 'veego_has_seen_onboarding';

export default function SplashScreen() {
  const { isLanguageLoading } = useI18n();
  const { token, isLoading: authLoading } = useAuth();

  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (token) {
      AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {});
      setHasSeenOnboarding(true);
      setOnboardingChecked(true);
      return;
    }
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((v) => setHasSeenOnboarding(v === '1'))
      .catch(() => setHasSeenOnboarding(false))
      .finally(() => setOnboardingChecked(true));
  }, [authLoading, token]);

  useEffect(() => {
    if (!onboardingChecked || authLoading || isLanguageLoading) return;
    if (!hasSeenOnboarding) {
      router.replace('/onboarding');
      return;
    }
    if (!token) {
      router.replace('/login');
    }
  }, [onboardingChecked, hasSeenOnboarding, authLoading, isLanguageLoading, token]);

  return null;
}
