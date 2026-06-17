import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { AlertTriangle, ArrowRight, Bell, Calendar, ChevronRight, Clock, GitBranch, Navigation, RefreshCw, Users, Wifi, WifiOff, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { useShuttle, type ShuttleBooking, type ShuttleLine } from '@/lib/shuttleContext';
import { useReferral } from '@/lib/referralContext';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';

const TAB_BAR_HEIGHT = 96;

export default function ShuttleHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const [online, setOnline] = useState(false);
  const [onlineInitialized, setOnlineInitialized] = useState(false);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fix 2: shuttle check-in state
  const [shuttleCheckinRequired, setShuttleCheckinRequired] = useState<{ tripId: string; deadlineMinutes: number } | null>(null);

  const pulseScale = useRef(new Animated.Value(0.8)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  // Fix 1: location broadcast interval ref
  const locationBroadcastRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { socket } = useSocket();

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
  const driverData = driverRaw as any;

  const { activeLine, stops, currentStopIndex, allLines, renewalBooking, myBookings, tripCancelledBanner, dismissTripCancelledBanner, refetch } = useShuttle();
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
      // Hard-refetch bookings every time screen gains focus so cancellations
      // from the admin dashboard appear immediately without waiting for the poll.
      refetch();
      queryClient.resetQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
    }, [refetchNotifications, refetch, queryClient])
  );
  const currentStop = stops[currentStopIndex] ?? null;
  const nextStop = stops[currentStopIndex + 1] ?? null;
  const progress = stops.length > 0 ? currentStopIndex / stops.length : 0;

  const upcomingBookings = myBookings.filter(
    b => b.status === 'booked' || b.status === 'active' || b.status === 'pending_renewal'
  );

  // Fix 1: check if any booking departs within 20 minutes (HH:MM comparison)
  const isShuttleAboutToDepart = useCallback(() => {
    return upcomingBookings.some(b => {
      const match = b.departureTime.match(/(\d{1,2}):(\d{2})/);
      if (!match) return false;
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const deptMins = h * 60 + m;
      return deptMins >= nowMins && deptMins - nowMins <= 20;
    });
  }, [upcomingBookings]);

  // Fix 1: start/stop shuttle location broadcasting via socket
  const startShuttleBroadcast = useCallback(async () => {
    if (locationBroadcastRef.current) return;
    if (Platform.OS === 'web') return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const emit = async () => {
      if (!socket) return;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const tripId = activeLine?.tripId;
        socket.emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE, {
          tripId,
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          heading: loc.coords.heading ?? 0,
        });
      } catch {
        // best-effort
      }
    };

    emit();
    locationBroadcastRef.current = setInterval(emit, 3000);
  }, [socket, activeLine?.tripId]);

  const stopShuttleBroadcast = useCallback(() => {
    if (locationBroadcastRef.current) {
      clearInterval(locationBroadcastRef.current);
      locationBroadcastRef.current = null;
    }
  }, []);

  // Fix 1: start broadcasting when online + shuttle trip is active or about to depart
  useEffect(() => {
    const shouldBroadcast = online && (!!activeLine || isShuttleAboutToDepart());
    if (shouldBroadcast) {
      startShuttleBroadcast();
    } else {
      stopShuttleBroadcast();
    }
    return () => {
      // Stop when active line becomes completed/cancelled
      if (activeLine?.status === 'completed') {
        stopShuttleBroadcast();
      }
    };
  }, [online, activeLine, isShuttleAboutToDepart, startShuttleBroadcast, stopShuttleBroadcast]);

  // Clean up on unmount
  useEffect(() => () => stopShuttleBroadcast(), []);

  // Fix 2: listen for shuttle:checkin:required
  useEffect(() => {
    if (!socket) return;

    const handleShuttleCheckinRequired = (data: { tripId: string; deadlineMinutes: number }) => {
      setShuttleCheckinRequired({ tripId: data.tripId, deadlineMinutes: data.deadlineMinutes ?? 10 });
      router.push({
        pathname: '/selfie',
        params: { tripId: data.tripId, deadlineMinutes: String(data.deadlineMinutes ?? 10) },
      });
    };

    const handleNotificationNew = () => {
      setUnreadCount(prev => prev + 1);
    };

    socket.on(SOCKET_EVENTS.SHUTTLE_CHECKIN_REQUIRED, handleShuttleCheckinRequired);
    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotificationNew);
    return () => {
      socket.off(SOCKET_EVENTS.SHUTTLE_CHECKIN_REQUIRED, handleShuttleCheckinRequired);
      socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotificationNew);
    };
  }, [socket]);

  // Renewal countdown
  const [renewalCountdown, setRenewalCountdown] = useState('');
  useEffect(() => {
    if (!renewalBooking?.renewalDeadline) { setRenewalCountdown(''); return; }
    const tick = () => {
      const ms = new Date(renewalBooking.renewalDeadline!).getTime() - Date.now();
      if (ms <= 0) { setRenewalCountdown('Expired'); return; }
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
      Alert.alert('✅ Renewal Confirmed', 'Your slot is reserved for next week!', [{ text: 'OK' }]);
    },
    onError: () => {
      Alert.alert('Renewal Failed', 'Could not confirm renewal. Please try again.', [{ text: 'OK' }]);
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
        stopShuttleBroadcast();
      }
    } catch {
      // best-effort
    } finally {
      setOnline(next);
      setOnlineLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: TAB_BAR_HEIGHT + 24, paddingHorizontal: 16 }}
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

        {/* Renewal banner */}
        {renewalBooking && renewalCountdown !== 'Expired' && (
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
          <StatItem label={t.routes} value={String(allLines.length)} colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {/* TODO: Backend Integration - Currency symbol (جنيه / EGP) should come from tenant config */}
          <StatItem label={t.net_earnings} value={`${todayEarnings} ${t.egp}`} highlight colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatItem label={t.active} value={String(allLines.filter(l => l.status === 'in-progress').length)} colors={colors} />
        </GlassView>

        {/* Active trip card */}
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
                    {activeLine.bookedSeats} of {activeLine.totalSeats}
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
                    <Text style={[styles.stopBoxMeta, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{currentStop ? `${currentStop.boarded}/${currentStop.expected} boarded` : '—'}</Text>
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
        {/* TODO: Backend Integration - Connect to production Socket.io server and bind real event listeners */}
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
                    departureTime: first.departureTime,
                    fromStation: first.fromStation,
                    toStation: first.toStation,
                    passengerCount: first.passengerCount ?? '',
                    totalSeats: first.totalSeats ?? '',
                    lineNumber: first.lineNumber ?? '',
                    vehicleType: first.vehicleType ?? '',
                    weekStart: first.weekStart ?? '',
                  },
                })
              }
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, marginTop: 12 }]}
            >
              <GlassView style={[styles.referralBanner, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]} borderRadius={16}>
                <View style={[styles.referralBannerPulse, { backgroundColor: '#F97316' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 14, color: '#92400E', fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                    {incomingReferralsCount === 1 ? t.referral_incoming_title : `${incomingReferralsCount} ${t.referral_incoming_title}`}
                  </Text>
                  <Text style={[{ fontSize: 12, color: '#B45309', fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: TA }]}>
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
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA, marginTop: 24 }]}>
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
              const line = allLines.find(l => String(l.id) === String(booking.routeId));
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
                        departureTime: booking.departureTime,
                        weekStart: booking.weekStart,
                        weekEnd: booking.weekEnd ?? '',
                        status: booking.status,
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

function UpcomingTripCard({
  booking,
  line,
  colors,
  isRTL,
  onPress,
}: {
  booking: ShuttleBooking;
  line?: ShuttleLine;
  colors: ReturnType<typeof useColors>;
  isRTL: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
    >
      <GlassView style={[styles.upcomingCard, { alignItems: 'flex-start' }]} borderRadius={16}>
        <View style={[styles.upcomingAccent, { backgroundColor: '#1e1e28', alignSelf: 'stretch', height: undefined }]} />
        <View style={{ flex: 1, gap: 6 }}>
          {/* Route name — TODO: Use translated backend fields (routeNameAr, fromAr, toAr) here */}
          <Text style={[styles.upcomingRouteName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]} numberOfLines={1}>
            {booking.routeName}
          </Text>
          {/* From → To */}
          {line && (
            <Text style={[{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={1}>
              {/* TODO: Use translated backend fields (routeNameAr, fromAr, toAr) here */}
              {line.from} → {line.to}
            </Text>
          )}
          {/* Date & Exact Time */}
          <View style={[styles.upcomingMeta, { flexDirection: R }]}>
            <Calendar size={12} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.upcomingMetaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {/* TODO: Backend Integration - Use trip.date (exact trip date) not just weekStart */}
              {booking.weekStart}
            </Text>
            <Text style={[styles.upcomingMetaDot, { color: colors.border }]}>·</Text>
            <Clock size={12} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.upcomingMetaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {booking.departureTime}
            </Text>
          </View>
          {/* Vehicle / Line info + Passenger Count */}
          <View style={[{ flexDirection: R, gap: 6, flexWrap: 'wrap', marginTop: 2 }]}>
            {line && line.vehicleType !== 'Unknown' && (
              <View style={[styles.vehicleBadge, { backgroundColor: '#1e1e2810', borderColor: '#1e1e2820' }]}>
                <Text style={[styles.vehicleBadgeText, { color: '#2d2d42', fontFamily: 'Inter_600SemiBold' }]}>
                  {/* TODO: Backend Integration - Use vehicle model + plate number from trip data */}
                  {line.vehicleType} · {line.lineNumber}
                </Text>
              </View>
            )}
            {line && (
              <View style={[styles.seatBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Users size={11} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[styles.seatBadgeText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  {/* TODO: Backend Integration - Fetch real-time booked/total passenger count for this trip */}
                  {t.passengers_label_count}: {line.bookedSeats} / {line.totalSeats}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', paddingTop: 2, gap: 6 }}>
          {booking.trip && !booking.trip.thresholdMet ? (
            <View style={[styles.upcomingStatusBadge, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
              <Text style={[styles.upcomingStatusText, { color: '#92400E', fontFamily: 'Inter_700Bold' }]}>
                {booking.trip.bookedSeats}/{booking.trip.minRequired} pax
              </Text>
            </View>
          ) : (
            <View style={[styles.upcomingStatusBadge, { backgroundColor: '#1e1e2812', borderColor: '#1e1e2825' }]}>
              <Text style={[styles.upcomingStatusText, { color: '#2d2d42', fontFamily: 'Inter_700Bold' }]}>
                {booking.status === 'active' ? t.active : t.status_booked}
              </Text>
            </View>
          )}
          <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </View>
      </GlassView>
    </Pressable>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 8 },
  greeting: { fontSize: 12 },
  driverName: { fontSize: 22, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {},
  iconBtnGlass: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  notifDotText: { fontSize: 7, color: '#fff', fontFamily: 'Inter_700Bold' },
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
  cancelBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  cancelBannerText: { fontSize: 13 },
  renewalCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 16 },
  renewalIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  renewalTitle: { fontSize: 13 },
  renewalRoute: { fontSize: 11, marginTop: 2 },
  renewalCountdown: { fontSize: 11, marginTop: 3 },
  renewalBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, marginTop: 16 },
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  statValue: { fontSize: 14, marginTop: 2 },
  divider: { width: 1, height: 28 },
  sectionTitle: { fontSize: 16 },
  activeCard: { padding: 20 },
  activeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#1e1e2815', borderRadius: 99, borderWidth: 1, borderColor: '#1e1e2830' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 10, letterSpacing: 2 },
  lineNumber: { fontSize: 12 },
  activeLineName: { fontSize: 18 },
  activeLineRoute: { fontSize: 13, marginTop: 4 },
  seatRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  vehicleBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  vehicleBadgeText: { fontSize: 11, letterSpacing: 0.5 },
  seatBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  seatBadgeText: { fontSize: 12 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressPct: { fontSize: 13, minWidth: 32, textAlign: 'right' },
  stopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16 },
  stopBox: { flex: 1, flexDirection: 'row', gap: 8 },
  stopDotCurrent: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  stopDotNext: { width: 10, height: 10, borderRadius: 5, marginTop: 4, borderWidth: 2, backgroundColor: 'transparent' },
  stopBoxLabel: { fontSize: 9, letterSpacing: 1 },
  stopBoxName: { fontSize: 13, marginTop: 2 },
  stopBoxMeta: { fontSize: 11, marginTop: 2 },
  stopArrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, flexWrap: 'wrap' },
  dotItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotLine: { width: 16, height: 2, marginHorizontal: 2 },
  continueBtn: { marginTop: 16, borderRadius: 14, overflow: 'hidden' },
  continueBtnGrad: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  continueBtnText: { color: '#fff', fontSize: 14 },
  upcomingEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderWidth: 1, marginTop: 8 },
  upcomingEmptyText: { fontSize: 13 },
  upcomingCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, overflow: 'hidden' },
  upcomingAccent: { width: 4, height: 36, borderRadius: 2 },
  upcomingRouteName: { fontSize: 14 },
  upcomingMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  upcomingMetaText: { fontSize: 12 },
  upcomingMetaDot: { fontSize: 14 },
  upcomingStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  upcomingStatusText: { fontSize: 11, letterSpacing: 0.5 },
  referralBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1.5 },
  referralBannerPulse: { width: 8, height: 8, borderRadius: 4 },
  referralBannerBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  referralBannerBadgeText: { fontSize: 11, color: '#fff' },
  floatingOfflineWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6, paddingBottom: 8 },
  floatingPulseWrap: { alignItems: 'center', justifyContent: 'center' },
  floatingOfflineBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 2, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
  floatingOfflineLabel: { fontSize: 14 },
  floatingOfflineSub: { fontSize: 12 },
  noLineCard: { alignItems: 'center', padding: 28, gap: 10 },
  noLineTitle: { fontSize: 16, marginTop: 4 },
  noLineSub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  goToLinesBtn: { marginTop: 8, borderRadius: 14, overflow: 'hidden', width: '100%' },
  goToLinesBtnGrad: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  goToLinesBtnText: { color: '#fff', fontSize: 14 },
});
