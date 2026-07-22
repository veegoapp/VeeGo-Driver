import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AlertTriangle, ArrowRight, Bell, Calendar, ChevronRight, Clock, GitBranch, Navigation, RefreshCw, Users, Wifi, WifiOff, X } from 'lucide-react-native';
import { useLocationBroadcast } from '@/hooks/useLocationBroadcast';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { useShuttle, findLineForRoute, type ShuttleBooking, type ShuttleLine } from '@/lib/shuttleContext';
import { useReferral } from '@/lib/referralContext';
import { useSocket } from '@/lib/socketContext';
import { useServiceControl } from '@/lib/serviceControlContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { computeDeadlineMinutes, type CheckinRequiredPayload } from '@/lib/checkinDeadline';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';
import { UpcomingTripCard } from '@/components/UpcomingTripCard';
import { StatItem } from '@/components/StatItem';

const TAB_BAR_HEIGHT = 96;

export default function ShuttleHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const [online, setOnline] = useState(false);
  const [onlineInitialized, setOnlineInitialized] = useState(false);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fix 2: shuttle check-in state
  const [shuttleCheckinRequired, setShuttleCheckinRequired] = useState<{ tripId: string; deadlineMinutes: number } | null>(null);
  // Guards against double-navigating to /selfie when both the live
  // DRIVER_CHECKIN_REQUIRED event and the checkin-status poll fire for the same prompt.
  const checkinPromptedRef = useRef(false);

  const pulseScale = useRef(new Animated.Value(0.8)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  const { socket, connected: socketConnected } = useSocket();
  const { currency } = useServiceControl();

  const { activeLine, stops, currentStopIndex, allLines, routes, renewalBooking, myBookings, tripCancelledBanner, dismissTripCancelledBanner, bookingStatusBanner, dismissBookingStatusBanner, refetch } = useShuttle();

  // Broadcast GPS location every 5 s while the driver is online
  useLocationBroadcast({ enabled: online, tripId: activeLine?.tripId ?? null });

  const { data: driverRaw } = useQuery({ queryKey: ['driver'], queryFn: endpoints.driver.me });
  const { data: driverStatusRaw } = useQuery({
    queryKey: ['driver-status'],
    queryFn: endpoints.driver.status,
    staleTime: 0,
    retry: false,
  });
  const { data: notificationsRaw, refetch: refetchNotifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => endpoints.notifications.list() as Promise<{ id: string; read?: boolean; isRead?: boolean }[]>,
    staleTime: 30000,
  });
  // Cold-start / reconnect gate check — catches a periodic check-in the driver
  // missed while the app was closed or disconnected.
  const { data: checkinStatusRaw, refetch: refetchCheckinStatus } = useQuery({
    queryKey: ['driver-checkin-status'],
    queryFn: endpoints.driver.checkinStatus,
    retry: false,
  });
  const driverData = driverRaw as any;

  const { incomingReferralsCount, pendingReferrals } = useReferral();
  const queryClient = useQueryClient();

  useEffect(() => {
    const notifs = Array.isArray(notificationsRaw) ? notificationsRaw : [];
    const count = notifs.filter(n => !(n.read ?? n.isRead ?? false)).length;
    setUnreadCount(count);
  }, [notificationsRaw]);

  useFocusEffect(
    useCallback(() => {
      refetchNotifications();
      // Force-refresh bookings on focus so admin cancellations appear immediately.
      refetch();
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      // Returning to this screen (e.g. backed out of /selfie) — allow another prompt.
      checkinPromptedRef.current = false;
      refetchCheckinStatus();
    }, [refetchNotifications, refetch, queryClient, refetchCheckinStatus])
  );

  // Re-check the gate on reconnect too — covers a dropped connection that
  // missed the live DRIVER_CHECKIN_REQUIRED event while it was down.
  useEffect(() => {
    if (socketConnected) refetchCheckinStatus();
  }, [socketConnected, refetchCheckinStatus]);

  useEffect(() => {
    const status = checkinStatusRaw as { checkInRequired?: boolean; checkInDeadline?: string | null } | undefined;
    if (!status?.checkInRequired || checkinPromptedRef.current) return;
    checkinPromptedRef.current = true;
    router.push({
      pathname: '/selfie',
      params: { deadlineMinutes: String(computeDeadlineMinutes(status.checkInDeadline)) },
    });
  }, [checkinStatusRaw]);

  const currentStop = stops[currentStopIndex] ?? null;
  const nextStop = stops[currentStopIndex + 1] ?? null;
  const progress = stops.length > 0 ? currentStopIndex / stops.length : 0;

  const upcomingBookings = myBookings.filter(
    b => b.status === 'booked' || b.status === 'active' || b.status === 'pending_renewal'
  );

  // Fix 2: listen for shuttle:checkin:required — plus the periodic ("long_shift")
  // driver check-in, which shuttle drivers need too if they stay online 10+ hours
  // between trips.
  useEffect(() => {
    if (!socket) return;

    const handleShuttleCheckinRequired = (data: { tripId: string; deadlineMinutes: number }) => {
      setShuttleCheckinRequired({ tripId: data.tripId, deadlineMinutes: data.deadlineMinutes ?? 10 });
      router.push({
        pathname: '/selfie',
        params: { tripId: data.tripId, deadlineMinutes: String(data.deadlineMinutes ?? 10) },
      });
    };

    const handleDriverCheckinRequired = (data?: CheckinRequiredPayload) => {
      if (checkinPromptedRef.current) return;
      checkinPromptedRef.current = true;
      router.push({
        pathname: '/selfie',
        params: { deadlineMinutes: String(computeDeadlineMinutes(data?.deadline)) },
      });
    };

    const handleNotificationNew = () => {
      setUnreadCount(prev => prev + 1);
    };

    socket.on(SOCKET_EVENTS.SHUTTLE_CHECKIN_REQUIRED, handleShuttleCheckinRequired);
    socket.on(SOCKET_EVENTS.DRIVER_CHECKIN_REQUIRED, handleDriverCheckinRequired);
    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotificationNew);
    return () => {
      socket.off(SOCKET_EVENTS.SHUTTLE_CHECKIN_REQUIRED, handleShuttleCheckinRequired);
      socket.off(SOCKET_EVENTS.DRIVER_CHECKIN_REQUIRED, handleDriverCheckinRequired);
      socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotificationNew);
    };
  }, [socket]);

  // Renewal countdown
  const [renewalCountdown, setRenewalCountdown] = useState('');
  useEffect(() => {
    if (!renewalBooking?.renewalDeadline) { setRenewalCountdown(''); return; }
    const tick = () => {
      const ms = new Date(renewalBooking.renewalDeadline!).getTime() - Date.now();
      if (ms <= 0) { setRenewalCountdown(''); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setRenewalCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [renewalBooking?.renewalDeadline]);

  const renewalMutation = useMutation({
    mutationFn: (id: string) => endpoints.shuttle.confirmRenewal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      Alert.alert(t.renewal_confirmed_title, t.renewal_confirmed_msg, [{ text: t.ok }]);
    },
    onError: () => {
      Alert.alert(t.renewal_failed_title, t.renewal_failed_error, [{ text: t.ok }]);
    },
  });

  const { data: summaryRaw } = useQuery({
    queryKey: ['earnings-summary'],
    queryFn: endpoints.earnings.summary,
  });
  const summaryData = summaryRaw as { summary?: { totalEarnings?: string | number } } | undefined;
  const todayEarnings = parseFloat(String(summaryData?.summary?.totalEarnings ?? 0)).toFixed(0);
  const completedCount = allLines.filter(l => l.status === 'completed').length;

  useEffect(() => {
    if (onlineInitialized || driverStatusRaw === undefined) return;
    const status = driverStatusRaw as { isOnline?: boolean; online?: boolean; status?: string } | null;
    const serverFlag = status?.isOnline ?? status?.online;
    const isOnline = serverFlag !== undefined ? Boolean(serverFlag) : status?.status === 'online';
    setOnline(Boolean(isOnline));
    setOnlineInitialized(true);
  }, [driverStatusRaw, onlineInitialized]);

  useEffect(() => {
    Animated.spring(cardAnim, { toValue: 1, stiffness: 200, damping: 20, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (!online) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 2.2, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
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

  // Fix 2: handle navigation to active trip — block if check-in is still pending
  const handleNavigateToActiveTrip = () => {
    if (shuttleCheckinRequired) {
      Alert.alert(
        t.checkin_required_title,
        t.checkin_required_body,
        [
          {
            text: t.checkin_now,
            onPress: () =>
              router.push({
                pathname: '/selfie',
                params: {
                  tripId: shuttleCheckinRequired.tripId,
                  deadlineMinutes: String(shuttleCheckinRequired.deadlineMinutes),
                },
              }),
          },
          { text: t.later, style: 'cancel' },
        ]
      );
      return;
    }
    router.push('/shuttle/trip-active');
  };

  const toggleOnline = async () => {
    if (onlineLoading) return;
    setOnlineLoading(true);
    const next = !online;
    try {
      if (next) {
        await endpoints.driver.goOnline();
      } else {
        await endpoints.driver.goOffline();
      }
      setOnline(next);
    } catch {
      // API failed — keep current state so UI stays in sync with backend
      Alert.alert(t.error, 'Failed to update status. Please try again.');
    } finally {
      setOnlineLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: TAB_BAR_HEIGHT + 24, paddingHorizontal: Spacing.lg }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {/* Header */}
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
                {unreadCount > 0 && (
                  <View style={[styles.notifDot, { backgroundColor: colors.destructive }]}>
                    <Text style={styles.notifDotText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
                  </View>
                )}
              </GlassView>
            </Pressable>
            <GlassView style={[styles.serviceChip, { borderColor: '#1e1e2833' }]} borderRadius={20}>
              <View style={[styles.serviceChipDot, { backgroundColor: '#1e1e28' }]} />
              <Text style={[styles.serviceChipText, { color: '#1e1e28', fontFamily: 'Inter_700Bold' }]}>SHUTTLE</Text>
            </GlassView>
          </View>
        </View>

        {/* Online toggle row — shown only when driver is online */}
        {online && (
          <View style={styles.onlineRow}>
            <View style={styles.pulseWrap}>
              <Animated.View style={[styles.pulseRing, {
                backgroundColor: '#1e1e2840',
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              }]} />
              <Pressable
                onPress={toggleOnline}
                disabled={onlineLoading}
                style={({ pressed }) => [styles.onlineBtn, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
              >
                <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.onlineBtnGrad}>
                  <Wifi size={20} color="#fff" strokeWidth={2} />
                </LinearGradient>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.onlineStatus, { color: '#2d2d42', fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                {`${t.online_status} — ${t.shuttle_service}`}
              </Text>
              <Text style={[styles.onlineSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                {t.live}
              </Text>
            </View>
          </View>
        )}

        {/* Fix 2: check-in pending banner */}
        {!!shuttleCheckinRequired && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/selfie',
                params: {
                  tripId: shuttleCheckinRequired.tripId,
                  deadlineMinutes: String(shuttleCheckinRequired.deadlineMinutes),
                },
              })
            }
            style={[styles.cancelBanner, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}
          >
            <AlertTriangle size={16} color="#D97706" strokeWidth={2} />
            <Text style={[styles.cancelBannerText, { color: '#92400E', fontFamily: 'Inter_600SemiBold', flex: 1 }]}>
              {t.checkin_required_banner}
            </Text>
          </Pressable>
        )}

        {/* Auto-cancelled trip banner */}
        {!!tripCancelledBanner && (
          <View style={[styles.cancelBanner, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
            <AlertTriangle size={16} color="#DC2626" strokeWidth={2} />
            <Text style={[styles.cancelBannerText, { color: '#DC2626', fontFamily: 'Inter_600SemiBold', flex: 1 }]}>
              {tripCancelledBanner}
            </Text>
            <Pressable onPress={dismissTripCancelledBanner} hitSlop={8}>
              <X size={16} color="#DC2626" strokeWidth={2} />
            </Pressable>
          </View>
        )}

        {/* Booking cancelled / reassigned banner (SHUTTLE_BOOKING_CANCELLED vs SHUTTLE_BOOKING_REASSIGNED) */}
        {!!bookingStatusBanner && (
          bookingStatusBanner.type === 'cancelled' ? (
            <View style={[styles.cancelBanner, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
              <AlertTriangle size={16} color="#DC2626" strokeWidth={2} />
              <Text style={[styles.cancelBannerText, { color: '#DC2626', fontFamily: 'Inter_600SemiBold', flex: 1 }]}>
                {bookingStatusBanner.message}
              </Text>
              <Pressable onPress={dismissBookingStatusBanner} hitSlop={8}>
                <X size={16} color="#DC2626" strokeWidth={2} />
              </Pressable>
            </View>
          ) : (
            <View style={[styles.cancelBanner, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' }]}>
              <RefreshCw size={16} color="#2563EB" strokeWidth={2} />
              <Text style={[styles.cancelBannerText, { color: '#1D4ED8', fontFamily: 'Inter_600SemiBold', flex: 1 }]}>
                {bookingStatusBanner.message}
              </Text>
              <Pressable onPress={dismissBookingStatusBanner} hitSlop={8}>
                <X size={16} color="#2563EB" strokeWidth={2} />
              </Pressable>
            </View>
          )
        )}

        {/* Renewal banner */}
        {renewalBooking && renewalCountdown.length > 0 && (
          <GlassView style={[styles.renewalCard, { borderColor: '#F59E0B55', borderWidth: 1 }]} borderRadius={16}>
            <View style={[styles.renewalIconWrap, { backgroundColor: '#F59E0B20' }]}>
              <AlertTriangle size={18} color="#D97706" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.renewalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {t.renew_weekly_slot}
              </Text>
              <Text style={[styles.renewalRoute, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
                {renewalBooking.routeName} · {renewalBooking.departureTime}
              </Text>
              <Text style={[styles.renewalCountdown, { color: '#D97706', fontFamily: 'Inter_700Bold' }]}>
                ⏱ {renewalCountdown} {t.remaining}
              </Text>
            </View>
            <Pressable
              onPress={() => renewalMutation.mutate(renewalBooking.id)}
              disabled={renewalMutation.isPending}
              style={[styles.renewalBtn, { backgroundColor: '#F59E0B' }]}
            >
              {renewalMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <RefreshCw size={14} color="#fff" strokeWidth={2} />
              )}
            </Pressable>
          </GlassView>
        )}

        {/* Stats row */}
        <GlassView strong style={styles.statsRow} borderRadius={20}>
          <StatItem label={t.trips_stat} value={String(completedCount)} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatItem label={t.routes} value={String(routes.length)} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatItem label={t.net_earnings} value={`${todayEarnings} ${isRTL ? currency.symbolAr : currency.symbol}`} highlight colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatItem label={t.active} value={String(allLines.filter(l => l.status === 'in-progress').length)} colors={colors} />
        </GlassView>

        {/* Active trip card */}
        {activeLine && online && (
          <Animated.View style={[{ marginTop: Spacing.lg, opacity: cardAnim, transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <GlassView strong style={[styles.activeCard, { borderColor: '#1e1e2833' }]} borderRadius={24}>
              <View style={styles.activeCardHeader}>
                <View style={styles.livePill}>
                  <View style={[styles.liveDot, { backgroundColor: '#1e1e28' }]} />
                  <Text style={[styles.liveText, { color: '#1e1e28', fontFamily: 'Inter_700Bold' }]}>{t.live}</Text>
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
              <View style={styles.seatRow}>
                {activeLine.vehicleType !== 'Unknown' && (
                  <View style={[styles.vehicleBadge, { backgroundColor: '#1e1e2815', borderColor: '#1e1e2830' }]}>
                    <Text style={[styles.vehicleBadgeText, { color: '#2d2d42', fontFamily: 'Inter_700Bold' }]}>
                      {activeLine.vehicleType}
                    </Text>
                  </View>
                )}
                <View style={[styles.seatBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <Users size={12} color={colors.mutedForeground} strokeWidth={2} />
                  <Text style={[styles.seatBadgeText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    {activeLine.bookedSeats} {t.home_of} {activeLine.totalSeats}
                  </Text>
                </View>
              </View>

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
                    <Text style={[styles.stopBoxMeta, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{currentStop ? `${currentStop.boarded}/${currentStop.expected} ${t.home_boarded}` : '—'}</Text>
                  </View>
                </View>
                <View style={[styles.stopArrow, { backgroundColor: colors.secondary }]}>
                  <ArrowRight size={14} color={colors.mutedForeground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
                </View>
                <View style={styles.stopBox}>
                  <View style={[styles.stopDotNext, { borderColor: '#1e1e28' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stopBoxLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.next_departure.toUpperCase()}</Text>
                    <Text style={[styles.stopBoxName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{nextStop?.name ?? '—'}</Text>
                    <Text style={[styles.stopBoxMeta, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{nextStop ? `${t.home_eta} ${nextStop.eta}` : '—'}</Text>
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

              {/* Fix 2: use handleNavigateToActiveTrip to block if checkin pending */}
              <Pressable onPress={handleNavigateToActiveTrip} style={styles.continueBtn}>
                <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.continueBtnGrad}>
                  <Navigation size={16} color="#fff" strokeWidth={2} />
                  <Text style={[styles.continueBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.full_route}</Text>
                </LinearGradient>
              </Pressable>
            </GlassView>
          </Animated.View>
        )}

        {/* Incoming Referral Banner — shown when a colleague has sent a trip-referral request */}
        {incomingReferralsCount > 0 && (() => {
          const first = pendingReferrals[0];
          return (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/shuttle/referral-incoming' as any,
                  params: {
                    referralId: first.referralId,
                    bookingId: first.bookingId,
                    routeName: first.routeName,
                    routeNameAr: first.routeNameAr ?? '',
                    departureTime: first.departureTime,
                    fromStation: first.fromStation,
                    toStation: first.toStation,
                    fromStationAr: first.fromStationAr ?? '',
                    toStationAr: first.toStationAr ?? '',
                    passengerCount: first.passengerCount ?? '',
                    totalSeats: first.totalSeats ?? '',
                    lineNumber: first.lineNumber ?? '',
                    vehicleType: first.vehicleType ?? '',
                    weekStart: first.weekStart ?? '',
                  },
                })
              }
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, marginTop: Spacing.md }]}
            >
              <GlassView style={[styles.referralBanner, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]} borderRadius={16}>
                <View style={[styles.referralBannerPulse, { backgroundColor: '#F97316' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: Typography.size.sm, color: '#92400E', fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                    {incomingReferralsCount === 1 ? t.referral_incoming_title : `${incomingReferralsCount} ${t.referral_incoming_title}`}
                  </Text>
                  <Text style={[{ fontSize: Typography.size.xs, color: '#B45309', fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: TA }]}>
                    {t.referral_incoming_sub}
                  </Text>
                </View>
                <View style={[styles.referralBannerBadge, { backgroundColor: '#F97316' }]}>
                  <Text style={[styles.referralBannerBadgeText, { fontFamily: 'Inter_700Bold' }]}>
                    {incomingReferralsCount > 9 ? '9+' : String(incomingReferralsCount)}
                  </Text>
                </View>
                <ChevronRight size={16} color="#92400E" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
              </GlassView>
            </Pressable>
          );
        })()}

        {/* Upcoming Trips section */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA, marginTop: Spacing.xl }]}>
          {t.upcoming_trips}
        </Text>

        {upcomingBookings.length === 0 ? (
          <GlassView style={[styles.upcomingEmpty, { borderColor: colors.border }]} borderRadius={16}>
            <Calendar size={20} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.upcomingEmptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {t.no_upcoming_trips}
            </Text>
          </GlassView>
        ) : (
          <View style={{ gap: 10 }}>
            {upcomingBookings.map(booking => {
              // A routeId can now back more than one line (outbound + return
              // trip on the same route) — disambiguate by direction/departure
              // time instead of assuming a 1:1 routeId match.
              const line = findLineForRoute(allLines, booking.routeId, {
                direction: booking.direction,
                departureTime: booking.departureTime,
              });
              return (
                <UpcomingTripCard
                  key={booking.id}
                  booking={booking}
                  line={line}
                  colors={colors}
                  isRTL={isRTL}
                  onPress={() =>
                    router.push({
                      pathname: '/shuttle/trip-details' as any,
                      params: {
                        bookingId: String(booking.id),
                        routeId: String(booking.routeId),
                        // Pass full booking snapshot so trip-details can render
                        // even when ShuttleProvider is not in scope for that route group.
                        routeName: booking.routeName,
                        routeNameAr: booking.routeNameAr ?? '',
                        departureTime: booking.departureTime,
                        weekStart: booking.weekStart,
                        weekEnd: booking.weekEnd ?? '',
                        status: booking.status,
                        direction: booking.direction ?? '',
                      },
                    })
                  }
                />
              );
            })}
          </View>
        )}

        {/* No active booking — only shown when there are no upcoming or active trips */}
        {upcomingBookings.length === 0 && !activeLine && (
          <GlassView style={[styles.noLineCard, { marginTop: Spacing.lg }]} borderRadius={20}>
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

      {/* Floating offline button — centered above tab bar, shown only when offline */}
      {!online && (
        <View style={[styles.floatingOfflineWrap, { bottom: TAB_BAR_HEIGHT + 20 }]} pointerEvents="box-none">
          <View style={styles.floatingPulseWrap}>
            <Pressable
              onPress={toggleOnline}
              disabled={onlineLoading}
              style={({ pressed }) => [styles.floatingOfflineBtn, { backgroundColor: colors.secondary, borderColor: colors.border, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
            >
              {onlineLoading ? (
                <ActivityIndicator color={colors.mutedForeground} />
              ) : (
                <WifiOff size={28} color={colors.mutedForeground} strokeWidth={2} />
              )}
            </Pressable>
          </View>
          <Text style={[styles.floatingOfflineLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            {t.youre_offline}
          </Text>
          <Text style={[styles.floatingOfflineSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {t.go}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: Spacing.sm },
  greeting: { fontSize: Typography.size.xs },
  driverName: { fontSize: Typography.size.xl, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconBtn: {},
  iconBtnGlass: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  notifDotText: { fontSize: 7, color: '#fff', fontFamily: 'Inter_700Bold' },
  serviceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1 },
  serviceChipDot: { width: 6, height: 6, borderRadius: 3 },
  serviceChipText: { fontSize: 10, letterSpacing: 1.5 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: 20 },
  pulseWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 56, height: 56, borderRadius: 28 },
  onlineBtn: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', elevation: Shadows.large.elevation, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 16 },
  onlineBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  onlineBtnOff: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  onlineStatus: { fontSize: Typography.size.sm },
  onlineSub: { fontSize: Typography.size.xs, marginTop: 2 },
  cancelBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginTop: Spacing.md },
  cancelBannerText: { fontSize: 13 },
  renewalCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: 14, marginTop: Spacing.lg },
  renewalIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  renewalTitle: { fontSize: 13 },
  renewalRoute: { fontSize: 11, marginTop: 2 },
  renewalCountdown: { fontSize: 11, marginTop: 3 },
  renewalBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, marginTop: Spacing.lg },
  divider: { width: 1, height: 28 },
  sectionTitle: { fontSize: Typography.size.md },
  activeCard: { padding: 20 },
  activeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: Spacing.xs, backgroundColor: '#1e1e2815', borderRadius: 99, borderWidth: 1, borderColor: '#1e1e2830' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 10, letterSpacing: 2 },
  lineNumber: { fontSize: Typography.size.xs },
  activeLineName: { fontSize: Typography.size.lg },
  activeLineRoute: { fontSize: 13, marginTop: Spacing.xs },
  seatRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, flexWrap: 'wrap' },
  vehicleBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: Spacing.xs, borderRadius: Radius.sm, borderWidth: 1 },
  vehicleBadgeText: { fontSize: 11, letterSpacing: 0.5 },
  seatBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: Spacing.xs, borderRadius: Radius.sm, borderWidth: 1 },
  seatBadgeText: { fontSize: Typography.size.xs },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: Spacing.lg },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressPct: { fontSize: 13, minWidth: 32, textAlign: 'right' },
  stopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.lg },
  stopBox: { flex: 1, flexDirection: 'row', gap: Spacing.sm },
  stopDotCurrent: { width: 10, height: 10, borderRadius: 5, marginTop: Spacing.xs },
  stopDotNext: { width: 10, height: 10, borderRadius: 5, marginTop: Spacing.xs, borderWidth: 2, backgroundColor: 'transparent' },
  stopBoxLabel: { fontSize: 9, letterSpacing: 1 },
  stopBoxName: { fontSize: 13, marginTop: 2 },
  stopBoxMeta: { fontSize: 11, marginTop: 2 },
  stopArrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.lg, flexWrap: 'wrap' },
  dotItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotLine: { width: 16, height: 2, marginHorizontal: 2 },
  continueBtn: { marginTop: Spacing.lg, borderRadius: 14, overflow: 'hidden' },
  continueBtnGrad: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  continueBtnText: { color: '#fff', fontSize: Typography.size.sm },
  upcomingEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.lg, borderWidth: 1, marginTop: Spacing.sm },
  upcomingEmptyText: { fontSize: 13 },
  referralBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1.5 },
  referralBannerPulse: { width: 8, height: 8, borderRadius: 4 },
  referralBannerBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xs },
  referralBannerBadgeText: { fontSize: 11, color: '#fff' },
  floatingOfflineWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6, paddingBottom: Spacing.sm },
  floatingPulseWrap: { alignItems: 'center', justifyContent: 'center' },
  floatingOfflineBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 2, elevation: Shadows.large.elevation, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
  floatingOfflineLabel: { fontSize: Typography.size.sm },
  floatingOfflineSub: { fontSize: Typography.size.xs },
  noLineCard: { alignItems: 'center', padding: 28, gap: 10 },
  noLineTitle: { fontSize: Typography.size.md, marginTop: Spacing.xs },
  noLineSub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  goToLinesBtn: { marginTop: Spacing.sm, borderRadius: 14, overflow: 'hidden', width: '100%' },
  goToLinesBtnGrad: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  goToLinesBtnText: { color: '#fff', fontSize: Typography.size.sm },
});
