import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AlertCircle, ArrowRight, Bell, GitBranch, MapPin, Navigation, Phone, Users, Wifi, WifiOff } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapBackdrop } from '@/components/MapBackdrop';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { useShuttle } from '@/lib/shuttleContext';

const TAB_BAR_HEIGHT = 96;

type QuickActionIconName = 'users' | 'map-pin' | 'alert-circle' | 'phone';

const QUICK_ACTION_ICONS: Record<QuickActionIconName, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  'users': Users,
  'map-pin': MapPin,
  'alert-circle': AlertCircle,
  'phone': Phone,
};

export default function ShuttleHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  const [online, setOnline] = useState(true);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [shiftActive, setShiftActive] = useState(true);

  const pulseScale = useRef(new Animated.Value(0.8)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  const { data: driverRaw } = useQuery({ queryKey: ['driver'], queryFn: endpoints.driver.me });
  const driverData = driverRaw as any;

  const { activeLine, stops, currentStopIndex, allLines } = useShuttle();
  const currentStop = stops[currentStopIndex] ?? null;
  const nextStop = stops[currentStopIndex + 1] ?? null;
  const progress = stops.length > 0 ? currentStopIndex / stops.length : 0;

  const { data: summaryRaw } = useQuery({
    queryKey: ['earnings-summary'],
    queryFn: endpoints.earnings.summary,
  });
  const summaryData = summaryRaw as { summary?: { totalEarnings?: string | number } } | undefined;
  const todayEarnings = parseFloat(String(summaryData?.summary?.totalEarnings ?? 0)).toFixed(0);
  const completedCount = allLines.filter(l => l.status === 'completed').length;

  useEffect(() => {
    Animated.spring(cardAnim, { toValue: 1, stiffness: 200, damping: 20, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (!online) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 2.2, duration: 2000, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 0.8, duration: 0, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [online]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapBackdrop />
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: TAB_BAR_HEIGHT + 24, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
              {t.good_morning},
            </Text>
            <Text style={[styles.driverName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              {(driverData?.name ?? '—').split(' ')[0]}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable style={styles.iconBtn} onPress={() => router.push('/messages')}>
              <GlassView style={styles.iconBtnGlass} borderRadius={20}>
                <Bell size={18} color={colors.foreground} strokeWidth={2} />
                <View style={[styles.notifDot, { backgroundColor: colors.destructive }]} />
              </GlassView>
            </Pressable>
            <GlassView style={[styles.serviceChip, { borderColor: '#1e1e2833' }]} borderRadius={20}>
              <View style={[styles.serviceChipDot, { backgroundColor: '#1e1e28' }]} />
              <Text style={[styles.serviceChipText, { color: '#1e1e28', fontFamily: 'Inter_700Bold' }]}>SHUTTLE</Text>
            </GlassView>
          </View>
        </View>

        <View style={styles.onlineRow}>
          <View style={styles.pulseWrap}>
            {online && (
              <Animated.View style={[styles.pulseRing, {
                backgroundColor: '#1e1e2840',
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              }]} />
            )}
            <Pressable
              onPress={async () => {
                if (onlineLoading) return;
                setOnlineLoading(true);
                const next = !online;
                try {
                  if (next) {
                    await endpoints.driver.goOnline();
                  } else {
                    await endpoints.driver.goOffline();
                  }
                } catch {
                  // best-effort — update UI regardless
                } finally {
                  setOnline(next);
                  setOnlineLoading(false);
                }
              }}
              disabled={onlineLoading}
              style={({ pressed }) => [styles.onlineBtn, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
            >
              {online ? (
                <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.onlineBtnGrad}>
                  <Wifi size={20} color="#fff" strokeWidth={2} />
                </LinearGradient>
              ) : (
                <View style={[styles.onlineBtnOff, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <WifiOff size={20} color={colors.mutedForeground} strokeWidth={2} />
                </View>
              )}
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.onlineStatus, { color: online ? '#2d2d42' : colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              {online ? `${t.online_status} — ${t.shuttle_service}` : t.youre_offline}
            </Text>
            <Text style={[styles.onlineSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
              {online ? t.live : t.go}
            </Text>
          </View>
          <Pressable
            onPress={() => setShiftActive(v => !v)}
            style={[styles.shiftBtn, { backgroundColor: shiftActive ? '#1e1e2826' : colors.secondary }]}
          >
            <Text style={[styles.shiftBtnText, { color: shiftActive ? '#2d2d42' : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {shiftActive ? t.cancel_trip : t.go}
            </Text>
          </Pressable>
        </View>

        <GlassView strong style={styles.statsRow} borderRadius={20}>
          <StatItem label={t.trips_stat} value={String(completedCount)} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatItem label={t.routes} value={String(allLines.length)} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatItem label={t.net_earnings} value={`${todayEarnings} DT`} highlight colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatItem label={t.active} value={String(allLines.filter(l => l.status === 'in-progress').length)} colors={colors} />
        </GlassView>

        <View style={styles.quickActions}>
          <QuickAction icon="users" label={t.passengers} onPress={() => router.push('/shuttle/boarding')} colors={colors} accent="#1e1e28" />
          <QuickAction icon="map-pin" label={t.next_departure} onPress={() => router.push('/shuttle/trip-active')} colors={colors} accent="#D5B23D" />
          <QuickAction icon="alert-circle" label={t.error} onPress={() => router.push('/support')} colors={colors} accent={colors.destructive} />
          <QuickAction icon="phone" label={t.call} onPress={() => Linking.openURL('tel:19500')} colors={colors} accent={colors.primary} />
        </View>

        {activeLine && online && (
          <Animated.View style={[{ marginTop: 16, opacity: cardAnim, transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <GlassView strong style={[styles.activeCard, { borderColor: '#1e1e2833' }]} borderRadius={24}>
              <View style={styles.activeCardHeader}>
                <View style={styles.livePill}>
                  <View style={[styles.liveDot, { backgroundColor: '#1e1e28' }]} />
                  <Text style={[styles.liveText, { color: '#1e1e28', fontFamily: 'Inter_700Bold' }]}>LIVE</Text>
                </View>
                <Text style={[styles.lineNumber, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                  {activeLine.lineNumber}
                </Text>
              </View>
              <Text style={[styles.activeLineName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {activeLine.name}
              </Text>
              <Text style={[styles.activeLineRoute, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {activeLine.from} → {activeLine.to}
              </Text>

              <View style={styles.progressWrap}>
                <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
                  <LinearGradient
                    colors={['#2d2d42', '#1e1e28']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]}
                  />
                </View>
                <Text style={[styles.progressPct, { color: '#2d2d42', fontFamily: 'Inter_700Bold' }]}>
                  {Math.round(progress * 100)}%
                </Text>
              </View>

              <View style={styles.stopRow}>
                <View style={styles.stopBox}>
                  <View style={[styles.stopDotCurrent, { backgroundColor: colors.accent }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stopBoxLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.active.toUpperCase()}</Text>
                    <Text style={[styles.stopBoxName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{currentStop?.name ?? '—'}</Text>
                    <Text style={[styles.stopBoxMeta, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{currentStop ? `${currentStop.boarded}/${currentStop.expected} boarded` : '—'}</Text>
                  </View>
                </View>
                <View style={[styles.stopArrow, { backgroundColor: colors.secondary }]}>
                  <ArrowRight size={14} color={colors.mutedForeground} strokeWidth={2} />
                </View>
                <View style={styles.stopBox}>
                  <View style={[styles.stopDotNext, { borderColor: '#1e1e28' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stopBoxLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.next_departure.toUpperCase()}</Text>
                    <Text style={[styles.stopBoxName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{nextStop?.name ?? '—'}</Text>
                    <Text style={[styles.stopBoxMeta, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{nextStop ? `ETA ${nextStop.eta}` : '—'}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.dotsRow}>
                {stops.map((stop, i) => (
                  <View key={stop.id} style={styles.dotItem}>
                    <View style={[styles.dot, {
                      backgroundColor: i < currentStopIndex ? '#1e1e28' : i === currentStopIndex ? colors.accent : colors.secondary,
                    }]} />
                    {i < stops.length - 1 && (
                      <View style={[styles.dotLine, { backgroundColor: i < currentStopIndex ? '#1e1e2866' : colors.border }]} />
                    )}
                  </View>
                ))}
              </View>

              <Pressable onPress={() => router.push('/shuttle/trip-active')} style={styles.continueBtn}>
                <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.continueBtnGrad}>
                  <Navigation size={16} color="#fff" strokeWidth={2} />
                  <Text style={[styles.continueBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.full_route}</Text>
                </LinearGradient>
              </Pressable>
            </GlassView>
          </Animated.View>
        )}

        {(!activeLine || !online) && (
          <GlassView style={[styles.noLineCard, { marginTop: 16 }]} borderRadius={20}>
            <GitBranch size={32} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.noLineTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.no_booking}</Text>
            <Text style={[styles.noLineSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {t.trips_here}
            </Text>
            <Pressable onPress={() => router.push('/(shuttle)/lines')} style={styles.goToLinesBtn}>
              <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.goToLinesBtnGrad}>
                <Text style={[styles.goToLinesBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.browse_routes}</Text>
                <ArrowRight size={16} color="#fff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
              </LinearGradient>
            </Pressable>
          </GlassView>
        )}

      </ScrollView>
    </View>
  );
}

function StatItem({ label, value, highlight, colors }: { label: string; value: string; highlight?: boolean; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
      <Text style={[styles.statValue, { color: highlight ? '#2d2d42' : colors.foreground, fontFamily: 'Inter_700Bold' }]}>{value}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress, colors, accent }: { icon: QuickActionIconName; label: string; onPress: () => void; colors: ReturnType<typeof useColors>; accent: string }) {
  const Icon = QUICK_ACTION_ICONS[icon];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
      <GlassView style={styles.quickActionCard} borderRadius={18}>
        <View style={[styles.quickActionIcon, { backgroundColor: accent + '22' }]}>
          <Icon size={20} color={accent} strokeWidth={2} />
        </View>
        <Text style={[styles.quickActionLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{label}</Text>
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 8 },
  greeting: { fontSize: 12 },
  driverName: { fontSize: 22, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {},
  iconBtnGlass: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4 },
  serviceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  serviceChipDot: { width: 6, height: 6, borderRadius: 3 },
  serviceChipText: { fontSize: 10, letterSpacing: 1.5 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  pulseWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 56, height: 56, borderRadius: 28 },
  onlineBtn: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', elevation: 8, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 16 },
  onlineBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  onlineBtnOff: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  onlineStatus: { fontSize: 14 },
  onlineSub: { fontSize: 12, marginTop: 2 },
  shiftBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  shiftBtnText: { fontSize: 12 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, marginTop: 16 },
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  statValue: { fontSize: 14, marginTop: 2 },
  divider: { width: 1, height: 28 },
  activeCard: { padding: 20, borderWidth: 1 },
  activeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e1e2820', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 10, letterSpacing: 2 },
  lineNumber: { fontSize: 12, letterSpacing: 1.5 },
  activeLineName: { fontSize: 18 },
  activeLineRoute: { fontSize: 13, marginTop: 4 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressPct: { fontSize: 12, minWidth: 32, textAlign: 'right' },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  stopBox: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stopDotCurrent: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  stopDotNext: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, marginTop: 4 },
  stopBoxLabel: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  stopBoxName: { fontSize: 13, marginTop: 2 },
  stopBoxMeta: { fontSize: 11, marginTop: 2 },
  stopArrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dotsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  dotItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotLine: { flex: 1, height: 2, marginHorizontal: -1 },
  continueBtn: { marginTop: 16, borderRadius: 14, overflow: 'hidden', elevation: 6, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 10 },
  continueBtnGrad: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  continueBtnText: { fontSize: 15, color: '#fff' },
  noLineCard: { padding: 32, alignItems: 'center', gap: 12 },
  noLineTitle: { fontSize: 16 },
  noLineSub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  goToLinesBtn: { marginTop: 8, borderRadius: 14, overflow: 'hidden', elevation: 6, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8 },
  goToLinesBtnGrad: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  goToLinesBtnText: { fontSize: 14, color: '#fff' },
  quickActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  quickActionCard: { flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 6, gap: 8 },
  quickActionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { fontSize: 11, textAlign: 'center' },
});
