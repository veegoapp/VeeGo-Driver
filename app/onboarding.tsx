import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView, Animated,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Navigation } from 'lucide-react-native';
import { ArrowRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { useI18n } from '@/lib/i18nContext';

const { width } = Dimensions.get('window');

function IllustDrive() {
  return (
    <View style={ill.wrap}>
      <View style={ill.bg} />
      <Svg viewBox="0 0 300 240" style={StyleSheet.absoluteFillObject}>
        <Rect x="0" y="165" width="300" height="75" fill="#e8e8ee" rx="0" />
        <Rect x="110" y="185" width="28" height="6" fill="white" rx="3" />
        <Rect x="162" y="185" width="28" height="6" fill="white" rx="3" />
        <Rect x="70" y="118" width="160" height="52" fill="#1e1e28" rx="10" />
        <Rect x="94" y="94" width="112" height="30" fill="#2d2d42" rx="8" />
        <Rect x="102" y="100" width="38" height="18" fill="white" opacity="0.45" rx="4" />
        <Rect x="150" y="100" width="38" height="18" fill="white" opacity="0.45" rx="4" />
        <Circle cx="108" cy="170" r="14" fill="#1e1e28" />
        <Circle cx="108" cy="170" r="6" fill="#f2f2f5" />
        <Circle cx="192" cy="170" r="14" fill="#1e1e28" />
        <Circle cx="192" cy="170" r="6" fill="#f2f2f5" />
        <Rect x="224" y="128" width="12" height="8" fill="#55c49a" opacity="0.85" rx="3" />
        <Rect x="64" y="128" width="12" height="8" fill="#e85454" opacity="0.5" rx="3" />
        <Rect x="208" y="46" width="68" height="30" fill="white" rx="12" />
        <Rect x="218" y="56" width="18" height="10" fill="#55c49a" rx="3" opacity="0.7" />
        <Rect x="240" y="56" width="28" height="10" fill="#1e1e28" rx="3" opacity="0.15" />
        <Rect x="28" y="66" width="58" height="28" fill="white" rx="10" />
        <Rect x="38" y="76" width="12" height="8" fill="#55c49a" rx="2" opacity="0.8" />
        <Rect x="54" y="76" width="24" height="8" fill="#1e1e28" rx="2" opacity="0.15" />
      </Svg>
    </View>
  );
}

function IllustStats() {
  const bars = [38, 62, 44, 82, 52, 70, 96];
  return (
    <View style={ill.wrap}>
      <View style={ill.bg} />
      <Svg viewBox="0 0 300 240" style={StyleSheet.absoluteFillObject}>
        <Rect x="22" y="22" width="256" height="196" fill="white" rx="20" opacity="0.92" />
        <Rect x="38" y="44" width="90" height="10" fill="#e8e8ee" rx="5" />
        <Rect x="38" y="60" width="56" height="18" fill="#1e1e28" rx="6" />
        <Rect x="196" y="38" width="66" height="38" fill="#f8f8fb" rx="12" />
        <Rect x="206" y="50" width="12" height="14" fill="#55c49a" rx="3" opacity="0.7" />
        <Rect x="222" y="50" width="32" height="6" fill="#1e1e28" rx="2" opacity="0.2" />
        <Rect x="222" y="60" width="22" height="6" fill="#1e1e28" rx="2" opacity="0.12" />
        {bars.map((h, i) => (
          <Rect
            key={i}
            x={38 + i * 32}
            y={196 - (h * 90 / 100)}
            width={20}
            height={h * 90 / 100}
            fill={i === 6 ? '#1e1e28' : '#e8e8ee'}
            rx="4"
          />
        ))}
      </Svg>
    </View>
  );
}

function IllustSafe() {
  return (
    <View style={ill.wrap}>
      <View style={ill.bg} />
      <Svg viewBox="0 0 300 240" style={StyleSheet.absoluteFillObject}>
        <Path
          d="M150,22 L228,60 L228,142 C228,186 150,216 150,216 C150,216 72,186 72,142 L72,60 Z"
          fill="#1e1e28"
          opacity="0.06"
        />
        <Path
          d="M150,36 L214,70 L214,140 C214,178 150,205 150,205 C150,205 86,178 86,140 L86,70 Z"
          fill="#1e1e28"
        />
        <Path
          d="M118,122 L140,144 L182,100"
          stroke="white"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Rect x="20" y="48" width="44" height="44" fill="white" rx="14" />
        <Circle cx="36" cy="64" r="7" fill="#1e1e28" opacity="0.25" />
        <Rect x="42" y="60" width="14" height="8" fill="#1e1e28" opacity="0.15" rx="3" />
        <Rect x="42" y="72" width="10" height="6" fill="#1e1e28" opacity="0.1" rx="2" />
        <Rect x="236" y="136" width="44" height="44" fill="white" rx="14" />
        <Circle cx="252" cy="152" r="7" fill="#1e1e28" opacity="0.25" />
        <Rect x="258" y="148" width="14" height="8" fill="#1e1e28" opacity="0.15" rx="3" />
        <Rect x="258" y="160" width="10" height="6" fill="#1e1e28" opacity="0.1" rx="2" />
      </Svg>
    </View>
  );
}

const ill = StyleSheet.create({
  wrap: { flex: 1, width: '100%', position: 'relative' },
  bg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    backgroundColor: '#f8f8fb',
    shadowColor: '#1e1e28',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 4,
  },
});

export default function OnboardingScreen() {
  const { t } = useI18n();
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
      router.replace('/login');
    }
  };

  return (
    <LinearGradient colors={['#f4f4fb', '#ededf4'] as const} style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.logoRow}>
          <View style={s.logoIcon}>
            <Navigation size={32} color="#ffffff" />
          </View>
          <Text style={s.logoText}>Vee<Text style={{ color: '#55c49a' }}>Go</Text></Text>
          <View style={s.driverBadge}>
            <Text style={s.driverBadgeText}>DRIVER</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.replace('/login')} style={s.skipBtn} activeOpacity={0.7}>
          <Text style={s.skipText}>{t.skip}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={true}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexDirection: 'row' }}
      >
        {STEPS.map((step_, i) => (
          <Slide key={i} step={step_} active={i === step} />
        ))}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 28 }]}>
        <View style={s.dots}>
          {STEPS.map((_, i) => (
            <Dot key={i} active={i === step} done={i < step} />
          ))}
        </View>
        <TouchableOpacity style={s.nextBtn} onPress={next} activeOpacity={0.9}>
          <Text style={s.nextText}>{step === STEPS.length - 1 ? t.get_started : t.continue_label}</Text>
          <ArrowRight size={16} color="white" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

type SlideStep = { tag: string; title: string; body: string; Illust: React.ComponentType };
function Slide({ step, active }: { step: SlideStep; active: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (active) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 120, useNativeDriver: true }),
      ]).start();
    } else {
      opacity.setValue(0);
      translateY.setValue(20);
    }
  }, [active]);

  return (
    <Animated.View style={[s.slide, { opacity, transform: [{ translateY }] }]}>
      <View style={s.illustBox}>
        <step.Illust />
      </View>
      <View style={s.textBox}>
        <View style={s.tagBox}>
          <Text style={s.tagText}>{step.tag}</Text>
        </View>
        <Text style={s.title}>{step.title}</Text>
        <Text style={s.body}>{step.body}</Text>
      </View>
    </Animated.View>
  );
}

function Dot({ active, done }: { active: boolean; done: boolean }) {
  const dotWidth = useRef(new Animated.Value(6)).current;
  const dotOpacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(dotWidth, { toValue: active ? 22 : 6, damping: 18, useNativeDriver: false }),
      Animated.timing(dotOpacity, { toValue: active ? 1 : done ? 0.7 : 0.4, duration: 200, useNativeDriver: false }),
    ]).start();
  }, [active, done]);

  return (
    <Animated.View style={[s.dot, { backgroundColor: active ? '#1e1e28' : '#c3c3cc', width: dotWidth, opacity: dotOpacity }]} />
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingBottom: 8,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: '#1e1e28',
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 20, fontWeight: '700', color: '#1e1e28', letterSpacing: -0.8, fontFamily: 'Inter_700Bold' },
  driverBadge: {
    backgroundColor: 'rgba(30,30,40,0.08)', borderRadius: 99,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  driverBadgeText: { fontSize: 9, fontWeight: '700', color: '#1e1e28', letterSpacing: 1.5 },
  skipBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.7)' },
  skipText: { fontSize: 13, color: '#5e5e72', fontWeight: '500' },
  slide: { width, flex: 1, paddingHorizontal: 28, paddingTop: 12, gap: 24 },
  illustBox: {
    flex: 1, borderRadius: 32, overflow: 'hidden', maxHeight: 300,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 4,
  },
  textBox: { gap: 10 },
  tagBox: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(30,30,40,0.08)', borderRadius: 99,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  tagText: { fontSize: 10.5, fontWeight: '600', color: '#1e1e28', textTransform: 'uppercase', letterSpacing: 1.3 },
  title: { fontSize: 32, fontWeight: '700', color: '#1e1e28', letterSpacing: -1.2, lineHeight: 38, fontFamily: 'Inter_700Bold' },
  body: { fontSize: 15, color: '#5e5e72', lineHeight: 22, fontFamily: 'Inter_400Regular' },
  footer: {
    paddingHorizontal: 28, paddingTop: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },
  nextBtn: {
    flex: 1, height: 56, borderRadius: 20, backgroundColor: '#1e1e28',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 24, elevation: 8,
  },
  nextText: { color: 'white', fontSize: 15, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
});
