import { showAlert } from '@/lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, Calendar, ChevronLeft, Clock, MapPin, Users } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { StationTimeline } from '@/components/StationTimeline';
import { useI18n } from '@/lib/i18nContext';
import { useShuttle, findLineForRoute } from '@/lib/shuttleContext';
import { endpoints } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

// "C" split-panel palette — matches the ride/shuttle screens.
const C_BG = '#EEF0F2';
const C_INK = '#14151A';
const C_CAP = '#9AA0A6';
const C_HAIR = '#EEF0F1';
const C_MINT = '#3DDC97';
const C_RED = '#D92D20';
// Shape expected by the shared StationTimeline component — fixed C tones
// instead of the theme's colors object, without touching that shared file
// (still used, unredesigned, by app/shuttle/history-detail.tsx).
const timelineColorsC = { border: C_HAIR, secondary: '#F0F2F3', foreground: C_INK, mutedForeground: C_CAP };

type Params = {
  bookingId: string;
  // The specific trip within the booking's week that the driver tapped —
  // Cancel acts on this exact trip, never the whole week's booking.
  tripId?: string;
  routeId: string;
  // Full booking snapshot passed by the home screen so this screen renders
  // correctly even when ShuttleProvider is not in scope (different route group).
  routeName?: string;
  routeNameAr?: string;
  departureTime?: string;
  weekStart?: string;
  weekEnd?: string;
  status?: string;
  direction?: string;
};

type Station = {
  id: string | number;
  name: string;
  order?: number;
  eta?: string;
  direction?: string;
};

export default function TripDetailsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  const {
    bookingId, tripId, routeId,
    routeName: paramRouteName,
    routeNameAr: paramRouteNameAr,
    departureTime: paramDepartureTime,
    weekStart: paramWeekStart,
    weekEnd: paramWeekEnd,
    status: paramStatus,
    direction: paramDirection,
  } = useLocalSearchParams<Params>();

  const { myBookings, allLines, listLoading, setStartedTripId, refetch } = useShuttle();
  const [starting, setStarting] = useState(false);
  // Synchronous re-entrancy guard — `starting` state read inside the async
  // onPress handler is a stale render-closure value: two taps in the same
  // frame (before React re-renders) both read `starting === false` and both
  // fire. A ref is read/written synchronously and closes this gap, matching
  // the same pattern used elsewhere in the app (e.g. isCompletingRef in
  // app/ride/[rideId].tsx).
  const startingRef = useRef(false);
  // Arrival/boarding step — PATCH /driver/trips/:id/board moves the trip
  // from driver_assigned to boarding (visible to passengers/admin as "the
  // bus is here now") without starting the trip yet; the existing Start
  // Trip button below still owns the boarding -> active transition.
  const [boarding, setBoarding] = useState(false);
  const boardingRef = useRef(false);

  // Use String() coercion on both sides — defends against numeric IDs at runtime.
  // myBookings may be empty when this screen is outside ShuttleProvider's scope
  // (app/shuttle/ vs app/(shuttle)/ route groups); params are the reliable source.
  const booking = myBookings.find(b => String(b.id) === String(bookingId));

  // Synthesise a booking object from URL params when context lookup returns nothing.
  // This covers the case where ShuttleProvider is not mounted in this route group.
  const effectiveBooking = booking ?? (bookingId
    ? {
        id: String(bookingId),
        routeId: routeId ?? '',
        routeName: paramRouteName ?? '',
        departureTime: paramDepartureTime ?? '',
        weekStart: paramWeekStart ?? '',
        weekEnd: paramWeekEnd || undefined,
        status: paramStatus ?? '',
        timeSlotId: '',
        renewalDeadline: undefined,
        nextWeekBookingId: undefined,
        direction: paramDirection || undefined,
      }
    : null);

  // A routeId can back more than one line (outbound + return trip on the
  // same route) — disambiguate instead of assuming a 1:1 routeId match.
  const line = findLineForRoute(allLines, routeId, {
    direction: effectiveBooking?.direction,
    departureTime: effectiveBooking?.departureTime,
  });

  // The trip this screen is actually about — every real navigation into this
  // screen passes tripId; line?.tripId is a fallback for older deep links.
  const effectiveTripId = tripId || line?.tripId;

  // An admin cancelling this trip while the driver sits on this pre-start
  // screen used to be invisible — the driver would tap Start on a screen
  // that still looked live and get a generic failure message with no
  // context. line.status now refreshes reliably on the same socket event
  // that drives this cancellation, so surface it here directly.
  const isCancelled = line?.status === 'cancelled';

  const { data: tripDetailData, isLoading: stationsLoading } = useQuery({
    queryKey: ['trip-start-detail', effectiveTripId],
    queryFn: () => endpoints.trips.startDetail(effectiveTripId!),
    enabled: !!effectiveTripId,
  });

  const isBoardingStatus = tripDetailData?.status === 'boarding';

  const stations: Station[] = useMemo(() => {
    if (!tripDetailData?.stations) return [];
    return tripDetailData.stations as Station[];
  }, [tripDetailData]);

  // Re-check start-eligibility every minute so button auto-enables
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(v => v + 1), 60000);
    return () => clearInterval(iv);
  }, []);

  const isStartEnabled = useMemo(() => {
    // Opens 30 min before departure and stays open indefinitely after — a
    // late driver must still be able to start (the backend enforces no
    // lateness cutoff of its own; this is purely an early-start guard).
    if (tripDetailData?.tripDatetime) {
      const dept = new Date(tripDetailData.tripDatetime);
      const diff = (dept.getTime() - Date.now()) / 60000;
      return diff <= 30;
    }
    // Fallback to time-only check while tripDetail is loading
    const time = effectiveBooking?.departureTime;
    if (!time) return false;
    const match = time.match(/(\d{1,2}):(\d{2})/);
    if (!match) return false;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const now = new Date();
    const diff = (h * 60 + m) - (now.getHours() * 60 + now.getMinutes());
    return diff <= 30;
  }, [tripDetailData?.tripDatetime, effectiveBooking?.departureTime]);

  const handleCancelPress = () => {
    router.push({
      pathname: '/shuttle/trip-cancel' as any,
      params: {
        // Both cancel and refer act on this exact trip, not the whole week.
        tripId: effectiveTripId ?? '',
        routeName: effectiveBooking?.routeName ?? line?.name ?? '',
        departureTime: effectiveBooking?.departureTime ?? line?.departure ?? '',
        fromStation: line?.from ?? '',
        toStation: line?.to ?? '',
      },
    });
  };

  // Show loading state while context is hydrating — prevents premature "Trip not found".
  if (listLoading && !effectiveBooking && !line) {
    return (
      <View style={styles.container}>
        <View style={[styles.headerC, { paddingTop: topPad + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtnC} hitSlop={8}>
            <ChevronLeft size={22} color="#ffffff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </Pressable>
          <Text style={styles.headerTitleC}>{t.trip_details_title}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.emptyState}>
          <ActivityIndicator size="small" color={C_INK} />
        </View>
      </View>
    );
  }

  if (!effectiveBooking && !line) {
    return (
      <View style={styles.container}>
        <View style={[styles.headerC, { paddingTop: topPad + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtnC} hitSlop={8}>
            <ChevronLeft size={22} color="#ffffff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </Pressable>
          <Text style={styles.headerTitleC}>{t.trip_details_title}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={{ color: C_CAP, fontFamily: 'Inter_400Regular', fontSize: Typography.size.sm }}>
            {t.trip_not_found}
          </Text>
        </View>
      </View>
    );
  }

  const routeNameEn = tripDetailData?.routeName ?? effectiveBooking?.routeName ?? line?.name ?? '—';
  const routeNameAr = tripDetailData?.routeNameAr ?? (effectiveBooking as any)?.routeNameAr ?? paramRouteNameAr;
  const routeName = (isRTL && routeNameAr) ? routeNameAr : routeNameEn;
  const from = line?.from ?? '—';
  const to = line?.to ?? '—';
  const departureTime = effectiveBooking?.departureTime ?? line?.departure ?? '—';
  const tripDatetime = tripDetailData?.tripDatetime ?? null;
  const tripDate = tripDatetime
    ? new Date(tripDatetime).toLocaleDateString(isRTL ? 'ar-EG' : 'en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
        timeZone: 'Africa/Cairo',
      })
    : (effectiveBooking?.weekStart ?? '—');
  const bookedSeats = tripDetailData?.bookedSeats ?? (line?.bookedSeats ?? 0);
  const totalSeats = tripDetailData?.totalSeats ?? (line?.totalSeats ?? 0);
  const vehicleType = line?.vehicleType ?? '—';
  const lineNumber = line?.lineNumber ?? '—';
  const direction = tripDetailData?.direction ?? effectiveBooking?.direction ?? line?.direction;
  const directionLabel = direction === 'outbound' ? t.direction_outbound
    : direction === 'return' ? t.direction_return
    : direction;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.headerC, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtnC} hitSlop={8}>
          <ChevronLeft size={22} color="#ffffff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
        <Text style={styles.headerTitleC}>{t.trip_details_title}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.heroC}>
        <Text style={[styles.routeNameC, { textAlign: TA }]}>{routeName}</Text>
        <Text style={[styles.routeSubtitleC, { textAlign: TA }]}>{from} → {to}</Text>
        {!!directionLabel && (
          <Text style={[styles.routeSubtitleC, { textAlign: TA, marginTop: 2 }]}>{directionLabel}</Text>
        )}

        <View style={[{ flexDirection: R, marginTop: 12 }]}>
          <View style={styles.statusBadgeC}>
            <View style={styles.statusDotC} />
            <Text style={styles.statusTextC}>
              {effectiveBooking?.status === 'active' ? t.active : t.status_booked}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {isCancelled && (
          <View style={[styles.cancelledBannerC, { flexDirection: R, marginBottom: Spacing.md }]}>
            <AlertCircle size={16} color={C_RED} strokeWidth={2} />
            <Text style={[styles.cancelledTextC, { textAlign: TA }]}>{t.trip_was_cancelled}</Text>
          </View>
        )}

        {/* Info cards row: Date / Time / Passengers */}
        <View style={[styles.infoRow, { flexDirection: R }]}>
          <View style={styles.infoCardC}>
            <Calendar size={18} color={C_INK} strokeWidth={2} />
            <Text style={styles.infoCardLabelC}>{t.date}</Text>
            <Text style={styles.infoCardValueC}>{tripDate}</Text>
          </View>
          <View style={styles.infoCardC}>
            <Clock size={18} color={C_INK} strokeWidth={2} />
            <Text style={styles.infoCardLabelC}>{t.time_label}</Text>
            <Text style={styles.infoCardValueC}>{departureTime}</Text>
          </View>
          <View style={styles.infoCardC}>
            <Users size={18} color={C_INK} strokeWidth={2} />
            <Text style={styles.infoCardLabelC}>{t.passengers_label_count}</Text>
            <Text style={styles.infoCardValueC}>{bookedSeats} / {totalSeats}</Text>
          </View>
        </View>

        {/* Vehicle & Line info card */}
        <View style={[styles.vehicleCardC, { marginTop: Spacing.md }]}>
          <View style={[{ flexDirection: R, alignItems: 'center', gap: 14 }]}>
            <View style={styles.vehicleIconWrapC}>
              <Text style={{ fontSize: Typography.size.xl }}>🚐</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.vehicleCapC, { textAlign: TA }]}>{t.vehicle_line_label}</Text>
              <Text style={[styles.vehicleValC, { textAlign: TA }]}>{vehicleType} · {lineNumber}</Text>
            </View>
          </View>
        </View>

        {/* Route Timeline */}
        <Text style={[styles.sectionTitleC, { textAlign: TA, marginTop: 26 }]}>{t.route_timeline}</Text>

        {stationsLoading ? (
          <ActivityIndicator size="small" color={C_INK} style={{ marginTop: Spacing.lg }} />
        ) : stations.length > 0 ? (
          <StationTimeline stations={stations} colors={timelineColorsC} R={R} TA={TA} t={{ from: t.from, to: t.to }} />
        ) : (
          <View style={styles.emptyTimelineC}>
            <MapPin size={24} color={C_CAP} strokeWidth={2} />
            <Text style={styles.emptyTimelineTextC}>{from} → {to}</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBarC, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {/* Arrived / Start Boarding — first step, shown until the driver has
            checked in as physically at the departure point. Start Trip
            (below) then takes over as the second step once boarding. */}
        {isStartEnabled && !isCancelled && !isBoardingStatus ? (
          <View style={{ flex: 1 }}>
            <Pressable
              disabled={!isStartEnabled}
              onPress={async () => {
                if (!effectiveTripId || boardingRef.current) return;
                boardingRef.current = true;
                setBoarding(true);
                try {
                  await endpoints.trips.board(String(effectiveTripId));
                  refetch();
                } catch {
                  showAlert('', t.arrived_failed);
                } finally {
                  boardingRef.current = false;
                  setBoarding(false);
                }
              }}
              style={[styles.startBtnC, { opacity: boarding ? 0.7 : 1 }]}
            >
              {boarding ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.startBtnTextC}>{t.arrived_start_boarding}</Text>
              )}
            </Pressable>
          </View>
        ) : (
        <View style={{ flex: 1 }}>
          <Pressable
            disabled={!isStartEnabled || isCancelled}
            onPress={async () => {
              if (!effectiveTripId || startingRef.current || isCancelled) return;
              startingRef.current = true;
              setStarting(true);
              try {
                // PATCH /driver/trips/:id/start performs the status transition
                // and broadcasts SHUTTLE_TRIP_STATUS/ADMIN_TRACK_TRIP itself —
                // the DRIVER_TRIP_START socket emit that used to duplicate this
                // broadcast was removed (D5-6/D8-4: dead handler, payload mismatch).
                await endpoints.trips.start(String(effectiveTripId));
                setStartedTripId(String(effectiveTripId));
                refetch();
                // Pass the tripId explicitly — ShuttleContext's ambient
                // "activeLine" (first line with status in-progress) can still
                // be stale or point at a different trip right after Start,
                // which would join live-tracking to the wrong trip.
                router.push({
                  pathname: '/shuttle/trip-active' as any,
                  params: { tripId: String(effectiveTripId) },
                });
              } catch {
                setStartedTripId(null);
                showAlert('', t.start_trip_failed);
              } finally {
                startingRef.current = false;
                setStarting(false);
              }
            }}
            style={({ pressed }) => [{ opacity: (!isStartEnabled || isCancelled) ? 1 : starting ? 0.7 : pressed ? 0.88 : 1 }]}
          >
            {isStartEnabled && !isCancelled ? (
              <View style={styles.startBtnC}>
                {starting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.startBtnTextC}>{t.start_trip}</Text>
                )}
              </View>
            ) : (
              <View style={styles.startBtnDisabledC}>
                <Text style={styles.startBtnDisabledTextC}>{t.start_trip}</Text>
                <Text style={styles.startBtnHintC}>
                  {isCancelled ? t.trip_was_cancelled : t.start_trip_hint}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
        )}

        {/* Cancel Trip — nothing to cancel once the trip is already cancelled */}
        {!isCancelled && (
        <Pressable
          onPress={handleCancelPress}
          style={({ pressed }) => [styles.cancelBtnC, { backgroundColor: pressed ? '#FEF2F2' : 'transparent' }]}
        >
          <Text style={styles.cancelBtnTextC}>{t.cancel_trip_action}</Text>
        </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C_BG },

  // Dark header + hero
  headerC: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: C_INK,
  },
  backBtnC: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  headerTitleC: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroC: { backgroundColor: C_INK, paddingHorizontal: Spacing.lg, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  routeNameC: { fontSize: 22, lineHeight: 30, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  routeSubtitleC: { fontSize: Typography.size.sm, fontFamily: 'Inter_600SemiBold', color: '#B7BBC2', marginTop: Spacing.xs },
  statusBadgeC: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statusDotC: { width: 7, height: 7, borderRadius: 4, backgroundColor: C_MINT },
  statusTextC: { fontSize: Typography.size.xs, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  cancelledBannerC: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  cancelledTextC: { fontSize: 13, color: C_RED, fontFamily: 'Inter_700Bold', flex: 1 },

  // White body cards
  infoRow: { gap: 10 },
  infoCardC: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    gap: Spacing.xs,
    backgroundColor: '#ffffff',
    borderRadius: 16,
  },
  infoCardLabelC: { fontSize: 10, fontFamily: 'Inter_700Bold', color: C_CAP, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' },
  infoCardValueC: { fontSize: 15, fontFamily: 'Inter_700Bold', color: C_INK, textAlign: 'center' },
  vehicleCardC: { padding: Spacing.lg, backgroundColor: '#ffffff', borderRadius: 16 },
  vehicleIconWrapC: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2F3' },
  vehicleCapC: { fontSize: 11, fontFamily: 'Inter_700Bold', color: C_CAP, textTransform: 'uppercase', letterSpacing: 0.8 },
  vehicleValC: { fontSize: Typography.size.md, fontFamily: 'Inter_700Bold', color: C_INK, marginTop: 3 },
  sectionTitleC: { fontSize: Typography.size.md, fontFamily: 'Inter_700Bold', color: C_INK },
  emptyTimelineC: { marginTop: Spacing.md, padding: Spacing.xl, alignItems: 'center', gap: 10, backgroundColor: '#ffffff', borderRadius: 16 },
  emptyTimelineTextC: { fontSize: 13, fontFamily: 'Inter_400Regular', color: C_CAP, textAlign: 'center' },

  // Bottom action bar
  bottomBarC: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    paddingTop: 14,
    backgroundColor: C_BG,
  },
  startBtnC: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: C_INK,
  },
  startBtnTextC: { color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' },
  startBtnDisabledC: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#D3D6DA',
  },
  startBtnDisabledTextC: { fontSize: 15, fontFamily: 'Inter_700Bold', color: C_CAP },
  startBtnHintC: { fontSize: 11, fontFamily: 'Inter_400Regular', color: C_CAP, marginTop: 2, textAlign: 'center' },
  cancelBtnC: {
    height: 54,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
  },
  cancelBtnTextC: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold', color: C_RED },
});
