import { showAlert } from '@/lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, Calendar, ChevronLeft, MapPin, Users } from 'lucide-react-native';
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
import { useI18n } from '@/lib/i18nContext';
import { useShuttle, findLineForRoute } from '@/lib/shuttleContext';
import { endpoints } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { useSplitColors, type SplitColors } from '@/lib/splitTheme';

// "C" split-panel palette — matches the ride/shuttle screens.
const C_MINT = '#3DDC97';
const C_RED = '#D92D20';

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
  const S = useSplitColors();
  const styles = useMemo(() => makeStyles(S), [S]);
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = 'row' as const;

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

  // Minutes until scheduled departure, for the hero countdown readout —
  // same source as isStartEnabled's own diff, just kept as a display value.
  const minutesUntilDeparture = useMemo(() => {
    if (!tripDetailData?.tripDatetime) return null;
    const dept = new Date(tripDetailData.tripDatetime);
    return Math.round((dept.getTime() - Date.now()) / 60000);
  }, [tripDetailData?.tripDatetime]);

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
        <View style={[styles.heroC, { paddingTop: topPad + 8, paddingBottom: Spacing.md }]}>
          <View style={{ flexDirection: R, alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => router.back()} style={styles.backBtnC} hitSlop={8}>
              <ChevronLeft size={22} color="#ffffff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </Pressable>
            <Text style={styles.heroCapC}>{t.trip_details_title}</Text>
            <View style={{ width: 36 }} />
          </View>
        </View>
        <View style={styles.emptyState}>
          <ActivityIndicator size="small" color={S.ink} />
        </View>
      </View>
    );
  }

  if (!effectiveBooking && !line) {
    return (
      <View style={styles.container}>
        <View style={[styles.heroC, { paddingTop: topPad + 8, paddingBottom: Spacing.md }]}>
          <View style={{ flexDirection: R, alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => router.back()} style={styles.backBtnC} hitSlop={8}>
              <ChevronLeft size={22} color="#ffffff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </Pressable>
            <Text style={styles.heroCapC}>{t.trip_details_title}</Text>
            <View style={{ width: 36 }} />
          </View>
        </View>
        <View style={styles.emptyState}>
          <Text style={{ color: S.cap, fontFamily: 'Inter_400Regular', fontSize: Typography.size.sm }}>
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
      {/* Dark hero: back button + route diagram + departure countdown */}
      <View style={[styles.heroC, { paddingTop: topPad + 8 }]}>
        <View style={{ flexDirection: R, alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()} style={styles.backBtnC} hitSlop={8}>
            <ChevronLeft size={22} color="#ffffff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </Pressable>
          <Text style={styles.heroCapC}>{t.trip_details_title}</Text>
          <View style={styles.statusBadgeC}>
            <View style={styles.statusDotC} />
            <Text style={styles.statusTextC}>
              {effectiveBooking?.status === 'active' ? t.active : t.status_booked}
            </Text>
          </View>
        </View>

        <Text style={[styles.routeNameC, { textAlign: TA }]} numberOfLines={1}>
          {routeName}{!!directionLabel && ` · ${directionLabel}`}
        </Text>

        {/* Route diagram: From --route--> To */}
        <View style={{ flexDirection: R, alignItems: 'center', gap: 10, marginTop: 18 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroCapC}>{t.from}</Text>
            <Text style={[styles.routeStopC, { textAlign: TA }]} numberOfLines={1}>{from}</Text>
          </View>
          <View style={styles.routeLineWrapC}>
            <View style={styles.routeDotStartC} />
            <View style={styles.routeDashC} />
            <View style={styles.routeVehicleIconC}>
              <MapPin size={13} color={S.ink} strokeWidth={2.4} />
            </View>
            <View style={styles.routeDashC} />
            <View style={styles.routeDotEndC} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroCapC, { textAlign: isRTL ? 'left' : 'right' }]}>{t.to}</Text>
            <Text style={[styles.routeStopC, { textAlign: isRTL ? 'left' : 'right' }]} numberOfLines={1}>{to}</Text>
          </View>
        </View>

        {/* Countdown readout */}
        {minutesUntilDeparture != null ? (
          <View style={{ marginTop: 20 }}>
            <View style={{ flexDirection: R, alignItems: 'baseline', gap: 8 }}>
              <Text style={styles.countdownValC}>{Math.max(0, minutesUntilDeparture)}</Text>
              <Text style={styles.countdownLabelC}>min until departure</Text>
            </View>
            <Text style={styles.heroDateC}>{tripDate} · {departureTime}</Text>
          </View>
        ) : (
          <Text style={[styles.heroDateC, { marginTop: 18 }]}>{tripDate} · {departureTime}</Text>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
      >
        {isCancelled && (
          <View style={[styles.cancelledBannerC, { flexDirection: R, marginBottom: Spacing.md }]}>
            <AlertCircle size={16} color={C_RED} strokeWidth={2} />
            <Text style={[styles.cancelledTextC, { textAlign: TA }]}>{t.trip_was_cancelled}</Text>
          </View>
        )}

        {/* Stat strip: Passengers / Vehicle / Line, one card with dividers */}
        <View style={[styles.statStripC, { flexDirection: R }]}>
          <View style={styles.statCellC}>
            <Users size={16} color={S.cap} strokeWidth={2} />
            <Text style={styles.statValC}>{bookedSeats} / {totalSeats}</Text>
            <Text style={styles.statLabelC}>{t.passengers_label_count}</Text>
          </View>
          <View style={styles.statDividerC} />
          <View style={styles.statCellC}>
            <Text style={{ fontSize: 16 }}>🚐</Text>
            <Text style={styles.statValC}>{vehicleType}</Text>
            <Text style={styles.statLabelC}>Vehicle</Text>
          </View>
          <View style={styles.statDividerC} />
          <View style={styles.statCellC}>
            <Calendar size={16} color={S.cap} strokeWidth={2} />
            <Text style={styles.statValC}>{lineNumber}</Text>
            <Text style={styles.statLabelC}>Line</Text>
          </View>
        </View>

        {/* Route Timeline — drawn locally with a connecting rail (not the
            shared StationTimeline, which stays as-is for history-detail.tsx) */}
        <Text style={[styles.sectionTitleC, { textAlign: TA, marginTop: 26 }]}>{t.route_timeline}</Text>

        {stationsLoading ? (
          <ActivityIndicator size="small" color={S.ink} style={{ marginTop: Spacing.lg }} />
        ) : stations.length > 0 ? (
          <View style={styles.timelineCardC}>
            <View style={[styles.timelineRailC, isRTL ? { right: 33 } : { left: 33 }]} />
            {stations.map((st, idx) => {
              const isLast = idx === stations.length - 1;
              return (
                <View
                  key={String(st.id)}
                  style={[
                    { flexDirection: R, gap: 14 },
                    !isLast && { paddingBottom: 22 },
                  ]}
                >
                  <View style={[
                    styles.timelineDotC,
                    idx === 0 ? { backgroundColor: S.ink } : isLast ? { backgroundColor: C_MINT } : { backgroundColor: '#F0F2F3', borderWidth: 1.5, borderColor: '#D3D6DA' },
                  ]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.timelineCapC, { textAlign: TA }, isLast && { color: S.teal }]}>
                      {idx === 0 ? t.from : isLast ? t.to : ''}
                    </Text>
                    <Text style={[styles.timelineNameC, { textAlign: TA }]} numberOfLines={1}>{st.name}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyTimelineC}>
            <MapPin size={24} color={S.cap} strokeWidth={2} />
            <Text style={styles.emptyTimelineTextC}>{from} → {to}</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom action bar — Start Trip is the one real button; Cancel is a
          demoted text link beneath it, not an equal-weight second button. */}
      <View style={[styles.bottomBarC, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {/* Arrived / Start Boarding — first step, shown until the driver has
            checked in as physically at the departure point. Start Trip
            (below) then takes over as the second step once boarding. */}
        {isStartEnabled && !isCancelled && !isBoardingStatus ? (
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
        ) : (
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
        )}

        {/* Cancel Trip — nothing to cancel once the trip is already cancelled */}
        {!isCancelled && (
        <Pressable
          onPress={handleCancelPress}
          hitSlop={8}
          style={styles.cancelLinkC}
        >
          <Text style={styles.cancelLinkTextC}>{t.cancel_trip_action}</Text>
        </Pressable>
        )}
      </View>
    </View>
  );
}

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: S.bg },

  // Dark hero: back button + route diagram + countdown
  backBtnC: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroC: { backgroundColor: S.panel, paddingHorizontal: Spacing.lg, paddingBottom: 22, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  heroCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, color: '#8A9096', textTransform: 'uppercase' },
  routeNameC: { fontSize: 20, lineHeight: 26, fontFamily: 'Inter_700Bold', color: '#ffffff', marginTop: 22 },
  routeStopC: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#ffffff', marginTop: 3 },
  routeLineWrapC: { flex: 1.4, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  routeDotStartC: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C_MINT },
  routeDotEndC: { width: 7, height: 7, borderRadius: 2, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  routeDashC: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.28)' },
  routeVehicleIconC: { width: 26, height: 26, borderRadius: 8, backgroundColor: C_MINT, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  countdownValC: { fontSize: 36, lineHeight: 38, fontFamily: 'Inter_700Bold', color: C_MINT },
  countdownLabelC: { fontSize: 14, fontFamily: 'Inter_700Bold', color: C_MINT },
  heroDateC: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#8A9096', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 2 },
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

  // White body: merged stat strip + redrawn timeline
  statStripC: { backgroundColor: S.card, borderRadius: 18, paddingVertical: 16 },
  statCellC: { flex: 1, alignItems: 'center', gap: 4 },
  statDividerC: { width: 1, backgroundColor: S.hair },
  statValC: { fontSize: 14, fontFamily: 'Inter_700Bold', color: S.ink },
  statLabelC: { fontSize: 10, fontFamily: 'Inter_700Bold', color: S.cap, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionTitleC: { fontSize: Typography.size.md, fontFamily: 'Inter_700Bold', color: S.ink },
  timelineCardC: { backgroundColor: S.card, borderRadius: 18, marginTop: 10, padding: 18, position: 'relative' },
  timelineRailC: { position: 'absolute', top: 30, bottom: 30, width: 2, backgroundColor: S.hair },
  timelineDotC: { width: 16, height: 16, borderRadius: 8, flexShrink: 0, zIndex: 1 },
  timelineCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', color: S.cap, textTransform: 'uppercase', letterSpacing: 0.6, minHeight: 13 },
  timelineNameC: { fontSize: 14, fontFamily: 'Inter_700Bold', color: S.ink, marginTop: 2 },
  emptyTimelineC: { marginTop: Spacing.md, padding: Spacing.xl, alignItems: 'center', gap: 10, backgroundColor: S.card, borderRadius: 16 },
  emptyTimelineTextC: { fontSize: 13, fontFamily: 'Inter_400Regular', color: S.cap, textAlign: 'center' },

  // Bottom action bar — Start Trip primary, Cancel demoted to a text link
  bottomBarC: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 14,
    backgroundColor: S.bg,
  },
  startBtnC: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: S.panel,
  },
  startBtnTextC: { color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' },
  startBtnDisabledC: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#D3D6DA',
  },
  startBtnDisabledTextC: { fontSize: 15, fontFamily: 'Inter_700Bold', color: S.cap },
  startBtnHintC: { fontSize: 11, fontFamily: 'Inter_400Regular', color: S.cap, marginTop: 2, textAlign: 'center' },
  cancelLinkC: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  cancelLinkTextC: { fontSize: 13, fontFamily: 'Inter_700Bold', color: C_RED },
  });
}
