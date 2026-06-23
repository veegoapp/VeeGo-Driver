import {
  Navigation, Clock, CheckCircle2, XCircle, AlertTriangle,
  Mail, Phone, LogOut, RefreshCw, ArrowRight,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Platform, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/authContext';
import { useSocket } from '@/lib/socketContext';
import { endpoints } from '@/lib/api';
import { navigateToHome } from '@/lib/postAuthRouter';

type OnboardingStatus = 'pending' | 'pending_review' | 'approved' | 'rejected';

type OnboardingData = {
  onboardingStatus: OnboardingStatus;
  rejectionReason: string | null;
  serviceType: string | null;
  missingDocuments: string[];
  totalRequired: number;
  totalUploaded: number;
};

const POLL_MS = 15_000;

export default function PendingApprovalScreen() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const botPad = insets.bottom;
  const { logout, token } = useAuth();
  const { socket } = useSocket();

  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await endpoints.driver.onboarding();
      setData(res);
      if (res.onboardingStatus === 'approved') {
        stopPolling();
        navigateToHome(res.serviceType);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [stopPolling]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStatus]);

  // Socket events for real-time updates
  useEffect(() => {
    if (!socket) return;
    const onActivated = () => {
      stopPolling();
      // Re-fetch to get the latest serviceType, then route to the correct home
      endpoints.driver.onboarding()
        .then((res) => navigateToHome(res.serviceType))
        .catch(() => navigateToHome(data?.serviceType));
    };
    const onRejected = () => fetchStatus();
    const onChanges = () => fetchStatus();

    socket.on('driver:account:activated', onActivated);
    socket.on('driver:account:rejected', onRejected);
    socket.on('driver:changes:requested', onChanges);
    return () => {
      socket.off('driver:account:activated', onActivated);
      socket.off('driver:account:rejected', onRejected);
      socket.off('driver:changes:requested', onChanges);
    };
  }, [socket, fetchStatus, stopPolling, data]);

  const handleLogout = async () => {
    stopPolling();
    await logout();
    router.replace('/login');
  };

  const status = data?.onboardingStatus ?? 'pending';

  return (
    <LinearGradient colors={['#f4f4fb', '#ededf4']} style={s.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 24, paddingBottom: botPad + 40, paddingHorizontal: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={s.logoRow}>
          <View style={s.logoIcon}><Navigation size={26} color="white" /></View>
          <Text style={s.wordmark}>Vee<Text style={{ color: '#3D52D5' }}>Go</Text></Text>
        </View>

        {loading ? (
          <View style={s.loadingCard}>
            <ActivityIndicator size="large" color="#3D52D5" />
          </View>
        ) : (
          <View style={s.card}>
            {/* ── PENDING — incomplete docs ──────────────────────── */}
            {status === 'pending' && (
              <>
                <StatusIcon color="#f59e0b" Icon={AlertTriangle} />
                <Text style={s.title}>
                  {data?.rejectionReason ? 'Changes requested' : 'Complete your documents'}
                </Text>
                <Text style={s.sub}>
                  {data?.rejectionReason
                    ? data.rejectionReason
                    : `Upload all required documents to submit your application. (${data?.totalUploaded ?? 0}/${data?.totalRequired ?? 8} uploaded)`
                  }
                </Text>
                <TouchableOpacity
                  style={s.actionBtn}
                  onPress={() => router.push('/register-documents')}
                  activeOpacity={0.85}
                >
                  <Text style={s.actionBtnText}>Upload documents</Text>
                  <ArrowRight size={16} color="white" strokeWidth={2} />
                </TouchableOpacity>
              </>
            )}

            {/* ── PENDING REVIEW — waiting ────────────────────────── */}
            {status === 'pending_review' && (
              <>
                <StatusIcon color="#f59e0b" Icon={Clock} pulse pulseAnim={pulseAnim} />
                <Text style={s.title}>Under review</Text>
                <Text style={s.sub}>
                  Your documents have been submitted. Our team is reviewing them — this usually takes 1–2 business days. We'll notify you once a decision is made.
                </Text>

                <View style={s.pollingRow}>
                  <Animated.View style={[s.pollingDot, { opacity: pulseAnim }]} />
                  <Text style={s.pollingText}>Checking status automatically…</Text>
                </View>

                {/* Progress steps */}
                <Steps active={1} />

                <TouchableOpacity
                  style={s.refreshBtn}
                  onPress={() => { setLoading(true); fetchStatus(); }}
                  activeOpacity={0.7}
                >
                  <RefreshCw size={14} color="#5e5e72" />
                  <Text style={s.refreshText}>Refresh status</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── REJECTED ────────────────────────────────────────── */}
            {status === 'rejected' && (
              <>
                <StatusIcon color="#e53935" Icon={XCircle} />
                <Text style={[s.title, { color: '#e53935' }]}>Application rejected</Text>
                {data?.rejectionReason && (
                  <View style={s.rejectionBox}>
                    <Text style={s.rejectionLabel}>Reason from admin:</Text>
                    <Text style={s.rejectionText}>{data.rejectionReason}</Text>
                  </View>
                )}
                <Text style={s.sub}>
                  You can re-upload your documents. Once all required documents are re-submitted, your application will automatically return to review.
                </Text>
                <TouchableOpacity
                  style={s.actionBtn}
                  onPress={() => router.push('/register-documents')}
                  activeOpacity={0.85}
                >
                  <Text style={s.actionBtnText}>Re-upload documents</Text>
                  <ArrowRight size={16} color="white" strokeWidth={2} />
                </TouchableOpacity>
              </>
            )}

            {/* ── APPROVED (redirect fires above but show briefly) ── */}
            {status === 'approved' && (
              <>
                <StatusIcon color="#27ae60" Icon={CheckCircle2} />
                <Text style={[s.title, { color: '#27ae60' }]}>Account approved!</Text>
                <Text style={s.sub}>Redirecting you to the dashboard…</Text>
                <ActivityIndicator color="#27ae60" style={{ marginTop: 8 }} />
              </>
            )}

            <View style={s.divider} />

            {/* Contact */}
            <Text style={s.contactTitle}>Need help?</Text>
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
        )}

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <LogOut size={15} color="#5e5e72" />
          <Text style={s.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatusIcon({ color, Icon, pulse, pulseAnim }: {
  color: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  pulse?: boolean;
  pulseAnim?: Animated.Value;
}) {
  const bg = color + '18';
  return (
    <View style={s.iconWrap}>
      <Animated.View style={[
        s.iconCircle,
        { backgroundColor: bg },
        pulse && pulseAnim && { opacity: pulseAnim },
      ]}>
        <Icon size={40} color={color} strokeWidth={1.8} />
      </Animated.View>
    </View>
  );
}

const STEP_LABELS = ['Account created', 'Documents submitted', 'Under review', 'Approved'];
function Steps({ active }: { active: number }) {
  return (
    <View style={s.stepsBlock}>
      {STEP_LABELS.map((label, i) => (
        <View key={i} style={s.stepRow}>
          <View style={s.stepLeft}>
            <View style={[s.stepDot, i < active && s.stepDotDone, i === active && s.stepDotActive]}>
              {i < active && <CheckCircle2 size={11} color="white" strokeWidth={2.5} />}
            </View>
            {i < STEP_LABELS.length - 1 && <View style={[s.stepLine, i < active && s.stepLineDone]} />}
          </View>
          <Text style={[s.stepLabel, i < active && s.stepLabelDone, i === active && s.stepLabelActive]}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  logoIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#1e1e28', alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontSize: 24, fontWeight: '700', color: '#1e1e28', letterSpacing: -0.8, fontFamily: 'Inter_700Bold' },
  loadingCard: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 32,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    padding: 28, gap: 16,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.07, shadowRadius: 20, elevation: 4,
  },
  iconWrap: { alignItems: 'center', marginBottom: 4 },
  iconCircle: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: '#1e1e28', letterSpacing: -0.6, lineHeight: 32, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 14, color: '#5e5e72', lineHeight: 22, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  rejectionBox: {
    backgroundColor: '#fff5f5', borderRadius: 16, borderWidth: 1, borderColor: '#fca5a5', padding: 14, gap: 6,
  },
  rejectionLabel: { fontSize: 11, fontWeight: '700', color: '#e53935', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Inter_700Bold' },
  rejectionText: { fontSize: 14, color: '#1e1e28', lineHeight: 20, fontFamily: 'Inter_400Regular' },
  pollingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#f2f4fe', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8,
  },
  pollingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3D52D5' },
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
  stepLine: { width: 2, flex: 1, minHeight: 20, backgroundColor: '#e5e5ea', marginVertical: 2 },
  stepLineDone: { backgroundColor: '#27ae60' },
  stepLabel: { fontSize: 14, color: '#5e5e72', fontFamily: 'Inter_400Regular', paddingTop: 1, flex: 1 },
  stepLabelDone: { color: '#1e1e28', fontWeight: '500' },
  stepLabelActive: { color: '#f59e0b', fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  actionBtn: {
    height: 52, borderRadius: 18, backgroundColor: '#1e1e28',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 6,
  },
  actionBtnText: { color: 'white', fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  refreshText: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
  divider: { height: 1, backgroundColor: '#e5e5ea' },
  contactTitle: { fontSize: 14, fontWeight: '700', color: '#1e1e28', textAlign: 'center', fontFamily: 'Inter_700Bold' },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  contactChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eef0fc', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8,
  },
  contactText: { fontSize: 12, color: '#3D52D5', fontWeight: '500', fontFamily: 'Inter_500Medium' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 24, paddingVertical: 8,
  },
  logoutText: { fontSize: 14, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
});
