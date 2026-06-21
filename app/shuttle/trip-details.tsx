import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Calendar, ChevronLeft, Clock, MapPin, Users } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { useShuttle } from '@/lib/shuttleContext';
import { endpoints } from '@/lib/api';

type Params = {
  bookingId: string;
  routeId: string;
  // Full booking snapshot passed by the home screen so this screen renders
  // correctly even when ShuttleProvider is not in scope (different route group).
  routeName?: string;
  departureTime?: string;
  weekStart?: string;
  weekEnd?: string;
  status?: string;
};

type Station = {
  id: string | number;
  name: string;
  order?: number;
  eta?: string;
};

export default function TripDetailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  const {
    bookingId, routeId,
    routeName: paramRouteName,
    departureTime: paramDepartureTime,
    weekStart: paramWeekStart,
    weekEnd: paramWeekEnd,
    status: paramStatus,
  } = useLocalSearchParams<Params>();

  const { myBookings, allLines, listLoading, setStartedTripId, refetch } = useShuttle();
  const [starting, setStarting] = useState(false);

  // Use String() coercion on both sides — defends against numeric IDs at runtime.
  // myBookings may be empty when this screen is outside ShuttleProvider's scope
  // (app/shuttle/ vs app/(shuttle)/ route groups); params are the reliable source.
  const booking = myBookings.find(b => String(b.id) === String(bookingId));
  const line = allLines.find(l => String(l.id) === String(routeId));

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
      }
    : null);

  const { data: tripDetailData, isLoading: stationsLoading } = useQuery({
    queryKey: ['shuttle-trip-detail', bookingId],
    queryFn: () => endpoints.shuttle.tripDetail(bookingId!),
    enabled: !!bookingId,
  });

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
    const time = effectiveBooking?.departureTime;
    if (!time) return false;
    // TODO: Backend Integration - Replace with full ISO datetime from backend for date-accurate 30-min check
    const match = time.match(/(\d{1,2}):(\d{2})/);
    if (!match) return false;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const deptMins = h * 60 + m;
    const diff = deptMins - nowMins;
    return diff >= 0 && diff <= 30;
  }, [effectiveBooking?.departureTime]);

  const handleCancelPress = () => {
    router.push({
      pathname: '/shuttle/trip-cancel' as any,
      params: {
        bookingId: bookingId ?? '',
        routeName: effectiveBooking?.routeName ?? line?.name ?? '',
        departureTime: effectiveBooking?.departureTime ?? '',
        fromStation: line?.from ?? '',
        toStation: line?.to ?? '',
      },
    });
  };

  // Show loading state while context is hydrating — prevents premature "Trip not found".
  if (listLoading && !effectiveBooking && !line) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <ChevronLeft size={24} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {t.trip_details_title}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <ActivityIndicator size="small" color="#1e1e28" />
        </View>
      </View>
    );
  }

  if (!effectiveBooking && !line) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <ChevronLeft size={24} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {t.trip_details_title}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>
            Trip not found
          </Text>
        </View>
      </View>
    );
  }

  const routeName = tripDetailData?.routeName ?? effectiveBooking?.routeName ?? line?.name ?? '—';
  const from = line?.from ?? '—';
  const to = line?.to ?? '—';
  const departureTime = effectiveBooking?.departureTime ?? line?.departure ?? '—';
  const tripDatetime = tripDetailData?.tripDatetime ?? null;
  const tripDate = tripDatetime
    ? new Date(tripDatetime).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
        timeZone: 'Africa/Cairo',
      })
    : (effectiveBooking?.weekStart ?? '—');
  const bookedSeats = tripDetailData?.bookedSeats ?? (line?.bookedSeats ?? 0);
  const totalSeats = tripDetailData?.totalSeats ?? (line?.totalSeats ?? 0);
  const vehicleType = line?.vehicleType ?? '—';
  const lineNumber = line?.lineNumber ?? '—';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ChevronLeft size={24} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {t.trip_details_title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Route name */}
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.routeName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
            {/* TODO: Use translated backend fields (routeNameAr, fromAr, toAr) here */}
            {routeName}
          </Text>
          <Text style={[styles.routeSubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
            {/* TODO: Use translated backend fields (routeNameAr, fromAr, toAr) here */}
            {from} → {to}
          </Text>
        </View>

        {/* Status badge */}
        <View style={[{ flexDirection: R, marginTop: 12 }]}>
          <View style={[styles.statusBadge, { backgroundColor: '#1e1e2812', borderColor: '#1e1e2825' }]}>
            <View style={[styles.statusDot, { backgroundColor: '#1e1e28' }]} />
            <Text style={[styles.statusText, { color: '#2d2d42', fontFamily: 'Inter_700Bold' }]}>
              {/* TODO: Backend Integration - Fetch real trip status from backend (confirmed, pending, etc.) */}
              {effectiveBooking?.status === 'active' ? t.active : t.status_booked}
            </Text>
          </View>
        </View>

        {/* Info cards row: Date / Time / Passengers */}
        <View style={[styles.infoRow, { flexDirection: R, marginTop: 20 }]}>
          <GlassView style={styles.infoCard} borderRadius={16}>
            <Calendar size={18} color="#2d2d42" strokeWidth={2} />
            <Text style={[styles.infoCardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {t.date}
            </Text>
            <Text style={[styles.infoCardValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {tripDate}
            </Text>
          </GlassView>
          <GlassView style={styles.infoCard} borderRadius={16}>
            <Clock size={18} color="#2d2d42" strokeWidth={2} />
            <Text style={[styles.infoCardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {t.time_label}
            </Text>
            <Text style={[styles.infoCardValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {departureTime}
            </Text>
          </GlassView>
          <GlassView style={styles.infoCard} borderRadius={16}>
            <Users size={18} color="#2d2d42" strokeWidth={2} />
            <Text style={[styles.infoCardLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {t.passengers_label_count}
            </Text>
            <Text style={[styles.infoCardValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {/* TODO: Backend Integration - Real-time passenger count for this specific trip instance */}
              {bookedSeats} / {totalSeats}
            </Text>
          </GlassView>
        </View>

        {/* Vehicle & Line info card */}
        <GlassView style={[styles.vehicleCard, { marginTop: 12 }]} borderRadius={16}>
          <View style={[{ flexDirection: R, alignItems: 'center', gap: 14 }]}>
            <View style={[styles.vehicleIconWrap, { backgroundColor: '#1e1e2810' }]}>
              <Text style={{ fontSize: 22 }}>🚐</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: TA }]}>
                {t.vehicle_line_label}
              </Text>
              <Text style={[{ fontSize: 16, color: colors.foreground, fontFamily: 'Inter_700Bold', marginTop: 3, textAlign: TA }]}>
                {/* TODO: Backend Integration - Use vehicle model, plate number, and assigned line from backend */}
                {vehicleType} · {lineNumber}
              </Text>
            </View>
          </View>
        </GlassView>

        {/* Route Timeline */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA, marginTop: 28 }]}>
          {t.route_timeline}
        </Text>

        {stationsLoading ? (
          <ActivityIndicator size="small" color="#1e1e28" style={{ marginTop: 16 }} />
        ) : stations.length > 0 ? (
          <GlassView style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 16 }} borderRadius={16}>
            {stations.map((st, idx) => (
              <View
                key={String(st.id)}
                style={[
                  styles.stationRow,
                  { flexDirection: R },
                  idx < stations.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={styles.stationIndicator}>
                  <View style={[
                    styles.stationDot,
                    {
                      backgroundColor: idx === 0 || idx === stations.length - 1 ? '#1e1e28' : colors.secondary,
                      borderColor: '#1e1e2840',
                    },
                  ]} />
                  {idx < stations.length - 1 && (
                    <View style={[styles.stationLine, { backgroundColor: colors.border }]} />
                  )}
                </View>
                <View style={{ flex: 1, paddingVertical: 12 }}>
                  <Text style={[{ fontSize: 14, color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
                    {/* TODO: Use translated backend fields (routeNameAr, fromAr, toAr) here */}
                    {st.name}
                  </Text>
                  {st.eta ? (
                    <Text style={[{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: TA }]}>
                      {/* TODO: Backend Integration - Use real ETA per station from backend */}
                      {st.eta}
                    </Text>
                  ) : null}
                </View>
                {(idx === 0 || idx === stations.length - 1) && (
                  <View style={[
                    styles.terminalBadge,
                    {
                      backgroundColor: idx === 0 ? '#1e1e2812' : '#dcfce7',
                      borderColor: idx === 0 ? '#1e1e2825' : '#86efac',
                    },
                  ]}>
                    <Text style={[{ fontSize: 10, fontFamily: 'Inter_700Bold', color: idx === 0 ? '#2d2d42' : '#16a34a' }]}>
                      {idx === 0 ? t.from.toUpperCase() : t.to.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </GlassView>
        ) : (
          <GlassView style={{ marginTop: 12, padding: 24, alignItems: 'center', gap: 10 }} borderRadius={16}>
            <MapPin size={24} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
              {/* TODO: Backend Integration - Station list will be loaded from the route stations endpoint */}
              {from} → {to}
            </Text>
          </GlassView>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20), borderTopColor: colors.border, backgroundColor: colors.background }]}>
        {/* Start Trip — disabled until 30 min before departure */}
        <View style={{ flex: 1 }}>
          <Pressable
            disabled={!isStartEnabled}
            onPress={async () => {
              if (!bookingId || starting) return;
              setStarting(true);
              try {
                const tripId = line?.tripId;
                if (!tripId) throw new Error('No trip assigned to this route yet');
                await endpoints.trips.start(String(tripId));
                setStartedTripId(String(tripId));
                refetch();
                router.push('/shuttle/trip-active' as any);
              } catch {
                setStartedTripId(null);
                Alert.alert('', t.start_trip_failed);
              } finally {
                setStarting(false);
              }
            }}
            style={({ pressed }) => [{ borderRadius: 16, overflow: 'hidden', opacity: !isStartEnabled ? 1 : starting ? 0.7 : pressed ? 0.88 : 1 }]}
          >
            {isStartEnabled ? (
              <LinearGradient
                colors={['#2d2d42', '#1e1e28']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.startBtn}
              >
                {starting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.startBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.start_trip}</Text>
                )}
              </LinearGradient>
            ) : (
              <View style={[styles.startBtnDisabled, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[{ fontSize: 15, color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.start_trip}</Text>
                <Text style={[{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: 'center' }]}>
                  {t.start_trip_hint}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Cancel Trip */}
        <Pressable
          onPress={handleCancelPress}
          style={({ pressed }) => [
            styles.cancelBtn,
            { borderColor: '#FCA5A5', backgroundColor: pressed ? '#FEF2F2' : 'transparent' },
          ]}
        >
          <Text style={[styles.cancelBtnText, { color: '#DC2626', fontFamily: 'Inter_700Bold' }]}>
            {t.cancel_trip_action}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  routeName: { fontSize: 24, lineHeight: 32 },
  routeSubtitle: { fontSize: 14, marginTop: 4 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: 1,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12 },
  infoRow: { gap: 10 },
  infoCard: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    gap: 4,
  },
  infoCardLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' },
  infoCardValue: { fontSize: 15, textAlign: 'center' },
  vehicleCard: { padding: 16 },
  vehicleIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16 },
  stationRow: { gap: 12, alignItems: 'flex-start' },
  stationIndicator: { width: 20, alignItems: 'center', paddingTop: 14 },
  stationDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  stationLine: { width: 2, flex: 1, minHeight: 16, marginTop: 4 },
  terminalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  startBtn: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  startBtnText: { color: '#fff', fontSize: 15 },
  startBtnDisabled: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
  },
  cancelBtn: {
    height: 54,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
  },
  cancelBtnText: { fontSize: 14 },
});
