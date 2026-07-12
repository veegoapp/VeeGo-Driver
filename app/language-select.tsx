
import { Navigation, ArrowRight, ArrowLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import React, { useRef } from 'react';
import {
  Animated,
  I18nManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Language, useI18n } from '@/lib/i18nContext';

const LANG_OPTIONS: { lang: Language; label: string; nativeLabel: string; flag: string }[] = [
  { lang: 'en', label: 'English', nativeLabel: 'Continue in English', flag: '🇬🇧' },
  { lang: 'ar', label: 'العربية', nativeLabel: 'تابع بالعربية', flag: '🇪🇬' },
];

export default function LanguageSelectScreen() {
  const { setLanguage } = useI18n();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: false }),
    ]).start();
  }, []);

  const handleSelect = (lang: Language) => {
    // On Android, changing the RTL direction via I18nManager.forceRTL() triggers
    // an immediate activity restart that destroys the navigator tree before any
    // navigation call can execute. Skip the navigate call in that case — the app
    // will relaunch fresh, read the persisted language from AsyncStorage, and
    // land on the splash screen automatically.
    // Navigate to /login directly (not /) to avoid the index→language-select
    // redirect chain which can fail when the navigator is in a transitional state.
    const androidRtlRestart =
      Platform.OS === 'android' && I18nManager.isRTL !== (lang === 'ar');

    setLanguage(lang);

    if (!androidRtlRestart) {
      router.replace('/login');
    }
  };

  const topPad = insets.top;
  const botPad = insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topPad, paddingBottom: botPad + 24 }]}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.logoRow}>
          <View style={styles.logoIcon}>
            <Navigation size={32} color="#ffffff" />
          </View>
          <View>
            <Text style={styles.logoName}>
              Vee<Text style={{ color: '#55c49a' }}>Go</Text>
            </Text>
            <Text style={styles.logoSub}>DRIVER</Text>
          </View>
        </View>

        <View style={styles.headerBlock}>
          <Text style={styles.title}>Select Language</Text>
          <Text style={styles.titleAr}>اختر اللغة</Text>
          <Text style={styles.subtitle}>Choose your preferred language to continue</Text>
        </View>

        <View style={styles.optionsContainer}>
          {LANG_OPTIONS.map((opt) => (
            <LanguageCard
              key={opt.lang}
              flag={opt.flag}
              label={opt.label}
              nativeLabel={opt.nativeLabel}
              isRTL={opt.lang === 'ar'}
              onPress={() => handleSelect(opt.lang)}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function LanguageCard({
  flag,
  label,
  nativeLabel,
  isRTL,
  onPress,
}: {
  flag: string;
  label: string;
  nativeLabel: string;
  isRTL: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const handlePressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
        <View style={[styles.cardInner, isRTL && styles.cardInnerRTL]}>
          <Text style={styles.flag}>{flag}</Text>
          <View style={[styles.cardText, isRTL && styles.cardTextRTL]}>
            <Text style={[styles.cardLabel, isRTL && styles.cardLabelRTL]}>{label}</Text>
            <Text style={[styles.cardSub, isRTL && styles.cardSubRTL]}>{nativeLabel}</Text>
          </View>
          <View style={[styles.arrowCircle, isRTL && styles.arrowCircleRTL]}>
            {isRTL ? <ArrowLeft size={18} color="#1e1e28" /> : <ArrowRight size={18} color="#1e1e28" />}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6F8',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  inner: {
    flex: 1,
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  logoIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: '#1e1e28',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1e1e28',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  logoName: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#0D1117',
    letterSpacing: -0.5,
  },
  logoSub: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#1e1e28',
    letterSpacing: 3.5,
    opacity: 0.5,
  },
  headerBlock: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    color: '#0D1117',
    letterSpacing: -0.5,
  },
  titleAr: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#0D1117',
    letterSpacing: 0,
    opacity: 0.55,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  optionsContainer: {
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 16,
  },
  cardInnerRTL: {
    flexDirection: 'row-reverse',
  },
  flag: {
    fontSize: 36,
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  cardTextRTL: {
    alignItems: 'flex-end',
  },
  cardLabel: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#0D1117',
    letterSpacing: -0.3,
  },
  cardLabelRTL: {
    textAlign: 'right',
  },
  cardSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#6B7280',
  },
  cardSubRTL: {
    textAlign: 'right',
  },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAEDF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowCircleRTL: {
    backgroundColor: '#EAEDF2',
  },
});
