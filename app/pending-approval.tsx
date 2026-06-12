import { Navigation, Clock, CheckCircle2, Mail, Phone, LogOut } from 'lucide-react-native';
import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/lib/authContext';
import { endpoints } from '@/lib/api';
import { navigateAfterAuth } from '@/lib/postAuthRouter';

const STEPS = [
  { label: 'Account created', done: true },
  { label: 'Documents submitted', done: true },
  { label: 'Under review by our team', done: false, active: true },
  { label: 'Account activation', done: false },
];

const POLL_INTERVAL_MS = 10000;

export default function PendingApprovalScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const { logout, token } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await endpoints.driver.status() as { status?: string; isActive?: boolean } | null;
        if (!data) return;
        if (data.status === 'active' || data.isActive === true) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          navigateAfterAuth(token);
        }
      } catch {
        // silent — retry at next interval
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token]);

  const handleLogout = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    await logout();
    router.replace('/login');
  };

  return (
    <LinearGradient colors={['#f4f4fb', '#ededf4']} style={s.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 24, paddingBottom: botPad + 40, paddingHorizontal: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.logoRow}>
          <View style={s.logoIcon}>
            <Navigation size={28} color="white" />
          </View>
          <Text style={s.wordmark}>Vee<Text style={{ color: '#3D52D5' }}>Go</Text></Text>
        </View>

        <View style={s.card}>
          <View style={s.iconWrap}>
            <LinearGradient colors={['#fff7e6', '#fff0cc']} style={s.iconCircle}>
              <Clock size={40} color="#f59e0b" strokeWidth={1.8} />
            </LinearGradient>
          </View>

          <Text style={s.title}>Documents under{'\n'}review</Text>
          <Text style={s.sub}>
            Your documents have been submitted successfully. Our team is reviewing them and will notify you once your account is activated.
          </Text>

          <View style={s.pollingRow}>
            <Animated.View style={[s.pollingDot, { opacity: pulseAnim }]} />
            <Text style={s.pollingText}>Checking status automatically…</Text>
          </View>

          <View style={s.stepsBlock}>
            {STEPS.map((step, i) => (
              <View key={i} style={s.stepRow}>
                <View style={s.stepLeft}>
                  <View style={[
                    s.stepDot,
                    step.done && s.stepDotDone,
                    step.active && s.stepDotActive,
                  ]}>
                    {step.done ? (
                      <CheckCircle2 size={12} color="white" strokeWidth={2.5} />
                    ) : step.active ? (
                      <Animated.View style={[s.stepPulse, { opacity: pulseAnim }]} />
                    ) : null}
                  </View>
                  {i < STEPS.length - 1 && (
                    <View style={[s.stepLine, step.done && s.stepLineDone]} />
                  )}
                </View>
                <Text style={[
                  s.stepLabel,
                  step.done && s.stepLabelDone,
                  step.active && s.stepLabelActive,
                ]}>
                  {step.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={s.divider} />

          <Text style={s.contactTitle}>Need help?</Text>
          <Text style={s.contactSub}>Contact our driver support team</Text>

          <View style={s.contactRow}>
            <View style={s.contactChip}>
              <Mail size={14} color="#3D52D5" />
              <Text style={s.contactText}>drivers@veego.app</Text>
            </View>
            <View style={s.contactChip}>
              <Phone size={14} color="#3D52D5" />
              <Text style={s.contactText}>+20 100 000 0000</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <LogOut size={15} color="#5e5e72" />
          <Text style={s.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoIcon: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: '#1e1e28',
    alignItems: 'center', justifyContent: 'center',
  },
  wordmark: { fontSize: 24, fontWeight: '700', color: '#1e1e28', letterSpacing: -0.8, fontFamily: 'Inter_700Bold' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 32,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    padding: 28,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.07, shadowRadius: 20, elevation: 4,
    gap: 16,
  },
  iconWrap: { alignItems: 'center', marginBottom: 4 },
  iconCircle: {
    width: 88, height: 88, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#1e1e28', letterSpacing: -0.8, lineHeight: 34, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 14, color: '#5e5e72', lineHeight: 22, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  pollingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#f2f4fe', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8,
  },
  pollingDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#3D52D5',
  },
  pollingText: { fontSize: 12, color: '#3D52D5', fontFamily: 'Inter_500Medium' },
  stepsBlock: { gap: 0, marginTop: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 40 },
  stepLeft: { alignItems: 'center', width: 20 },
  stepDot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#e5e5ea', borderWidth: 2, borderColor: '#d1d1d6',
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: '#27ae60', borderColor: '#27ae60' },
  stepDotActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  stepPulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'white' },
  stepLine: { width: 2, flex: 1, minHeight: 20, backgroundColor: '#e5e5ea', marginVertical: 2 },
  stepLineDone: { backgroundColor: '#27ae60' },
  stepLabel: { fontSize: 14, color: '#5e5e72', fontFamily: 'Inter_400Regular', paddingTop: 1, flex: 1 },
  stepLabelDone: { color: '#1e1e28', fontWeight: '500' },
  stepLabelActive: { color: '#f59e0b', fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  divider: { height: 1, backgroundColor: '#e5e5ea' },
  contactTitle: { fontSize: 15, fontWeight: '700', color: '#1e1e28', textAlign: 'center', fontFamily: 'Inter_700Bold' },
  contactSub: { fontSize: 13, color: '#5e5e72', textAlign: 'center', marginTop: -8 },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  contactChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eef0fc', borderRadius: 99,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  contactText: { fontSize: 13, color: '#3D52D5', fontWeight: '500', fontFamily: 'Inter_500Medium' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 24, paddingVertical: 8,
  },
  logoutText: { fontSize: 14, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
});
