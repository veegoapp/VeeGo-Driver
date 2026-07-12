import { Navigation } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { ArrowRight, Shield, TrendingUp, Zap } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { useService } from '@/lib/serviceContext';

const FEATURES = [
  { Icon: TrendingUp, label: 'Real-time earnings & instant payouts' },
  { Icon: Zap, label: 'Smart ride matching, fewer empty miles' },
  { Icon: Shield, label: '24/7 driver support & safety toolkit' },
] as const;

export default function SplashScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {} = useService();
  const { language, isLanguageLoading } = useI18n();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;

  if (isLanguageLoading) {
    return null;
  }

  if (!language) {
    return <Redirect href="/language-select" />;
  }

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
      Animated.spring(logoScale, { toValue: 1, stiffness: 200, damping: 18, useNativeDriver: false }),
    ]).start();
  }, []);

  const topPad = insets.top;
  const botPad = insets.bottom;
return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={['rgba(42,58,90,0.4)', 'transparent']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Animated.View style={[styles.content, {
        paddingTop: topPad + 20,
        paddingBottom: botPad + 10,
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      }]}>
        <Animated.View style={[styles.logoRow, { transform: [{ scale: logoScale }] }]}>
          <View style={styles.logoIcon}>
            <Navigation size={32} color="#ffffff" />
          </View>
          <View>
            <Text style={[styles.logoName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Vee<Text style={{ color: '#55c49a' }}>Go</Text></Text>
            <Text style={[styles.logoSub, { color: '#1e1e28', fontFamily: 'Inter_700Bold' }]}>DRIVER</Text>
          </View>
        </Animated.View>

        <View style={{ marginTop: 64 }}>
          <Text style={[styles.headline, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            Drive.{'\n'}Earn.
          </Text>
          <Text style={[styles.headlineAccent, { color: '#1e1e28', fontFamily: 'Inter_700Bold' }]}>
            Move smarter.
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Premium driver companion for the VeeGo platform. Built for the road.
          </Text>
        </View>

        <View style={{ marginTop: 48, gap: 10 }}>
          {FEATURES.map((f) => (
            <View key={f.label} style={[styles.featureCard, { backgroundColor: colors.glass, borderColor: colors.border }]}>
              <View style={[styles.featureIcon, { backgroundColor: 'rgba(30,30,40,0.08)' }]}>
                <f.Icon size={18} color="#1e1e28" strokeWidth={2} />
              </View>
              <Text style={[styles.featureLabel, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>{f.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ marginTop: 40, gap: 10 }}>
          <Pressable
            onPress={() => router.push('/login')}
            style={({ pressed }) => [styles.ctaBtn, { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <View style={styles.ctaBtnInner}>
              <Text style={[styles.ctaBtnText, { color: 'white', fontFamily: 'Inter_700Bold' }]}>Start driving</Text>
              <ArrowRight size={20} color="white" strokeWidth={2} />
            </View>
          </Pressable>
</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoIcon: {
    width: 56, height: 56, borderRadius: 20, backgroundColor: '#1e1e28',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 24, elevation: 8,
  },
  logoName: { fontSize: 30, letterSpacing: -0.5 },
  logoSub: { fontSize: 11, letterSpacing: 3.5, opacity: 0.6 },
  headline: { fontSize: 48, lineHeight: 52, letterSpacing: -1 },
  headlineAccent: { fontSize: 48, lineHeight: 52, letterSpacing: -1, opacity: 0.5 },
  subtitle: { fontSize: 15, marginTop: 20, lineHeight: 24 },
  featureCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  featureIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureLabel: { fontSize: 14, flex: 1 },
  ctaBtn: { borderRadius: 16, overflow: 'hidden', elevation: 8, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 16 },
  ctaBtnInner: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1e1e28', borderRadius: 16 },
  ctaBtnText: { fontSize: 16 },
});
