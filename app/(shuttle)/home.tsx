import { showAlert } from '@/lib/alert';
import { router } from 'expo-router';
import { AlertTriangle, ArrowRight, Bell, Calendar, ChevronRight, Clock, GitBranch, Navigation, RefreshCw, Users, Wifi, WifiOff, X } from 'lucide-react-native';
import { useLocationBroadcast } from '@/hooks/useLocationBroadcast';
import { setActiveShuttleTripId } from '@/lib/backgroundLocationTask';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { useShuttle } from '@/lib/shuttleContext';
import { useReferral } from '@/lib/referralContext';
import { useSocket } from '@/lib/socketContext';
import { useServiceControl } from '@/lib/serviceControlContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { computeDeadlineMinutes, type CheckinRequiredPayload } from '@/lib/checkinDeadline';
import { Spacing } from '@/constants/spacing';
import { TAB_BAR_HEIGHT_BASE } from '@/constants/tabBar';
import { UpcomingTripCard } from '@/components/UpcomingTripCard';
import { useActiveSession } from '@/lib/activeSessionContext';
import { useSplitColors, type SplitColors } from '@/lib/splitTheme';

const C_MINT = '#3DDC97';
const C_AMBER = '#F5A623';
const C_RED = '#D92D20';
const C_TRACK = '#F0F2F3';
const C_TILE = '#F6F7F8';

export default function ShuttleHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const tabBarHeight = TAB_BAR_HEIGHT_BASE + insets.bottom;
  const { t, isRTL } = useI18n();
  const S = useSplitColors();
  const styles = useMemo(() => makeStyles(S), [S]);
  const TA = isRTL ? 'right' as const : 'left' as const;
  const [online, setOnline] = useState(false);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fix 2: shuttle check-in state
  const [shuttleCheckinRequired, setShuttleCheckinRequired] = useState<{ tripId: string; deadlineMinutes: number } | null>(null);
  // Guards against double-navigating to /selfie when both the live
  // DRIVER_CHECKIN_REQUIRED event and the checkin-status poll fire for the same prompt.
  const checkinPromptedRef = useRef(false);

  const cardAnim = useRef(new Animated.Value(0)).current;

  const { socket, connected: socketConnected } = useSocket();
  const { currency } = useServiceControl();

  const { activeLine, stops, currentStopIndex, allLines, routes, renewalBooking, myBookings, tripCancelledBanner, dismissTripCancelledBanner, bookingStatusBanner, dismissBookingStatusBanner, refetch, error: shuttleError } = useShuttle();

  // Broadcast GPS location every 5 s while the driver is online
  useLocationBroadcast({ enabled: online, tripId: activeLine?.tripId ?? null });

  // D6-1/D8-1: this screen (not just trip-active.tsx) can broadcast a real
  // trip's location whenever activeLine is set (e.g. driver briefly back on
  // the home tab mid-trip), so the background task needs to know about it
  // here too — mirrors the same registration in app/shuttle/trip-active.tsx.
  useEffect(() => {
    setActiveShuttleTripId(online && activeLine?.tripId ? Number(activeLine.tripId) : null);
    return () => setActiveShuttleTripId(null);
  }, [online, activeLine?.tripId]);

  const { data: driverRaw } = useQuery({ queryKey: ['driver'], queryFn: endpoints.driver.me });
  const { data: driverStatusRaw, refetch: refetchDriverStatus } = useQuery({
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

  // ActiveSession: navigate to the active shuttle trip on cold-start recovery.
  // Waits for initialized before acting so a null session is not mistaken
  // for "no active session" during the initial fetch.
  const { session: activeSession, initialized: activeSessionInitialized } = useActiveSession();
  // Guard: redirect only once per mount so repeated session:snapshot updates
  // while on this screen do not cause a redirect loop.
  const hasRedirectedRef = useRef(false);
  useEffect(() => {
    if (!activeSessionInitialized) return;
    if (activeSession?.sessionType === 'shuttle_trip') {
      if (hasRedirectedRef.current) return;
      hasRedirectedRef.current = true;
      router.replace('/shuttle/trip-active');
    } else {
      // Reset so a future trip session can trigger recovery again.
      hasRedirectedRef.current = false;
    }
  }, [activeSessionInitialized, activeSession]);

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

      // Reconcile local `online` state against the server on every visit —
      // not just once at cold start. The old one-shot sync (gated by
      // onlineInitialized) applied whatever `driver-status` held on its
      // first resolution — including a stale cached value on a remount —
      // then never re-synced again, so returning here after a completed
      // shuttle trip could get stuck showing the pre-trip online state.
      refetchDriverStatus().then((result) => {
        const status = result.data as { isOnline?: boolean; online?: boolean; status?: string } | undefined;
        if (!status) return;
        const serverFlag = status.isOnline ?? status.online;
        const isOnline = serverFlag !== undefined ? Boolean(serverFlag) : status.status === 'online';
        setOnline(Boolean(isOnline));
      }).catch(() => {});
    }, [refetchNotifications, refetch, queryClient, refetchCheckinStatus, refetchDriverStatus])
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

  // One card per actual trip, not per weekly booking — each day within a
  // booked week is an independent trip with its own passengers and status,
  // and a trip that got auto-cancelled or expired must stop showing here
  // even while the rest of the week's booking stays active.
  const upcomingLines = allLines
    .filter(l => l.tripId && l.status === 'upcoming')
    .sort((a, b) => new Date(a.departureIso ?? 0).getTime() - new Date(b.departureIso ?? 0).getTime());

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
      showAlert(t.renewal_confirmed_title, t.renewal_confirmed_msg, [{ text: t.ok }]);
    },
    onError: () => {
      showAlert(t.renewal_failed_title, t.renewal_failed_error, [{ text: t.ok }]);
    },
  });

  const { data: summaryRaw } = useQuery({
    queryKey: ['earnings-summary'],
    queryFn: () => endpoints.earnings.summary(),
  });
  const summaryData = summaryRaw as { summary?: { driverShare?: string | number } } | undefined;
  // driverShare (financial_snapshots-derived), NOT totalEarnings — that field
  // sums driver_wallet_ledger credits only, which deliberately excludes
  // cash-ride earnings (the driver already holds that cash), so it
  // under-reports for anyone who takes cash-paid shuttle bookings.
  const todayEarnings = parseFloat(String(summaryData?.summary?.driverShare ?? 0)).toFixed(0);
  const completedCount = allLines.filter(l => l.status === 'completed').length;

  useEffect(() => {
    Animated.spring(cardAnim, { toValue: 1, stiffness: 200, damping: 20, useNativeDriver: true }).start();
  }, []);

  // Fix 2: handle navigation to active trip — block if check-in is still pending
  const handleNavigateToActiveTrip = () => {
    if (shuttleCheckinRequired) {
      showAlert(
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
    } catch (err) {
      // API failed — keep current state so UI stays in sync with backend
      console.error('[StatusToggle] Failed to update driver status:', err);
      showAlert(t.error, 'Failed to update status. Please try again.');
    } finally {
      setOnlineLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: S.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {/* Dark hero — greeting + online toggle + stats, one persistent panel */}
        <View style={[styles.hero, { paddingTop: topPad + 14 }]}>
          <View style={styles.heroTop}>
            <View>
              <Text style={[styles.greeting, { color: S.capOnDark, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                {t.good_morning},
              </Text>
              <Text style={[styles.driverName, { fontFamily: 'Inter_800ExtraBold', textAlign: TA }]}>
                {(driverData?.name ?? '—').split(' ')[0]}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <Pressable style={styles.iconBtn} onPress={() => router.push('/messages')}>
                <Bell size={16} color="#fff" strokeWidth={2} />
                {unreadCount > 0 && (
                  <View style={[styles.notifDot, { backgroundColor: C_RED }]}>
                    <Text style={styles.notifDotText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
                  </View>
                )}
              </Pressable>
              <View style={styles.serviceChip}>
                <View style={[styles.serviceChipDot, { backgroundColor: C_MINT }]} />
                <Text style={[styles.serviceChipText, { fontFamily: 'Inter_800ExtraBold' }]}>{t.shuttle.toUpperCase()}</Text>
              </View>
            </View>
          </View>

          {/* Online toggle — visible and functional in both online/offline states */}
          <Pressable
            onPress={toggleOnline}
            disabled={onlineLoading}
            style={({ pressed }) => [styles.togglePill, { opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={[styles.toggleIconWrap, { backgroundColor: online ? C_MINT : 'rgba(255,255,255,.12)' }]}>
              {onlineLoading ? (
                <ActivityIndicator size="small" color={online ? S.ink : '#fff'} />
              ) : online ? (
                <Wifi size={17} color={S.ink} strokeWidth={2.2} />
              ) : (
                <WifiOff size={17} color="#fff" strokeWidth={2.2} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleTitle, { fontFamily: 'Inter_800ExtraBold', textAlign: TA }]}>
                {online ? t.youre_online.split('·')[0].trim() : t.youre_offline}
              </Text>
              <Text style={[styles.toggleSub, { color: S.capOnDark, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
                {online ? t.receiving_assignments : t.not_receiving_assignments}
              </Text>
            </View>
            <View style={[styles.switchTrack, { backgroundColor: online ? C_MINT : 'rgba(255,255,255,.14)' }]}>
              <View style={[styles.switchThumb, {
                backgroundColor: online ? S.ink : '#fff',
                alignSelf: online ? 'flex-end' : 'flex-start',
              }]} />
            </View>
          </Pressable>

          {/* Stats embedded directly in the hero */}
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCell}>
              <Text style={[styles.heroStatValue, { fontFamily: 'Inter_800ExtraBold' }]}>{completedCount}</Text>
              <Text style={[styles.heroStatCap, { fontFamily: 'Inter_700Bold' }]}>{t.trips_stat}</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStatCell}>
              <Text style={[styles.heroStatValue, { fontFamily: 'Inter_800ExtraBold' }]}>{routes.length}</Text>
              <Text style={[styles.heroStatCap, { fontFamily: 'Inter_700Bold' }]}>{t.routes}</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStatCell}>
              <Text style={[styles.heroStatValue, { color: C_MINT, fontFamily: 'Inter_800ExtraBold' }]}>
                {todayEarnings} {isRTL ? currency.symbolAr : currency.symbol}
              </Text>
              <Text style={[styles.heroStatCap, { fontFamily: 'Inter_700Bold' }]}>{t.net_earnings}</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStatCell}>
              <Text style={[styles.heroStatValue, { fontFamily: 'Inter_800ExtraBold' }]}>
                {allLines.filter(l => l.status === 'in-progress').length}
              </Text>
              <Text style={[styles.heroStatCap, { fontFamily: 'Inter_700Bold' }]}>{t.active}</Text>
            </View>
          </View>
        </View>

        {/* White body */}
        <View style={{ paddingHorizontal: Spacing.lg }}>
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
              style={[styles.banner, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}
            >
              <AlertTriangle size={16} color={C_AMBER} strokeWidth={2} />
              <Text style={[styles.bannerText, { color: '#92400E', fontFamily: 'Inter_600SemiBold', flex: 1 }]}>
                {t.checkin_required_banner}
              </Text>
            </Pressable>
          )}

          {/* Auto-cancelled trip banner */}
          {!!tripCancelledBanner && (
            <View style={[styles.banner, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
              <AlertTriangle size={16} color={C_RED} strokeWidth={2} />
              <Text style={[styles.bannerText, { color: '#B91C1C', fontFamily: 'Inter_600SemiBold', flex: 1 }]}>
                {tripCancelledBanner}
              </Text>
              <Pressable onPress={dismissTripCancelledBanner} hitSlop={8}>
                <X size={16} color={C_RED} strokeWidth={2} />
              </Pressable>
            </View>
          )}

          {/* Booking cancelled / reassigned banner (SHUTTLE_BOOKING_CANCELLED vs SHUTTLE_BOOKING_REASSIGNED) */}
          {!!bookingStatusBanner && (
            bookingStatusBanner.type === 'cancelled' ? (
              <View style={[styles.banner, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                <AlertTriangle size={16} color={C_RED} strokeWidth={2} />
                <Text style={[styles.bannerText, { color: '#B91C1C', fontFamily: 'Inter_600SemiBold', flex: 1 }]}>
                  {bookingStatusBanner.message}
                </Text>
                <Pressable onPress={dismissBookingStatusBanner} hitSlop={8}>
                  <X size={16} color={C_RED} strokeWidth={2} />
                </Pressable>
              </View>
            ) : (
              <View style={[styles.banner, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' }]}>
                <RefreshCw size={16} color="#2563EB" strokeWidth={2} />
                <Text style={[styles.bannerText, { color: '#1D4ED8', fontFamily: 'Inter_600SemiBold', flex: 1 }]}>
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
            <View style={[styles.renewalCard, { borderColor: '#F5A62355' }]}>
              <View style={[styles.renewalIconWrap, { backgroundColor: '#F5A62320' }]}>
                <AlertTriangle size={18} color={C_AMBER} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.renewalTitle, { color: S.ink, fontFamily: 'Inter_700Bold' }]}>
                  {t.renew_weekly_slot}
                </Text>
                <Text style={[styles.renewalRoute, { color: S.cap, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
                  {renewalBooking.routeName} · {renewalBooking.departureTime}
                </Text>
                <Text style={[styles.renewalCountdown, { color: C_AMBER, fontFamily: 'Inter_700Bold' }]}>
                  ⏱ {renewalCountdown} {t.remaining}
                </Text>
              </View>
              <Pressable
                onPress={() => renewalMutation.mutate(renewalBooking.id)}
                disabled={renewalMutation.isPending}
                style={[styles.renewalBtn, { backgroundColor: C_AMBER }]}
              >
                {renewalMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <RefreshCw size={14} color="#fff" strokeWidth={2} />
                )}
              </Pressable>
            </View>
          )}

          {/* Active trip card — shown regardless of the online toggle: this is
              the only entry point back into the active-trip screen, and going
              offline mid-trip must not hide it. */}
          {activeLine && (
            <Animated.View style={[{ marginTop: Spacing.lg, opacity: cardAnim, transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
              <View style={styles.activeCard}>
                <View style={styles.activeCardHeader}>
                  <View style={styles.livePill}>
                    <View style={[styles.liveDot, { backgroundColor: S.teal }]} />
                    <Text style={[styles.liveText, { color: S.teal, fontFamily: 'Inter_800ExtraBold' }]}>{t.live}</Text>
                  </View>
                  <Text style={[styles.lineNumber, { color: S.cap, fontFamily: 'Inter_700Bold' }]}>
                    {activeLine.lineNumber}
                  </Text>
                </View>
                <Text style={[styles.activeLineName, { color: S.ink, fontFamily: 'Inter_800ExtraBold' }]}>
                  {activeLine.name}
                </Text>
                <Text style={[styles.activeLineRoute, { color: S.cap, fontFamily: 'Inter_600SemiBold' }]}>
                  {activeLine.from} → {activeLine.to}
                </Text>

                {(activeLine.vehicleType !== 'Unknown' || activeLine.totalSeats > 0) && (
                  <View style={styles.seatRow}>
                    {activeLine.vehicleType !== 'Unknown' && (
                      <View style={styles.vehicleBadge}>
                        <Text style={[styles.vehicleBadgeText, { fontFamily: 'Inter_700Bold' }]}>
                          {activeLine.vehicleType}
                        </Text>
                      </View>
                    )}
                    {activeLine.totalSeats > 0 && (
                      <View style={styles.seatBadge}>
                        <Users size={11} color={S.cap} strokeWidth={2} />
                        <Text style={[styles.seatBadgeText, { color: S.ink, fontFamily: 'Inter_700Bold' }]}>
                          {activeLine.bookedSeats} {t.home_of} {activeLine.totalSeats}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.progressWrap}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
                  </View>
                  <Text style={[styles.progressPct, { color: S.ink, fontFamily: 'Inter_800ExtraBold' }]}>
                    {Math.round(progress * 100)}%
                  </Text>
                </View>

                <View style={styles.stopRow}>
                  <View style={styles.stopTile}>
                    <Text style={[styles.stopTileCap, { fontFamily: 'Inter_700Bold' }]}>{t.active.toUpperCase()}</Text>
                    <Text style={[styles.stopTileName, { color: S.ink, fontFamily: 'Inter_800ExtraBold' }]} numberOfLines={1}>
                      {currentStop?.name ?? '—'}
                    </Text>
                    <Text style={[styles.stopTileMeta, { color: S.cap, fontFamily: 'Inter_600SemiBold' }]}>
                      {currentStop ? `${currentStop.boarded}/${currentStop.expected} ${t.home_boarded}` : '—'}
                    </Text>
                  </View>
                  <View style={styles.stopTile}>
                    <Text style={[styles.stopTileCap, { fontFamily: 'Inter_700Bold' }]}>{t.next_departure.toUpperCase()}</Text>
                    <Text style={[styles.stopTileName, { color: S.ink, fontFamily: 'Inter_800ExtraBold' }]} numberOfLines={1}>
                      {nextStop?.name ?? '—'}
                    </Text>
                    <Text style={[styles.stopTileMeta, { color: S.cap, fontFamily: 'Inter_600SemiBold' }]}>
                      {nextStop?.eta ? `${t.home_eta} ${nextStop.eta}` : '—'}
                    </Text>
                  </View>
                </View>

                {/* Fix 2: use handleNavigateToActiveTrip to block if checkin pending */}
                <Pressable onPress={handleNavigateToActiveTrip} style={styles.continueBtn}>
                  <Navigation size={16} color="#fff" strokeWidth={2} />
                  <Text style={[styles.continueBtnText, { fontFamily: 'Inter_800ExtraBold' }]}>{t.full_route}</Text>
                </Pressable>
              </View>
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
                      tripId: first.tripId ?? '',
                      bookingId: first.bookingId ?? '',
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
                      // weekStart is only sent for the older weekly-handoff path;
                      // a single-trip referral shows its own departure date instead.
                      weekStart: first.weekStart ?? first.departureTime ?? '',
                    },
                  })
                }
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, marginTop: Spacing.md }]}
              >
                <View style={[styles.referralBanner, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                  <View style={[styles.referralBannerPulse, { backgroundColor: '#F97316' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontSize: 13, color: '#92400E', fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                      {incomingReferralsCount === 1 ? t.referral_incoming_title : `${incomingReferralsCount} ${t.referral_incoming_title}`}
                    </Text>
                    <Text style={[{ fontSize: 11, color: '#B45309', fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: TA }]}>
                      {t.referral_incoming_sub}
                    </Text>
                  </View>
                  <View style={[styles.referralBannerBadge, { backgroundColor: '#F97316' }]}>
                    <Text style={[styles.referralBannerBadgeText, { fontFamily: 'Inter_700Bold' }]}>
                      {incomingReferralsCount > 9 ? '9+' : String(incomingReferralsCount)}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#92400E" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
                </View>
              </Pressable>
            );
          })()}

          {/* Upcoming Trips section */}
          <Text style={[styles.sectionTitle, { color: S.ink, fontFamily: 'Inter_800ExtraBold', textAlign: TA, marginTop: Spacing.xl }]}>
            {t.upcoming_trips}
          </Text>

          {shuttleError ? (
            <Pressable onPress={() => refetch()}>
              <View style={[styles.upcomingEmpty, { borderColor: '#ef4444' }]}>
                <Calendar size={20} color="#ef4444" strokeWidth={2} />
                <Text style={[styles.upcomingEmptyText, { color: '#ef4444', fontFamily: 'Inter_400Regular' }]}>
                  {t.trips_load_failed}
                </Text>
              </View>
            </Pressable>
          ) : upcomingLines.length === 0 ? (
            <View style={[styles.upcomingEmpty, { borderColor: '#E5E7EA' }]}>
              <Calendar size={20} color={S.cap} strokeWidth={2} />
              <Text style={[styles.upcomingEmptyText, { color: S.cap, fontFamily: 'Inter_400Regular' }]}>
                {t.no_upcoming_trips}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {upcomingLines.map(line => {
                // The weekly booking this trip belongs to — still needed to open
                // /shuttle/trip-details for the Start Trip flow (still scoped to
                // the booking's "next representative trip"). tripId is passed
                // separately so Cancel acts on this exact trip, not the week.
                const booking = myBookings.find(b =>
                  String(b.routeId) === String(line.routeId) &&
                  (!b.direction || !line.direction || b.direction === line.direction)
                );
                return (
                  <UpcomingTripCard
                    key={line.id}
                    line={line}
                    colors={colors}
                    isRTL={isRTL}
                    onPress={() => {
                      // A trip picked up via referral or admin single-trip
                      // assignment has no matching weekly booking — fall back
                      // to the line's own fields instead of no-op'ing.
                      router.push({
                        pathname: '/shuttle/trip-details' as any,
                        params: {
                          bookingId: booking ? String(booking.id) : '',
                          tripId: line.tripId ?? '',
                          routeId: String(booking?.routeId ?? line.routeId),
                          // Pass full booking snapshot so trip-details can render
                          // even when ShuttleProvider is not in scope for that route group.
                          routeName: booking?.routeName ?? line.name,
                          routeNameAr: booking?.routeNameAr ?? '',
                          departureTime: booking?.departureTime ?? line.departure,
                          weekStart: booking?.weekStart ?? '',
                          weekEnd: booking?.weekEnd ?? '',
                          status: booking?.status ?? '',
                          direction: booking?.direction ?? line.direction ?? '',
                        },
                      });
                    }}
                  />
                );
              })}
            </View>
          )}

          {/* No active booking — only shown when there are no upcoming or active trips */}
          {upcomingLines.length === 0 && !activeLine && (
            <View style={[styles.noLineCard, { marginTop: Spacing.lg }]}>
              <GitBranch size={32} color={S.cap} strokeWidth={2} />
              <Text style={[styles.noLineTitle, { color: S.ink, fontFamily: 'Inter_800ExtraBold' }]}>{t.no_booking}</Text>
              <Text style={[styles.noLineSub, { color: S.cap, fontFamily: 'Inter_400Regular' }]}>
                {t.trips_here}
              </Text>
              <Pressable onPress={() => router.push('/(shuttle)/lines')} style={styles.goToLinesBtn}>
                <Text style={[styles.goToLinesBtnText, { fontFamily: 'Inter_800ExtraBold' }]}>{t.browse_routes}</Text>
                <ArrowRight size={16} color="#fff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
              </Pressable>
            </View>
          )}

        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
  container: { flex: 1 },
  hero: { backgroundColor: S.ink, paddingHorizontal: 22, paddingBottom: 22, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  greeting: { fontSize: 11, letterSpacing: 1 },
  driverName: { fontSize: 22, color: '#fff', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,.1)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: -2, right: -2, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  notifDotText: { fontSize: 7, color: '#fff', fontFamily: 'Inter_700Bold' },
  serviceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,.1)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
  serviceChipDot: { width: 6, height: 6, borderRadius: 3 },
  serviceChipText: { fontSize: 9, color: '#fff', letterSpacing: 1 },
  togglePill: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 18, padding: 14, marginTop: 18 },
  toggleIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { fontSize: 13.5, color: '#fff' },
  toggleSub: { fontSize: 11, marginTop: 1 },
  switchTrack: { width: 44, height: 26, borderRadius: 13, padding: 3 },
  switchThumb: { width: 20, height: 20, borderRadius: 10 },
  heroStatsRow: { flexDirection: 'row', marginTop: 18 },
  heroStatCell: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 17, color: '#fff' },
  heroStatCap: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: S.capOnDark, marginTop: 2 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,.12)' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: 14, borderWidth: 1, marginTop: Spacing.md },
  bannerText: { fontSize: 13 },
  renewalCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: 14, marginTop: Spacing.lg, backgroundColor: S.card, borderRadius: 16, borderWidth: 1 },
  renewalIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  renewalTitle: { fontSize: 13 },
  renewalRoute: { fontSize: 11, marginTop: 2 },
  renewalCountdown: { fontSize: 11, marginTop: 3 },
  renewalBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15 },
  activeCard: { backgroundColor: S.card, borderRadius: 22, padding: 20 },
  activeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#DDF4EB', borderRadius: 99 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 10, letterSpacing: 1 },
  lineNumber: { fontSize: 12 },
  activeLineName: { fontSize: 17, marginTop: 12 },
  activeLineRoute: { fontSize: 13, marginTop: 2 },
  seatRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, flexWrap: 'wrap' },
  vehicleBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#EEF0F1' },
  vehicleBadgeText: { fontSize: 11, letterSpacing: 0.5, color: S.ink },
  seatBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#EEF0F1' },
  seatBadgeText: { fontSize: 11 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: C_TRACK },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: S.ink },
  progressPct: { fontSize: 13 },
  stopRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stopTile: { flex: 1, backgroundColor: C_TILE, borderRadius: 14, padding: 12 },
  stopTileCap: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: S.cap },
  stopTileName: { fontSize: 13.5, marginTop: 3 },
  stopTileMeta: { fontSize: 11, marginTop: 2 },
  continueBtn: { marginTop: 16, height: 50, borderRadius: 15, backgroundColor: S.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  continueBtnText: { color: '#fff', fontSize: 14 },
  upcomingEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.lg, borderWidth: 1, borderRadius: 16, marginTop: Spacing.sm, backgroundColor: S.card },
  upcomingEmptyText: { fontSize: 13 },
  referralBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1.5, borderRadius: 16 },
  referralBannerPulse: { width: 8, height: 8, borderRadius: 4 },
  referralBannerBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  referralBannerBadgeText: { fontSize: 11, color: '#fff' },
  noLineCard: { alignItems: 'center', padding: 28, gap: 10, backgroundColor: S.card, borderRadius: 20 },
  noLineTitle: { fontSize: 15, marginTop: 4 },
  noLineSub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  goToLinesBtn: { marginTop: Spacing.sm, borderRadius: 14, height: 48, width: '100%', backgroundColor: S.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  goToLinesBtnText: { color: '#fff', fontSize: 14 },
  });
}
