import { Navigation } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';
import { Animation } from '@/constants/animations';
import { useI18n } from '@/lib/i18nContext';
import { useService } from '@/lib/serviceContext';
import { useAuth } from '@/lib/authContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

const ONBOARDING_KEY = 'veego_has_seen_onboarding';

// Icon card is 80x80 (see iconInner). The arrow travels the card's own
// bottom-left-to-top-right diagonal, extended past both corners; iconInner's
// overflow:hidden + borderRadius clips it, so it isn't drawn at all until it
// crosses the bottom edge and is gone again once it clears the top edge.
const FLY_ICON_SIZE = 35;
const FLY_TRANSLATE_X = [-57.1, 102.1];
const FLY_TRANSLATE_Y = [102.1, -57.1];
const FLY_DURATION = 2370;

export default function SplashScreen() {
  const colors = useColors();
  const {} = useService();
  const { language, isLanguageLoading } = useI18n();
  const { token, isLoading: authLoading } = useAuth();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const flyProgress = useRef(new Animated.Value(0)).current;

  // First-launch onboarding gate — checked unconditionally (before any early
  // return below) so this hook always fires in the same order every render.
  // A device that already holds a valid session is implicitly past
  // first-run: mark onboarding seen instead of showing it, so an existing
  // driver's next logout/expiry doesn't suddenly surface it either.
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
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, damping: 22, stiffness: 100, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 22, stiffness: 100, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoRotate, { toValue: 8, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(logoRotate, { toValue: -8, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(logoRotate, { toValue: 0, duration: Animation.duration.slower, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.timing(flyProgress, { toValue: 1, duration: FLY_DURATION, easing: Easing.linear, useNativeDriver: true })
      ),
    ]).start();
  }, []);

  if (isLanguageLoading) {
    return null;
  }

  if (!language) {
    return <Redirect href="/language-select" />;
  }

  if (!onboardingChecked) {
    return null;
  }

  if (!hasSeenOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  const rotateDeg = logoRotate.interpolate({ inputRange: [-8, 8], outputRange: ['-8deg', '8deg'] });
  const flyTranslateX = flyProgress.interpolate({ inputRange: [0, 1], outputRange: FLY_TRANSLATE_X });
  const flyTranslateY = flyProgress.interpolate({ inputRange: [0, 1], outputRange: FLY_TRANSLATE_Y });

  return (
    <LinearGradient colors={colors.gradientPrimary} style={styles.root}>
      <Animated.View style={[styles.content, { opacity, transform: [{ scale }] }]}>
        <Animated.View style={[styles.iconWrap, { transform: [{ rotate: rotateDeg }] }]}>
          <View style={styles.iconInner}>
            <View style={styles.iconClip}>
              <Animated.View
                style={[
                  styles.flyIcon,
                  { transform: [{ translateX: flyTranslateX }, { translateY: flyTranslateY }] },
                ]}
              >
                <Navigation size={FLY_ICON_SIZE} color="#ffffff" />
              </Animated.View>
            </View>
          </View>
          <View style={styles.iconGlow} />
        </Animated.View>
        <Text style={styles.wordmark}>Vee<Text style={{ color: colors.accent }}>Go</Text></Text>
        <Text style={styles.tagline}>DRIVER</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', gap: Spacing.lg },
  iconWrap: { position: 'relative', width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  iconInner: {
    width: 80, height: 80, borderRadius: 28, backgroundColor: '#1e1e28',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.25, shadowRadius: 32, elevation: 10,
  },
  // Separate from iconInner: overflow:hidden here (not on the shadow-casting
  // view above) so clipping the flying icon doesn't also clip the card's own
  // drop shadow.
  iconClip: { width: 80, height: 80, borderRadius: 28, overflow: 'hidden' },
  flyIcon: { position: 'absolute', left: 0, top: 0 },
  iconGlow: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  wordmark: { fontSize: 46, fontWeight: Typography.weight.bold, color: '#ffffff', letterSpacing: -2.5, fontFamily: 'Inter_700Bold' },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.7)', letterSpacing: 3, fontFamily: 'Inter_700Bold' },
});
