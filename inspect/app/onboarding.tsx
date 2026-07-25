import { useState, useRef, useEffect, type ComponentType } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView, Animated,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Navigation, ArrowRight, ArrowLeft } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { useI18n } from '@/lib/i18nContext';
import { useColors } from '@/hooks/useColors';
import { Animation } from '@/constants/animations';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';
import { VeeGoButton } from '@/components/ui/VeeGoButton';

const { width } = Dimensions.get('window');
const ONBOARDING_KEY = 'veego_has_seen_onboarding';
const MINT = '#55c49a';

async function finishOnboarding() {
  try { await AsyncStorage.setItem(ONBOARDING_KEY, '1'); } catch {}
  router.replace('/login');
}

type Colors = ReturnType<typeof useColors>;

function IllustDrive({ colors: c }: { colors: Colors }) {
  return (
    <View style={ill.wrap}>
      <View style={[ill.bg, { backgroundColor: c.card }]} />
      <Svg viewBox="0 0 300 240" style={StyleSheet.absoluteFillObject}>
        <Rect x="0" y="165" width="300" height="75" fill={c.muted} rx="0" />
        <Rect x="110" y="185" width="28" height="6" fill={c.background} rx="3" />
        <Rect x="162" y="185" width="28" height="6" fill={c.background} rx="3" />
        <Rect x="70" y="118" width="160" height="52" fill={c.foreground} rx="10" opacity={0.92} />
        <Rect x="94" y="94" width="112" height="30" fill={c.foreground} rx="8" opacity={0.75} />
        <Rect x="102" y="100" width="38" height="18" fill={c.background} opacity="0.45" rx="4" />
        <Rect x="150" y="100" width="38" height="18" fill={c.background} opacity="0.45" rx="4" />
        <Circle cx="108" cy="170" r="14" fill={c.foreground} />
        <Circle cx="108" cy="170" r="6" fill={c.background} />
        <Circle cx="192" cy="170" r="14" fill={c.foreground} />
        <Circle cx="192" cy="170" r="6" fill={c.background} />
        <Rect x="224" y="128" width="12" height="8" fill={MINT} opacity="0.85" rx="3" />
        <Rect x="64" y="128" width="12" height="8" fill="#e85454" opacity="0.5" rx="3" />

        {/* Shuttle-route badge — represents the second earning mode (scheduled routes) */}
        <Rect x="196" y="34" width="80" height="34" fill={c.card} rx="14" />
        <Rect x="206" y="44" width="20" height="14" fill={MINT} rx="4" opacity="0.85" />
        <Rect x="232" y="46" width="34" height="6" fill={c.foreground} rx="3" opacity="0.2" />
        <Rect x="232" y="56" width="24" height="5" fill={c.foreground} rx="2.5" opacity="0.12" />

        <Rect x="24" y="60" width="58" height="28" fill={c.card} rx="10" />
        <Rect x="34" y="70" width="12" height="8" fill={MINT} rx="2" opacity="0.8" />
        <Rect x="50" y="70" width="24" height="8" fill={c.foreground} rx="2" opacity="0.15" />
      </Svg>
    </View>
  );
}

function IllustStats({ colors: c }: { colors: Colors }) {
  const bars = [38, 62, 44, 82, 52, 70, 96];
  return (
    <View style={ill.wrap}>
      <View style={[ill.bg, { backgroundColor: c.card }]} />
      <Svg viewBox="0 0 300 240" style={StyleSheet.absoluteFillObject}>
        <Rect x="22" y="22" width="256" height="150" fill={c.background} rx="20" opacity="0.92" />
        <Rect x="38" y="44" width="90" height="10" fill={c.muted} rx="5" />
        <Rect x="38" y="60" width="56" height="18" fill={c.foreground} rx="6" />
        <Rect x="196" y="38" width="66" height="38" fill={c.muted} rx="12" />
        <Rect x="206" y="50" width="12" height="14" fill={MINT} rx="3" opacity="0.8" />
        <Rect x="222" y="50" width="32" height="6" fill={c.foreground} rx="2" opacity="0.2" />
        <Rect x="222" y="60" width="22" height="6" fill={c.foreground} rx="2" opacity="0.12" />
        {bars.map((h, i) => (
          <Rect
            key={i}
            x={38 + i * 32}
            y={166 - (h * 90 / 100)}
            width={20}
            height={h * 90 / 100}
            fill={i === 6 ? MINT : c.muted}
            rx="4"
          />
        ))}

        {/* Driving-mode toggle — represents "switch driving modes anytime" */}
        <Rect x="38" y="188" width="224" height="34" fill={c.background} rx="17" />
        <Rect x="42" y="192" width="106" height="26" fill={c.foreground} rx="13" />
        <Rect x="60" y="201" width="16" height="8" fill={c.background} rx="2" opacity="0.9" />
        <Rect x="82" y="203" width="46" height="5" fill={c.background} rx="2.5" opacity="0.7" />
        <Rect x="164" y="201" width="16" height="8" fill={c.mutedForeground} rx="2" opacity="0.5" />
        <Rect x="186" y="203" width="46" height="5" fill={c.mutedForeground} rx="2.5" opacity="0.4" />
      </Svg>
    </View>
  );
}

function IllustSafe({ colors: c }: { colors: Colors }) {
  return (
    <View style={ill.wrap}>
      <View style={[ill.bg, { backgroundColor: c.card }]} />
      <Svg viewBox="0 0 300 240" style={StyleSheet.absoluteFillObject}>
        <Path
          d="M150,22 L228,60 L228,142 C228,186 150,216 150,216 C150,216 72,186 72,142 L72,60 Z"
          fill={c.foreground}
          opacity="0.06"
        />
        <Path
          d="M150,36 L214,70 L214,140 C214,178 150,205 150,205 C150,205 86,178 86,140 L86,70 Z"
          fill={c.foreground}
        />
        <Path
          d="M118,122 L140,144 L182,100"
          stroke={c.background}
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Circle cx="150" cy="70" r="6" fill={MINT} />

        {/* 24/7 support badge */}
        <Rect x="18" y="46" width="60" height="60" fill={c.card} rx="18" />
        <Circle cx="48" cy="70" r="12" fill={MINT} opacity="0.16" />
        <Circle cx="48" cy="70" r="6" fill={MINT} />
        <Rect x="30" y="86" width="36" height="6" fill={c.foreground} opacity="0.15" rx="3" />

        <Rect x="222" y="132" width="60" height="60" fill={c.card} rx="18" />
        <Circle cx="252" cy="156" r="7" fill={c.foreground} opacity="0.25" />
        <Rect x="234" y="168" width="36" height="6" fill={c.foreground} opacity="0.15" rx="3" />
      </Svg>
    </View>
  );
}

const ill = StyleSheet.create({
  wrap: { flex: 1, width: '100%', position: 'relative' },
  bg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    shadowColor: '#1e1e28',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: Shadows.medium.elevation,
  },
});

export default function OnboardingScreen() {
  const { t, isRTL } = useI18n();
  const colors = useColors();
  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  const STEPS = [
    { tag: t.onboarding_step1_tag, title: t.onboarding_step1_title, body: t.onboarding_step1_body, Illust: IllustDrive },
    { tag: t.onboarding_step2_tag, title: t.onboarding_step2_title, body: t.onboarding_step2_body, Illust: IllustStats },
    { tag: t.onboarding_step3_tag, title: t.onboarding_step3_title, body: t.onboarding_step3_body, Illust: IllustSafe },
  ];

  const next = () => {
    if (step < STEPS.length - 1) {
      const n = step + 1;
      setStep(n);
      scrollRef.current?.scrollTo({ x: n * width, animated: true });
    } else {
      finishOnboarding();
    }
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const newStep = Math.round(e.nativeEvent.contentOffset.x / width);
    if (newStep !== step && newStep >= 0 && newStep < STEPS.length) setStep(newStep);
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={['rgba(42,58,90,0.12)', 'transparent']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.logoRow}>
          <View style={[s.logoIcon, { backgroundColor: colors.foreground }]}>
            <Navigation size={32} color={colors.background} />
          </View>
          <Text style={[s.logoText, { color: colors.foreground }]}>Vee<Text style={{ color: MINT }}>Go</Text></Text>
          <View style={[s.driverBadge, { backgroundColor: colors.muted }]}>
            <Text style={[s.driverBadgeText, { color: colors.foreground }]}>DRIVER</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={finishOnboarding}
          style={[s.skipBtn, { backgroundColor: colors.muted }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t.skip}
        >
          <Text style={[s.skipText, { color: colors.mutedForeground }]}>{t.skip}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexDirection: 'row' }}
      >
        {STEPS.map((step_, i) => (
          <Slide key={i} step={step_} active={i === step} colors={colors} />
        ))}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 28 }]}>
        <View style={s.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {STEPS.map((_, i) => (
            <Dot key={i} active={i === step} done={i < step} colors={colors} />
          ))}
        </View>
        <VeeGoButton
          title={step === STEPS.length - 1 ? t.get_started : t.continue_label}
          onPress={next}
          size="large"
          icon={isRTL ? <ArrowLeft size={16} color={colors.primaryForeground} strokeWidth={2} /> : <ArrowRight size={16} color={colors.primaryForeground} strokeWidth={2} />}
          iconPosition="right"
          style={s.nextBtn}
        />
      </View>
    </View>
  );
}

type SlideStep = { tag: string; title: string; body: string; Illust: ComponentType<{ colors: Colors }> };
function Slide({ step, active, colors: c }: { step: SlideStep; active: boolean; colors: Colors }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (active) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: Animation.duration.slow, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...Animation.spring.sheet }),
      ]).start();
    } else {
      opacity.setValue(0);
      translateY.setValue(20);
    }
  }, [active]);

  return (
    <Animated.View style={[s.slide, { opacity, transform: [{ translateY }] }]}>
      <View style={s.illustBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <step.Illust colors={c} />
      </View>
      <View style={s.textBox}>
        <View style={[s.tagBox, { backgroundColor: c.muted }]}>
          <Text style={[s.tagText, { color: c.foreground }]}>{step.tag}</Text>
        </View>
        <Text style={[s.title, { color: c.foreground }]}>{step.title}</Text>
        <Text style={[s.body, { color: c.mutedForeground }]}>{step.body}</Text>
      </View>
    </Animated.View>
  );
}

function Dot({ active, done, colors: c }: { active: boolean; done: boolean; colors: Colors }) {
  const dotWidth = useRef(new Animated.Value(6)).current;
  const dotOpacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(dotWidth, { toValue: active ? 22 : 6, useNativeDriver: false, ...Animation.spring.tabBar }),
      Animated.timing(dotOpacity, { toValue: active ? 1 : done ? 0.7 : 0.4, duration: Animation.duration.fast, useNativeDriver: false }),
    ]).start();
  }, [active, done]);

  return (
    <Animated.View style={[s.dot, { backgroundColor: active ? c.foreground : c.mutedForeground, width: dotWidth, opacity: dotOpacity }]} />
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoIcon: {
    width: 36, height: 36, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 20, fontWeight: Typography.weight.bold, letterSpacing: -0.8, fontFamily: 'Inter_700Bold' },
  driverBadge: {
    borderRadius: 99,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  driverBadgeText: { fontSize: 9, fontWeight: Typography.weight.bold, letterSpacing: 1.5 },
  skipBtn: { paddingHorizontal: 14, paddingVertical: Spacing.sm, borderRadius: 20 },
  skipText: { fontSize: 13, fontWeight: Typography.weight.medium },
  slide: { width, flex: 1, paddingHorizontal: 28, paddingTop: Spacing.md, gap: Spacing.xl },
  illustBox: {
    flex: 1, borderRadius: 32, overflow: 'hidden', maxHeight: 300,
  },
  textBox: { gap: 10 },
  tagBox: {
    alignSelf: 'flex-start',
    borderRadius: 99,
    paddingHorizontal: Spacing.md, paddingVertical: 5,
  },
  tagText: { fontSize: 10.5, fontWeight: Typography.weight.semibold, textTransform: 'uppercase', letterSpacing: 1.3 },
  title: { fontSize: 32, fontWeight: Typography.weight.bold, letterSpacing: -1.2, lineHeight: 38, fontFamily: 'Inter_700Bold' },
  body: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular' },
  footer: {
    paddingHorizontal: 28, paddingTop: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.lg,
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },
  nextBtn: {
    flex: 1,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 24, elevation: Shadows.large.elevation,
  },
});
