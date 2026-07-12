import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { DRIVER_LOCATION_TASK } from '@/lib/backgroundLocationTask';
import { AlertCircle, Bell, Check, CheckCircle, Settings, Star, TrendingUp, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { Animation } from '@/constants/animations';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type SurgeZone } from '@/components/MapBackdrop';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useRideSocket, type RideRequest } from '@/hooks/useRideSocket';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { computeDeadlineMinutes, type CheckinRequiredPayload } from '@/lib/checkinDeadline';

export const TAB_BAR_HEIGHT = 96;
const OFFER_TIMEOUT_MS = 12000;

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const [online, setOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [request, setRequest] = useState<RideRequest | null>(null);
  const [surgeZones, setSurgeZones] = useState<SurgeZone[]>([]);
  const [countdown, setCountdown] = useState(12);
  const topPad = insets.top;

  // Socket event UI state
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'warning' | 'success'>('warning');
  const statusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedStatusRef = useRef<string | null>(null);
  const toastAnim = useRef(new Animated.Value(-80)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against double-navigating to /selfie when both the live socket event
  // and the GET /driver/checkin/status poll fire for the same pending check-in.
  const checkinPromptedRef = useRef(false);

  const [unreadCount, setUnreadCount] = useState(0);
  const { socket } = useSocket();

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { data: driverRaw, isLoading: driverLoading } = useQuery({
    queryKey: ['driver'],
    queryFn: endpoints.driver.me,
  });
  const { data: earningsRaw, isLoading: earningsLoading } = useQuery({
    queryKey: ['earnings-summary'],
    queryFn: endpoints.earnings.summary,
  });
  const { data: activeRideRaw } = useQuery({
    queryKey: ['ride-active'],
    queryFn: endpoints.rides.active,
    retry: false,
  });
  const { data: notificationsRaw, refetch: refetchNotifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => endpoints.notifications.list() as Promise<{ id: string; read?: boolean; isRead?: boolean }[]>,
    staleTime: 30000,
  });
  // Cold-start / reconnect gate check — catches a pending check-in the driver
  // missed while the app was closed (the live DRIVER_CHECKIN_REQUIRED socket
  // event only reaches an app that's already open and connected).
  const { data: checkinStatusRaw, refetch: refetchCheckinStatus } = useQuery({
    queryKey: ['driver-checkin-status'],
    queryFn: endpoints.driver.checkinStatus,
    retry: false,
  });

  const driverData = driverRaw as any;
  const earningsData = earningsRaw as any;
  const activeRide = activeRideRaw as any;
  const statsLoading = driverLoading || earningsLoading;

  // Resume active ride if one exists on mount
  useEffect(() => {
    if (activeRide?.id) {
      router.replace(`/ride/${activeRide.id}`);
    }
  }, [activeRide?.id]);

  const queryClient = useQueryClient();

  useEffect(() => {
    const notifs = Array.isArray(notificationsRaw) ? notificationsRaw : [];
    const count = notifs.filter(n => !(n.read ?? n.isRead ?? false)).length;
    setUnreadCount(count);
  }, [notificationsRaw]);

  useFocusEffect(
    useCallback(() => {
      refetchNotifications();
      // Returning to this screen (e.g. backed out of /selfie) — allow another prompt.
      checkinPromptedRef.current = false;
      refetchCheckinStatus();
    }, [refetchNotifications, refetchCheckinStatus])
  );

  useEffect(() => {
    const status = checkinStatusRaw as { checkInRequired?: boolean; checkInDeadline?: string | null } | undefined;
    if (!status?.checkInRequired || checkinPromptedRef.current) return;
    checkinPromptedRef.current = true;
    router.push({
      pathname: '/selfie',
      params: { deadlineMinutes: String(computeDeadlineMinutes(status.checkInDeadline)) },
    });
  }, [checkinStatusRaw]);

  useEffect(() => {
    if (!socket) return;
    const handleNotificationNew = (data?: { title?: string; body?: string }) => {
      setUnreadCount(prev => prev + 1);
      const msg = data?.title
        ? data.body
          ? `${data.title}: ${data.body}`
          : data.title
        : data?.body ?? null;
      if (msg) {
        showToastRef.current?.(msg, 'success');
      }
    };
    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotificationNew);
    return () => { socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotificationNew); };
  }, [socket]);

  const pulseScale = useRef(new Animated.Value(0.8)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  const sheetAnim = useRef(new Animated.Value(300)).current;
  const timerAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<Animated.CompositeAnimation | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demandAnim = useRef(new Animated.Value(60)).current;
  const demandOpacity = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(-44)).current;
  const showRequestRef = useRef<((r: RideRequest) => void) | null>(null);
  const dismissRequestRef = useRef<(() => void) | null>(null);
  const dismissSilentlyRef = useRef<(() => void) | null>(null);
  const showToastRef = useRef<((msg: string, type: 'warning' | 'success') => void) | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (online) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseScale, { toValue: 2.4, duration: 2000, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseScale, { toValue: 0.8, duration: 0, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
      pulse.start();
      Animated.parallel([
        Animated.spring(demandAnim, { toValue: 0, useNativeDriver: true }),
        Animated.timing(demandOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
      return () => pulse.stop();
    }
  }, [online]);

  const showRequest = (r: RideRequest) => {
    // Stop any existing timer before showing new request
    timerRef.current?.stop();
    if (countdownRef.current) clearInterval(countdownRef.current);

    setRequest(r);
    setCountdown(Math.round(OFFER_TIMEOUT_MS / 1000));
    timerAnim.setValue(1);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

    Animated.spring(sheetAnim, { toValue: 0, stiffness: 320, damping: 32, useNativeDriver: true }).start();
    timerRef.current = Animated.timing(timerAnim, { toValue: 0, duration: OFFER_TIMEOUT_MS, useNativeDriver: false });
    timerRef.current.start(({ finished }) => { if (finished) dismissRequest(); });

    // Numeric countdown
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  showRequestRef.current = showRequest;

  const { token } = usePushNotifications(useCallback(() => {}, []));

  const handleRideOffer = useCallback((ride: RideRequest) => {
    showRequestRef.current?.(ride);
  }, []);

  const handleOfferExpired = useCallback(() => {
    dismissRequestRef.current?.();
  }, []);

  const handleRideNoLongerAvailable = useCallback(() => {
    dismissSilentlyRef.current?.();
    showToastRef.current?.('Ride is no longer available', 'warning');
  }, []);

  // Periodic ("long_shift") check-in prompt — same capture screen as the shuttle
  // trip check-in, just no tripId and a deadline derived from the payload.
  const handleCheckinRequired = useCallback((data: CheckinRequiredPayload) => {
    if (checkinPromptedRef.current) return;
    checkinPromptedRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    router.push({
      pathname: '/selfie',
      params: { deadlineMinutes: String(computeDeadlineMinutes(data?.deadline)) },
    });
  }, []);

  // Selfie.tsx already reacts to these directly while it's mounted (closes on
  // approved / prompts a retake on rejected) — this is just an ambient
  // notification for when the driver isn't on that screen anymore.
  const handleCheckinApproved = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToastRef.current?.('Check-in approved — you can keep receiving requests.', 'success');
  }, []);

  const handleCheckinRejected = useCallback(() => {
    showToastRef.current?.('Check-in was not confirmed. You have been taken offline.', 'warning');
  }, []);

  const handleCooldownCleared = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['driver'] });
    showToastRef.current?.('Your cooldown has been lifted, you can receive rides again', 'success');
  }, [queryClient]);

  const handleSurgeUpdated = useCallback((zones: SurgeZone[]) => {
    setSurgeZones(zones);
  }, []);

  const { connected: socketConnected } = useRideSocket({
    driverId: driverData?.id as string | undefined,
    onRideOffer: handleRideOffer,
    onOfferExpired: handleOfferExpired,
    onRideNoLongerAvailable: handleRideNoLongerAvailable,
    onCheckinRequired: handleCheckinRequired,
    onCheckinApproved: handleCheckinApproved,
    onCheckinRejected: handleCheckinRejected,
    onCooldownCleared: handleCooldownCleared,
    onSurgeUpdated: handleSurgeUpdated,
  });

  // Re-check the gate on reconnect too — covers a dropped connection that
  // missed the live DRIVER_CHECKIN_REQUIRED event while it was down.
  useEffect(() => {
    if (socketConnected) refetchCheckinStatus();
  }, [socketConnected, refetchCheckinStatus]);

  // Push token registration happens on login, not just when going online
  useEffect(() => {
    if (token) {
      endpoints.pushTokens.register(Platform.OS as 'ios' | 'android' | 'web', token).catch(() => {});
    }
  }, [token]);

  // Start GPS tracking using background location task — returns false if permission denied
  const startLocationTracking = async (): Promise<boolean> => {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      setLocationError('Location permission is required to receive rides. Please enable it in Settings.');
      return false;
    }
    setLocationError(null);
    // Request background permission (soft — don't block on denial)
    await Location.requestBackgroundPermissionsAsync().catch(() => {});
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(DRIVER_LOCATION_TASK);
      if (!isRegistered) {
        await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000,
          distanceInterval: 50,
          foregroundService: {
            notificationTitle: 'VeeGo Driver',
            notificationBody: "You're online — receiving ride requests.",
            notificationColor: '#2d2d42',
          },
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.AutomotiveNavigation,
          showsBackgroundLocationIndicator: true,
        });
      }
    } catch {
      // Expo Go / task manager unavailable — fall back to interval-based tracking
      const sendLocation = async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          await endpoints.driver.updateLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            speed: loc.coords.speed ?? undefined,
            heading: loc.coords.heading ?? undefined,
          });
        } catch {
          // best-effort
        }
      };
      sendLocation();
      locationIntervalRef.current = setInterval(sendLocation, 10000);
    }
    return true;
  };

  const stopLocationTracking = () => {
    // Stop background location task
    TaskManager.isTaskRegisteredAsync(DRIVER_LOCATION_TASK)
      .then((registered) => {
        if (registered) Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => {});
      })
      .catch(() => {});
    // Clear any Expo Go fallback interval
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
  };

  // Stop location tracking on unmount
  useEffect(() => () => {
    stopLocationTracking();
  }, []);

  // Reconnecting banner — slide down when socket drops while online
  useEffect(() => {
    const show = online && !socketConnected;
    Animated.spring(bannerAnim, {
      toValue: show ? 0 : -44,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  }, [online, socketConnected]);

  const handleToggleOnline = async () => {
    if (togglingOnline) return;
    const next = !online;
    const nextStatus = next ? 'online' : 'offline';

    // Debounce: skip if same status already submitted within 2 s
    if (nextStatus === lastSubmittedStatusRef.current) return;
    if (statusDebounceRef.current) clearTimeout(statusDebounceRef.current);

    setTogglingOnline(true);
    statusDebounceRef.current = setTimeout(async () => {
    try {
      await (next ? endpoints.driver.goOnline() : endpoints.driver.goOffline());
      lastSubmittedStatusRef.current = nextStatus;
      if (next) {
        // Request location permission and start tracking; revert status if denied
        const ok = await startLocationTracking();
        if (!ok) {
          await endpoints.driver.goOffline().catch(() => {});
          setTogglingOnline(false);
          return;
        }
      } else {
        stopLocationTracking();
        setLocationError(null);
      }
      setOnline(next);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {
      // If API fails, keep previous state
    } finally {
      setTogglingOnline(false);
    }
    }, 2000); // 2 s debounce
  };

  const showToast = (msg: string, type: 'warning' | 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    setToastType(type);
    Animated.spring(toastAnim, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    toastTimerRef.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: -80, duration: Animation.duration.normal, useNativeDriver: true }).start(() => setToastMsg(null));
    }, 3500);
  };
  showToastRef.current = showToast;

  const dismissSilently = () => {
    timerRef.current?.stop();
    if (countdownRef.current) clearInterval(countdownRef.current);
    Animated.timing(sheetAnim, { toValue: 300, duration: 250, useNativeDriver: true }).start(() => setRequest(null));
  };
  dismissSilentlyRef.current = dismissSilently;

  const dismissRequest = () => {
    timerRef.current?.stop();
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (request) {
      endpoints.rides.decline(request.id).catch(() => {});
    }
    Animated.timing(sheetAnim, { toValue: 300, duration: 250, useNativeDriver: true }).start(() => setRequest(null));
  };
  dismissRequestRef.current = dismissRequest;

  const acceptRequest = async () => {
    if (!request) return;
    const rideId = request.id;
    timerRef.current?.stop();
    if (countdownRef.current) clearInterval(countdownRef.current);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await endpoints.rides.accept(rideId);
    } catch {
      // best-effort
    }
    Animated.timing(sheetAnim, { toValue: 300, duration: 250, useNativeDriver: true }).start(() => {
      setRequest(null);
      router.push(`/ride/${rideId}`);
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Reconnecting banner */}
      <Animated.View
        style={{
          position: 'absolute',
          top: topPad,
          left: 0,
          right: 0,
          zIndex: 99,
          transform: [{ translateY: bannerAnim }],
        }}
        pointerEvents="none"
      >
        <View style={{
          marginHorizontal: 16,
          borderRadius: 12,
          backgroundColor: '#e67e22',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 9,
          paddingHorizontal: 16,
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}>
          <AlertCircle size={14} color="#fff" strokeWidth={2.5} />
          <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.2 }}>
            Reconnecting to server…
          </Text>
        </View>
      </Animated.View>

      {/* Event toast — ride:no_longer_available / driver:cooldown:cleared */}
      {toastMsg != null && (
        <Animated.View
          style={[styles.toastWrap, { top: topPad + 52, transform: [{ translateY: toastAnim }] }]}
          pointerEvents="none"
        >
          <View style={[styles.toastInner, { backgroundColor: toastType === 'success' ? '#22c55e' : '#e67e22' }]}>
            {toastType === 'success'
              ? <CheckCircle size={14} color="#fff" strokeWidth={2.5} />
              : <AlertCircle size={14} color="#fff" strokeWidth={2.5} />
            }
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        </Animated.View>
      )}

      <View style={[styles.overlay, { paddingTop: topPad }]}>
        <View style={[styles.header, { flexDirection: R }]}>
          <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.avatarPill}>
            <GlassView style={styles.avatarPillGlass} borderRadius={24}>
              <View style={[styles.avatarPillInner, { flexDirection: R }]}>
                <Image source={driverData?.avatar ? { uri: driverData.avatar } : undefined} style={[styles.avatar, { borderColor: colors.primary + '66' }]} />
                <View>
                  <Text style={[styles.hiText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{t.hi}, {(driverData?.name ?? '—').split(' ')[0]}</Text>
                  <View style={[styles.ratingRow, { flexDirection: R }]}>
                    <Star size={12} color={colors.accent} fill={colors.accent} strokeWidth={2} />
                    {/* backend returns rating as a string — parseFloat for numeric display */}
                    <Text style={[styles.ratingText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{driverData?.rating != null ? parseFloat(String(driverData.rating)).toFixed(1) : '—'}</Text>
                  </View>
                </View>
              </View>
            </GlassView>
          </Pressable>

          <View style={[styles.headerActions, { flexDirection: R }]}>
            <Pressable
              style={styles.iconBtn}
              accessibilityLabel="Notifications"
              onPress={() => router.push('/messages')}
            >
              <GlassView style={styles.iconBtnGlass} borderRadius={20}>
                <Bell size={18} color={colors.foreground} strokeWidth={2} />
                {unreadCount > 0 && (
                  <View style={[styles.notifDot, { backgroundColor: colors.destructive }]}>
                    <Text style={styles.notifDotText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
                  </View>
                )}
              </GlassView>
            </Pressable>
            <Pressable
              onPress={() => router.push('/settings')}
              style={styles.iconBtn}
              accessibilityLabel="Settings"
            >
              <GlassView style={styles.iconBtnGlass} borderRadius={20}>
                <Settings size={18} color={colors.foreground} strokeWidth={2} />
              </GlassView>
            </Pressable>
          </View>
        </View>

        <View style={styles.statsPillWrap}>
          <GlassView strong style={styles.statsPill} borderRadius={20}>
            {statsLoading ? (
              <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : (
              <View style={[styles.statsPillInner, { flexDirection: R }]}>
                {/* backend returns totalEarnings as a string — parseFloat for numeric formatting */}
                <StatItem label={t.today} value={`${parseFloat(String(earningsData?.summary?.totalEarnings ?? 0)).toFixed(2)} ${t.egp}`} highlight colors={colors} isRTL={isRTL} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <StatItem label={t.trips} value={String(earningsData?.trips ?? '—')} colors={colors} isRTL={isRTL} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <StatItem label={t.online_status} value={earningsData?.online ? `${earningsData.online}h` : '—'} colors={colors} isRTL={isRTL} />
              </View>
            )}
          </GlassView>
        </View>

        {surgeZones.length > 0 && online && (
          <Animated.View style={[styles.demandCard, { transform: [{ translateX: demandAnim }], opacity: demandOpacity }]}>
            <GlassView strong style={styles.demandCardInner} borderRadius={16}>
              <View style={[styles.demandHeader, { flexDirection: R }]}>
                <TrendingUp size={14} color={colors.accent} strokeWidth={2} />
                <Text style={[styles.demandTitle, { color: colors.accent, fontFamily: 'Inter_700Bold' }]}>{t.high_demand}</Text>
              </View>
              <Text style={[styles.demandText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                {surgeZones.length === 1
                  ? `${surgeZones[0].multiplier.toFixed(1)}× surge active nearby — head there for more trips.`
                  : `${surgeZones.length} surge zones active in your area.`}
              </Text>
            </GlassView>
          </Animated.View>
        )}
      </View>

      {/* Surge zone badge */}
      {surgeZones.length > 0 && (
        <View style={[styles.surgeBadge, { bottom: TAB_BAR_HEIGHT + (locationError ? 180 : 140) }]}>
          <Text style={{ fontSize: 13, color: '#D5B23D' }}>⚡</Text>
          <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: '#D5B23D', letterSpacing: 0.3 }}>
            {surgeZones.length === 1
              ? `${surgeZones[0].multiplier.toFixed(1)}× surge zone`
              : `${surgeZones.length} surge zones active`}
          </Text>
        </View>
      )}

      {/* Location permission error banner */}
      {locationError && (
        <View style={[styles.locationErrorBanner, { bottom: TAB_BAR_HEIGHT + 130, backgroundColor: '#ef444415', borderColor: '#ef444430' }]}>
          <AlertCircle size={14} color="#ef4444" strokeWidth={2} />
          <Text style={[styles.locationErrorText, { color: '#ef4444', fontFamily: 'Inter_400Regular' }]}>{locationError}</Text>
        </View>
      )}

      <View style={[styles.onlineToggleWrap, { bottom: TAB_BAR_HEIGHT + 60 }]}>
        <View style={styles.pulseContainer}>
          {online && (
            <Animated.View style={[styles.pulseRing, {
              backgroundColor: colors.primary + '40',
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            }]} />
          )}
          <Pressable
            onPress={handleToggleOnline}
            disabled={togglingOnline}
            accessibilityLabel={online ? 'Go offline' : 'Go online'}
            style={({ pressed }) => [styles.onlineBtn, { transform: [{ scale: pressed ? 0.95 : 1 }], opacity: togglingOnline ? 0.7 : 1 }]}
          >
            {online ? (
              <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.onlineBtnGrad}>
                <Text style={[styles.onlineBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.online_status}</Text>
              </LinearGradient>
            ) : (
              <View style={[styles.onlineBtnOff, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.onlineBtnText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.go}</Text>
              </View>
            )}
          </Pressable>
        </View>
        <GlassView style={styles.statusPill} borderRadius={20}>
          <Text style={[styles.statusPillText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }]}>
            {togglingOnline ? '...' : online ? t.youre_online : t.youre_offline}
          </Text>
        </GlassView>
      </View>

      {request && (
        <Animated.View style={[styles.requestSheet, { transform: [{ translateY: sheetAnim }] }]}>
          <GlassView strong style={[styles.requestCard, { borderColor: colors.primary + '4D' }]} borderRadius={24}>
            <View style={[styles.requestHeader, { flexDirection: R }]}>
              <View style={[styles.requestHeaderLeft, { flexDirection: R }]}>
                <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.requestType, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
                  {t.new_trip} · {request.type}
                </Text>
              </View>
              <View style={[styles.requestHeaderRight, { flexDirection: R }]}>
                <Text style={[styles.countdownText, { color: colors.destructive, fontFamily: 'Inter_700Bold' }]}>
                  {countdown}s
                </Text>
                <Pressable onPress={dismissRequest} style={[styles.closeBtn, { backgroundColor: colors.secondary }]}>
                  <X size={16} color={colors.foreground} strokeWidth={2} />
                </Pressable>
              </View>
            </View>

            <View style={[styles.requestFareRow, { flexDirection: R }]}>
              <View>
                <Text style={[styles.fareAmount, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                  {(request.fare ?? 0).toFixed(2)} <Text style={[styles.fareCurrency, { color: colors.mutedForeground }]}>{t.egp}</Text>
                </Text>
                <Text style={[styles.fareDetails, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                  {request.payment} · {request.duration}
                </Text>
              </View>
              <View style={[styles.riderInfo, { flexDirection: R }]}>
                <Image source={{ uri: request.rider.avatar }} style={styles.riderAvatar} />
                <View>
                  <Text style={[styles.riderName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{request.rider.name}</Text>
                  <View style={[styles.riderRatingRow, { flexDirection: R }]}>
                    <Star size={12} color={colors.accent} fill={colors.accent} strokeWidth={2} />
                    <Text style={[styles.riderRating, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{request.rider.rating}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.routeContainer, { flexDirection: R }]}>
              <View style={styles.routeDots}>
                <View style={[styles.routeDotTop, { backgroundColor: colors.primary }]} />
                <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
                <View style={[styles.routeDotBottom, { backgroundColor: colors.accent }]} />
              </View>
              <View style={styles.routeAddresses}>
                <View>
                  <Text style={[styles.routeLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                    PICKUP · {request.pickup.distance} · {request.pickup.eta}
                  </Text>
                  <Text style={[styles.routeAddress, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>{request.pickup.address}</Text>
                </View>
                <View>
                  <Text style={[styles.routeLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                    DROPOFF · {request.dropoff.distance}
                  </Text>
                  <Text style={[styles.routeAddress, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>{request.dropoff.address}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.requestActions, { flexDirection: R }]}>
              <Pressable
                onPress={dismissRequest}
                style={[styles.declineBtn, { backgroundColor: colors.secondary }]}
                accessibilityLabel="Decline ride"
              >
                <Text style={[styles.declineBtnText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.decline}</Text>
              </Pressable>
              <Pressable
                onPress={acceptRequest}
                style={styles.acceptBtn}
                accessibilityLabel="Accept ride"
              >
                <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.acceptBtnGrad, { flexDirection: R }]}>
                  <Check size={20} color={colors.primaryForeground} strokeWidth={2} />
                  <Text style={[styles.acceptBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.accept_trip}</Text>
                </LinearGradient>
              </Pressable>
            </View>

            <Animated.View style={[styles.timerBar, {
              backgroundColor: colors.destructive,
              width: timerAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]} />
          </GlassView>
        </Animated.View>
      )}
    </View>
  );
}

function StatItem({ label, value, highlight, colors, isRTL }: { label: string; value: string; highlight?: boolean; colors: ReturnType<typeof useColors>; isRTL: boolean }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>{label}</Text>
      <Text style={[styles.statValue, { color: highlight ? colors.primary : colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { flex: 1, position: 'relative' },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  avatarPill: {},
  avatarPillGlass: {},
  avatarPillInner: { alignItems: 'center', gap: 10, paddingLeft: 4, paddingRight: 12, paddingVertical: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  hiText: { fontSize: 12 },
  ratingRow: { alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 12 },
  headerActions: { gap: 8 },
  iconBtn: {},
  iconBtnGlass: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  notifDotText: { fontSize: 7, color: '#fff', fontFamily: 'Inter_700Bold' },
  statsPillWrap: { paddingHorizontal: 16, marginTop: 16 },
  statsPill: {},
  statsPillInner: { alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  statLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  statValue: { fontSize: 16, marginTop: 2 },
  divider: { width: 1, height: 32 },
  demandCard: { position: 'absolute', top: 120, right: 16 },
  demandCardInner: { padding: 12, width: 144 },
  demandHeader: { alignItems: 'center', gap: 6 },
  demandTitle: { fontSize: 12 },
  demandText: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  locationErrorBanner: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1 },
  surgeBadge: { position: 'absolute', alignSelf: 'center', left: 20, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(213,178,61,0.12)', borderWidth: 1, borderColor: 'rgba(213,178,61,0.45)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  locationErrorText: { flex: 1, fontSize: 12, lineHeight: 16 },
  onlineToggleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 12 },
  pulseContainer: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 80, height: 80, borderRadius: 40 },
  onlineBtn: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden', elevation: 8, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 20 },
  onlineBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  onlineBtnOff: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  onlineBtnText: { fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' },
  statusPill: { paddingHorizontal: 16, paddingVertical: 6 },
  statusPillText: { fontSize: 12 },
  requestSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 12, paddingBottom: 12, zIndex: 50 },
  requestCard: { padding: 20, borderWidth: 2 },
  requestHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  requestHeaderLeft: { alignItems: 'center', gap: 8 },
  requestHeaderRight: { alignItems: 'center', gap: 8 },
  countdownText: { fontSize: 14 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  requestType: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  requestFareRow: { alignItems: 'flex-end', justifyContent: 'space-between' },
  fareAmount: { fontSize: 36, lineHeight: 42 },
  fareCurrency: { fontSize: 18 },
  fareDetails: { fontSize: 12, marginTop: 2 },
  riderInfo: { alignItems: 'center', gap: 8 },
  riderAvatar: { width: 40, height: 40, borderRadius: 20 },
  riderName: { fontSize: 14 },
  riderRatingRow: { alignItems: 'center', gap: 4 },
  riderRating: { fontSize: 12 },
  routeContainer: { gap: 12, marginTop: 16 },
  routeDots: { alignItems: 'center', paddingTop: 4 },
  routeDotTop: { width: 12, height: 12, borderRadius: 6 },
  routeLine: { width: 1, flex: 1, marginVertical: 4 },
  routeDotBottom: { width: 12, height: 12, borderRadius: 3 },
  routeAddresses: { flex: 1, gap: 12 },
  routeLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  routeAddress: { fontSize: 14, marginTop: 2 },
  requestActions: { gap: 8, marginTop: 20 },
  declineBtn: { flex: 2, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  declineBtnText: { fontSize: 15 },
  acceptBtn: { flex: 3, height: 56, borderRadius: 16, overflow: 'hidden', elevation: 8, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  acceptBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  acceptBtnText: { fontSize: 15 },
  timerBar: { height: 4, borderRadius: 2, marginTop: 12 },
  // Toast banner — ride:no_longer_available / driver:cooldown:cleared
  toastWrap: { position: 'absolute', left: 0, right: 0, zIndex: 100, paddingHorizontal: 16 },
  toastInner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  toastText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold', flex: 1, lineHeight: 18 },
});
