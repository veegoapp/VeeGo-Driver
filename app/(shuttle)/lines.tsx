import { LinearGradient } from 'expo-linear-gradient';
import {
  Calendar, CheckCircle, Clock, GitBranch, MapPin, Search,
  Users, X,
} from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { type ShuttleRoute, type ShuttleTimeslot, type ShuttleBooking, useShuttle } from '@/lib/shuttleContext';
import { useI18n } from '@/lib/i18nContext';
import { endpoints, ApiError } from '@/lib/api';

const TAB_BAR_HEIGHT = 96;

// ─── Types ────────────────────────────────────────────────────────────────────

// Shape returned by GET /shuttle/lines/:routeId/available-weeks
type BackendWeek = {
  weekStart: string; // "YYYY-MM-DD" — always a Sunday, comes from the server
  weekEnd: string;   // "YYYY-MM-DD" — always a Thursday
  slots: BackendSlot[];
};

type BackendSlot = {
  id: number;
  departureTime: string; // "HH:MM"
  totalSeats: number | null;
  availableSeats: number | null;
  isBooked: boolean;
  isTaken: boolean;
};

type AvailableWeeksResponse = {
  routeId: number;
  routeName: string;
  weeks: BackendWeek[];
  total: number;
};

type BackendStation = {
  id: number;
  name: string;
  order: number;
  latitude?: number;
  longitude?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseStations(raw: unknown): BackendStation[] {
  if (!raw) return [];
  const r = raw as { data?: { stations?: BackendStation[] }; stations?: BackendStation[] };
  return r.data?.stations ?? r.stations ?? [];
}

/**
 * Formats a weekStart/weekEnd pair into a human-readable label.
 * e.g. weekStart="2026-06-21", weekEnd="2026-06-25" → "Jun 21–25"
 */
function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const sun = new Date(weekStart + 'T00:00:00Z');
  const thu = new Date(weekEnd + 'T00:00:00Z');
  const fmtMon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' });
  if (thu.getUTCMonth() === sun.getUTCMonth()) {
    return `${fmtMon(sun)} ${fmtDay(sun)}–${fmtDay(thu)}`;
  }
  return `${fmtMon(sun)} ${fmtDay(sun)} – ${fmtMon(thu)} ${fmtDay(thu)}`;
}

/**
 * Returns a short sub-label for a week chip.
 * The first upcoming week gets "Next Week", others get "Sun – Thu".
 */
function formatWeekSubLabel(weekStart: string, index: number): string {
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const wsDate = new Date(weekStart + 'T00:00:00Z');
  const diffDays = Math.round((wsDate.getTime() - todayUtc.getTime()) / 86400000);
  if (index === 0 && diffDays <= 7) return 'Next Week';
  return 'Sun – Thu';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ShuttleLinesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const headerAnim = useRef(new Animated.Value(0)).current;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [bookingRoute, setBookingRoute] = useState<ShuttleRoute | null>(null);

  // selectedWeek is now a BackendWeek (from server) — never generated client-side
  const [selectedWeek, setSelectedWeek] = useState<BackendWeek | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BackendSlot | null>(null);

  const { routes, myBookings, listLoading: contextLoading, error: contextError, refetch } = useShuttle();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    console.log(
      '[LINES_DEBUG] SCREEN_MOUNT',
      JSON.stringify({
        routes: routes.length,
        myBookings: myBookings.length,
        contextLoading,
        contextError: contextError ? String(contextError) : null,
      })
    );
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    refetch();
    // Also invalidate the available-weeks cache for whichever route is open
    if (bookingRoute) {
      queryClient.invalidateQueries({ queryKey: ['shuttle-available-weeks', bookingRoute.id] });
    }
    setTimeout(() => setRefreshing(false), 1200);
  };

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const filteredRoutes = search.trim()
    ? routes.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.from ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (r.to ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : routes;

  // ── Fetch available weeks from backend (replaces generateWorkWeeks) ──────
  // Only runs when a route is selected. Returns weeks + slots together so
  // there is NO client-side week generation and NO separate timeslot fetch.
  const {
    data: availableWeeksData,
    isLoading: weeksLoading,
    error: weeksError,
  } = useQuery<AvailableWeeksResponse>({
    queryKey: ['shuttle-available-weeks', bookingRoute?.id],
    queryFn: () => endpoints.shuttle.availableWeeks(bookingRoute!.id) as Promise<AvailableWeeksResponse>,
    enabled: !!bookingRoute,
    staleTime: 30_000,
  });

  const serverWeeks: BackendWeek[] = availableWeeksData?.weeks ?? [];

  // Auto-select the first week when weeks load (better UX)
  useEffect(() => {
    if (serverWeeks.length > 0 && !selectedWeek) {
      setSelectedWeek(serverWeeks[0]!);
    }
  }, [serverWeeks.length]);

  // Reset selections when route changes
  useEffect(() => {
    setSelectedWeek(null);
    setSelectedSlot(null);
  }, [bookingRoute?.id]);

  // Slots for the currently selected week come directly from the server response
  const currentSlots: BackendSlot[] = selectedWeek?.slots ?? [];

  // Stations for the route info panel
  const { data: lineDetailRaw, isLoading: stationsLoading } = useQuery({
    queryKey: ['shuttle-line-detail', bookingRoute?.id],
    queryFn: () => endpoints.shuttle.line(String(bookingRoute!.id)),
    enabled: !!bookingRoute,
    staleTime: 5 * 60 * 1000,
  });
  const stations = parseStations(lineDetailRaw);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const bookMutation = useMutation({
    mutationFn: ({ routeId, timeSlotId, weekStart }: {
      routeId: string | number;
      timeSlotId: string | number;
      weekStart: string;
    }) => endpoints.shuttle.createBooking({ routeId, timeSlotId, weekStart }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-available-weeks', bookingRoute?.id] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      setBookingRoute(null);
      setSelectedWeek(null);
      setSelectedSlot(null);
      Alert.alert(
        '✅ Booked!',
        'Your weekly slot is confirmed. This trip will now appear in your schedule.',
        [{ text: 'OK' }]
      );
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.status === 409) {
        Alert.alert(
          'Slot Taken',
          'This time slot has just been booked by another driver. Please choose a different time.',
          [{ text: 'OK' }]
        );
      } else if (err instanceof ApiError && err.status === 400) {
        const body = (err as ApiError).body as Record<string, unknown> | null;
        const msg =
          (typeof body?.message === 'string' ? body.message : null) ??
          (typeof body?.error === 'string' ? body.error : null) ??
          'Invalid booking request.';
        Alert.alert('Booking Failed', msg, [{ text: 'OK' }]);
      } else {
        const detail = err instanceof ApiError ? ` (${(err as ApiError).status})` : '';
        Alert.alert('Booking Failed', `Could not complete the booking${detail}. Please try again.`, [{ text: 'OK' }]);
      }
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleBook = () => {
    if (!bookingRoute || !selectedWeek || !selectedSlot) return;
    const weekLabel = formatWeekLabel(selectedWeek.weekStart, selectedWeek.weekEnd);
    const lines = [
      `Route: ${bookingRoute.name}`,
      `Direction: ${bookingRoute.from} → ${bookingRoute.to}`,
      `Week: ${weekLabel}  (Sun – Thu)`,
      `Departure: ${selectedSlot.departureTime}`,
      bookingRoute.stationCount ? `Stations: ${bookingRoute.stationCount} stops` : '',
    ].filter(Boolean);
    Alert.alert(
      'Confirm Booking',
      lines.join('\n') + '\n\nOther drivers will see this slot as reserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: () =>
            bookMutation.mutate({
              routeId: bookingRoute.id,
              timeSlotId: selectedSlot.id,
              // weekStart comes directly from the server — no client-side date math
              weekStart: selectedWeek.weekStart,
            }),
        },
      ]
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 8,
          paddingBottom: TAB_BAR_HEIGHT + 24,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <Animated.View style={{
          opacity: headerAnim,
          transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
        }}>
          <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
            {t.shuttle_routes}
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
            Choose a route and pick your weekly schedule
          </Text>
        </Animated.View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
            placeholder="Search by name or route…"
            placeholderTextColor={colors.mutedForeground + '99'}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <X size={14} color={colors.mutedForeground} strokeWidth={2} />
            </Pressable>
          )}
        </View>

        {/* Stats chips */}
        <View style={[styles.chips, { marginTop: 16 }]}>
          <View style={[styles.chip, { backgroundColor: '#1e1e2820', borderColor: '#1e1e2833' }]}>
            <GitBranch size={12} color="#2d2d42" strokeWidth={2} />
            <Text style={[styles.chipText, { color: '#2d2d42', fontFamily: 'Inter_700Bold' }]}>
              {routes.length} routes
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Users size={12} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.chipText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {myBookings.length} booked
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <CheckCircle size={12} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.chipText, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
              {myBookings.filter(b => b.status === 'completed').length} done
            </Text>
          </View>
        </View>

        {contextLoading && (
          <View style={{ alignItems: 'center', marginTop: 48 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {!!contextError && !contextLoading && (
          <View style={{ alignItems: 'center', marginTop: 48 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>
              Failed to load routes. Pull down to retry.
            </Text>
          </View>
        )}

        {!contextLoading && !contextError && filteredRoutes.length === 0 && (
          <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
            <Text style={{ fontSize: 32 }}>🔍</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
              No routes found
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
              Try a different search term
            </Text>
          </View>
        )}

        {!contextLoading && !contextError && filteredRoutes.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              Available Routes
            </Text>
            <View style={{ gap: 10 }}>
              {filteredRoutes.map((route, idx) => (
                <RouteCard
                  key={String(route.id)}
                  route={route}
                  index={idx}
                  myBookings={myBookings}
                  onBook={() => {
                    setSelectedWeek(null);
                    setSelectedSlot(null);
                    setBookingRoute(route);
                  }}
                  colors={colors}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Booking Bottom Sheet */}
      <Modal
        visible={!!bookingRoute}
        transparent
        animationType="slide"
        onRequestClose={() => setBookingRoute(null)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setBookingRoute(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                  {bookingRoute?.name}
                </Text>
                <Text style={[styles.sheetSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {bookingRoute?.from} → {bookingRoute?.to}
                </Text>
              </View>
              <Pressable
                onPress={() => setBookingRoute(null)}
                style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
                hitSlop={8}
              >
                <X size={16} color={colors.foreground} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              style={styles.sheetScroll}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {/* Stations */}
              <Text style={[styles.sheetSection, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                Stations
              </Text>
              {stationsLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : stations.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingBottom: 12 }}>
                  No station data available
                </Text>
              ) : (
                stations.map((st, idx) => (
                  <View key={st.id} style={styles.stationRow}>
                    <View style={styles.stationDotCol}>
                      <View style={[styles.stationDot, {
                        backgroundColor:
                          idx === 0 || idx === stations.length - 1 ? '#1e1e28' : colors.secondary,
                        borderColor: '#1e1e2840',
                      }]} />
                      {idx < stations.length - 1 && (
                        <View style={[styles.stationConnector, { backgroundColor: colors.border }]} />
                      )}
                    </View>
                    <View style={styles.stationInfo}>
                      <Text style={[styles.stationName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                        {st.name}
                      </Text>
                      <Text style={[styles.stationTime, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        Stop {st.order}
                      </Text>
                    </View>
                  </View>
                ))
              )}

              {/* Week picker — weeks come from the server, not generated locally */}
              <Text style={[styles.sheetSection, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                Select Work Week
              </Text>

              {weeksLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : weeksError ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingBottom: 12 }}>
                  Could not load available weeks. Pull down to retry.
                </Text>
              ) : serverWeeks.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingBottom: 12 }}>
                  No weeks scheduled yet for this route. Check back soon.
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -16, paddingLeft: 16 }}
                  contentContainerStyle={{ paddingRight: 16, gap: 10, flexDirection: 'row', paddingBottom: 4 }}
                >
                  {serverWeeks.map((week, idx) => {
                    const active = selectedWeek?.weekStart === week.weekStart;
                    const label = formatWeekLabel(week.weekStart, week.weekEnd);
                    const subLabel = formatWeekSubLabel(week.weekStart, idx);
                    return (
                      <Pressable
                        key={week.weekStart}
                        onPress={() => { setSelectedWeek(week); setSelectedSlot(null); }}
                        style={[styles.weekChip, {
                          backgroundColor: active ? '#1e1e28' : colors.secondary,
                          borderColor: active ? '#1e1e28' : colors.border,
                        }]}
                      >
                        <Calendar size={12} color={active ? '#fff' : colors.mutedForeground} strokeWidth={2} />
                        <View>
                          <Text style={[styles.weekChipLabel, {
                            color: active ? '#fff' : colors.foreground,
                            fontFamily: 'Inter_700Bold',
                          }]}>
                            {label}
                          </Text>
                          <Text style={[styles.weekChipSub, {
                            color: active ? '#ffffff88' : colors.mutedForeground,
                            fontFamily: 'Inter_400Regular',
                          }]}>
                            {subLabel}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {/* Timeslot picker — slots come directly from the selected week object */}
              {selectedWeek && (
                <>
                  <Text style={[styles.sheetSection, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    Departure Time
                  </Text>
                  {currentSlots.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingBottom: 12 }}>
                      No time slots available for this week
                    </Text>
                  ) : (
                    <View style={styles.timesGrid}>
                      {currentSlots.map(slot => {
                        const bookedByMe = slot.isBooked;
                        const takenByOther = slot.isTaken;
                        const isDisabled = bookedByMe || takenByOther;
                        const isPicked = !bookedByMe && selectedSlot?.id === slot.id;
                        const iconColor = bookedByMe ? '#16a34a' : isPicked ? '#fff' : takenByOther ? colors.mutedForeground : colors.foreground;
                        const textColor = iconColor;
                        return (
                          <Pressable
                            key={String(slot.id)}
                            onPress={() => !isDisabled && setSelectedSlot(slot)}
                            disabled={isDisabled}
                            style={[styles.timeChip, {
                              backgroundColor: bookedByMe ? '#22c55e18' : isPicked ? '#1e1e28' : takenByOther ? colors.secondary : 'transparent',
                              borderColor: bookedByMe ? '#22c55e55' : isPicked ? '#1e1e28' : takenByOther ? colors.border : '#1e1e2833',
                              opacity: takenByOther && !bookedByMe ? 0.45 : 1,
                            }]}
                          >
                            <Clock size={13} color={iconColor} strokeWidth={2} />
                            <Text style={[styles.timeChipText, { color: textColor, fontFamily: 'Inter_600SemiBold' }]}>
                              {slot.departureTime}
                            </Text>
                            {bookedByMe && (
                              <Text style={[styles.timeChipTaken, { color: '#16a34a', fontFamily: 'Inter_700Bold' }]}>
                                Yours
                              </Text>
                            )}
                            {takenByOther && !bookedByMe && (
                              <Text style={[styles.timeChipTaken, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                                Taken
                              </Text>
                            )}
                            {!isDisabled && slot.availableSeats !== null && slot.availableSeats !== undefined && (
                              <Text style={[styles.timeChipTaken, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                                {slot.availableSeats} seats
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
              )}

              <View style={{ height: 16 }} />
            </ScrollView>

            {/* Confirm button */}
            <Pressable
              onPress={handleBook}
              disabled={!selectedWeek || !selectedSlot || bookMutation.isPending}
              style={[styles.bookBtn, { opacity: !selectedWeek || !selectedSlot || bookMutation.isPending ? 0.45 : 1 }]}
            >
              <LinearGradient
                colors={['#2d2d42', '#1e1e28']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.bookBtnGrad}
              >
                {bookMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.bookBtnText, { fontFamily: 'Inter_700Bold' }]}>
                    {selectedWeek && selectedSlot
                      ? `Confirm — ${formatWeekLabel(selectedWeek.weekStart, selectedWeek.weekEnd)}  ·  ${selectedSlot.departureTime}`
                      : !selectedWeek
                      ? 'Pick a work week first'
                      : 'Pick a departure time'}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Route Card ────────────────────────────────────────────────────────────────

function RouteCard({
  route,
  index,
  myBookings,
  onBook,
  colors,
}: {
  route: ShuttleRoute;
  index: number;
  myBookings: ShuttleBooking[];
  onBook: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      delay: index * 50,
      stiffness: 200,
      damping: 20,
      useNativeDriver: true,
    }).start();
  }, []);

  const isBooked = myBookings.some(b =>
    String(b.routeId) === String(route.id) &&
    b.status !== 'cancelled' &&
    b.status !== 'completed'
  );
  const availableSlots = route.timeslots.filter(ts => !ts.isBooked).length;
  const totalSlots = route.timeslots.length;

  const statusConfig = isBooked
    ? { text: 'Yours', bg: '#22c55e20', color: '#16a34a' }
    : availableSlots === 0 && totalSlots > 0
    ? { text: 'Full', bg: colors.secondary, color: colors.mutedForeground }
    : { text: 'Available', bg: '#3D52D520', color: '#3D52D5' };

  const canBook = !isBooked && (availableSlots > 0 || totalSlots === 0);

  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
    }}>
      <Pressable
        onPress={canBook ? onBook : undefined}
        style={({ pressed }) => [{ transform: [{ scale: pressed && canBook ? 0.99 : 1 }] }]}
      >
        <GlassView style={styles.lineCard} borderRadius={20}>
          <View style={styles.lineCardHeader}>
            <View style={[styles.lineNumberBadge, { backgroundColor: isBooked ? '#22c55e20' : colors.secondary }]}>
              <Text style={[styles.lineNumberText, {
                color: isBooked ? '#16a34a' : colors.mutedForeground,
                fontFamily: 'Inter_700Bold',
              }]}>
                R{String(route.id).padStart(2, '0')}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.lineName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                {route.name}
              </Text>
              <Text style={[styles.lineRoute, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {route.from} → {route.to}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <Text style={[styles.statusText, { color: statusConfig.color, fontFamily: 'Inter_700Bold' }]}>
                {statusConfig.text}
              </Text>
            </View>
          </View>

          <View style={styles.lineStats}>
            <View style={styles.lineStat}>
              <MapPin size={12} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[styles.lineStatText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {route.stationCount} stops
              </Text>
            </View>
            {totalSlots > 0 && (
              <View style={styles.lineStat}>
                <Clock size={12} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[styles.lineStatText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {availableSlots}/{totalSlots} slots free
                </Text>
              </View>
            )}
            {canBook && (
              <View style={[styles.lineStat, { marginLeft: 'auto' as any }]}>
                <Text style={[styles.lineStatText, { color: '#3D52D5', fontFamily: 'Inter_600SemiBold' }]}>
                  Tap to book →
                </Text>
              </View>
            )}
          </View>
        </GlassView>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 24 },
  pageSub: { fontSize: 13, marginTop: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 16,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0, margin: 0 },
  sectionTitle: { fontSize: 14, marginTop: 16, marginBottom: 10 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 12 },
  lineCard: { padding: 16 },
  lineCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineNumberBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  lineNumberText: { fontSize: 12, letterSpacing: 1 },
  lineName: { fontSize: 14 },
  lineRoute: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11 },
  lineStats: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  lineStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lineStatText: { fontSize: 12 },
  sheetOverlay: { flex: 1, backgroundColor: '#00000060', justifyContent: 'flex-end' },
  sheet: {
    height: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  sheetScroll: { flex: 1 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  sheetTitle: { fontSize: 18 },
  sheetSub: { fontSize: 13, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetSection: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 12 },
  stationRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  stationDotCol: { alignItems: 'center', width: 16 },
  stationDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, zIndex: 1 },
  stationConnector: { flex: 1, width: 2, marginVertical: 2, minHeight: 20 },
  stationInfo: { flex: 1, paddingBottom: 16 },
  stationName: { fontSize: 13 },
  stationTime: { fontSize: 11, marginTop: 2 },
  weekChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  weekChipLabel: { fontSize: 13 },
  weekChipSub: { fontSize: 11, marginTop: 2 },
  timesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  timeChipText: { fontSize: 13 },
  timeChipTaken: { fontSize: 10 },
  bookBtn: { marginTop: 12, borderRadius: 16, overflow: 'hidden' },
  bookBtnGrad: { height: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  bookBtnText: { fontSize: 14, color: '#fff' },
});
