import { LinearGradient } from 'expo-linear-gradient';
import {
  Calendar, CheckCircle, Clock, GitBranch, MapPin, Search,
  Trash2, Users, X, AlertTriangle,
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

type WorkWeek = {
  start: string;
  end: string;
  label: string;
  subLabel: string;
};

type BackendStation = {
  id: number;
  name: string;
  order: number;
  latitude?: number;
  longitude?: number;
};

function parseStations(raw: unknown): BackendStation[] {
  if (!raw) return [];
  const r = raw as { data?: { stations?: BackendStation[] }; stations?: BackendStation[] };
  return r.data?.stations ?? r.stations ?? [];
}

function parseTimeslots(raw: unknown): ShuttleTimeslot[] {
  if (!raw) return [];
  type RawSlot = { id: string | number; departureTime: string; availableSeats?: number; totalSeats?: number; isBooked?: boolean; booked?: boolean };
  const normalize = (s: RawSlot): ShuttleTimeslot => ({
    id: s.id,
    departureTime: s.departureTime,
    availableSeats: s.availableSeats ?? 0,
    totalSeats: s.totalSeats ?? 0,
    booked: s.isBooked ?? s.booked ?? false,
  });
  if (Array.isArray(raw)) return (raw as RawSlot[]).map(normalize);
  const r = raw as { data?: RawSlot[]; timeslots?: RawSlot[] };
  return (r.data ?? r.timeslots ?? []).map(normalize);
}

function generateWorkWeeks(count = 8): WorkWeek[] {
  const weeks: WorkWeek[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dow = now.getDay();
  const thisSunday = new Date(now);
  thisSunday.setDate(now.getDate() - dow);
  // Wed(3)+ → skip current week
  const startW = dow >= 3 ? 1 : 0;
  for (let w = startW; w < count + startW; w++) {
    const sun = new Date(thisSunday);
    sun.setDate(thisSunday.getDate() + w * 7);
    const thu = new Date(sun);
    thu.setDate(sun.getDate() + 4);
    const start = sun.toISOString().split('T')[0];
    const end = thu.toISOString().split('T')[0];
    const fmtMon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
    const label =
      thu.getMonth() === sun.getMonth()
        ? `${fmtMon(sun)} ${sun.getDate()}–${thu.getDate()}`
        : `${fmtMon(sun)} ${sun.getDate()} – ${fmtMon(thu)} ${thu.getDate()}`;
    const idx = w - startW;
    const subLabel =
      idx === 0 && startW === 0 ? 'This Week' :
      idx === 0 && startW === 1 ? 'Next Week' :
      idx === 1 && startW === 0 ? 'Next Week' :
      'Sun – Thu';
    weeks.push({ start, end, label, subLabel });
  }
  return weeks;
}

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
  const [selectedWeek, setSelectedWeek] = useState<WorkWeek | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<ShuttleTimeslot | null>(null);

  const weeks = generateWorkWeeks();

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

  // Fetch fresh timeslots when user opens booking sheet for a route
  const { data: timeslotsRaw, isLoading: timeslotsLoading } = useQuery({
    queryKey: ['shuttle-timeslots', bookingRoute?.id],
    queryFn: () => endpoints.shuttle.timeslots(bookingRoute!.id),
    enabled: !!bookingRoute,
    staleTime: 30000,
  });

  // Also fetch stations for the selected route (for the info panel in sheet)
  const { data: lineDetailRaw, isLoading: stationsLoading } = useQuery({
    queryKey: ['shuttle-line-detail', bookingRoute?.id],
    queryFn: () => endpoints.shuttle.line(String(bookingRoute!.id)),
    enabled: !!bookingRoute,
    staleTime: 5 * 60 * 1000,
  });

  const timeslots: ShuttleTimeslot[] = timeslotsRaw
    ? parseTimeslots(timeslotsRaw)
    : (bookingRoute?.timeslots ?? []);
  const stations = parseStations(lineDetailRaw);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const bookMutation = useMutation({
    mutationFn: ({ routeId, timeSlotId, weekStart }: {
      routeId: string | number;
      timeSlotId: string | number;
      weekStart: string;
    }) => endpoints.shuttle.createBooking({ routeId, timeSlotId, weekStart }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-timeslots', bookingRoute?.id] });
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
      if (err instanceof ApiError && err.status === 404) {
        Alert.alert(
          'Not Available Yet',
          'The weekly booking feature is not yet active on the server.',
          [{ text: 'OK' }]
        );
      } else if (err instanceof ApiError && err.status === 409) {
        Alert.alert(
          'Slot Taken',
          'This time slot has just been booked by another driver. Please choose a different time.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Booking Failed', 'Could not complete the booking. Please try again.', [{ text: 'OK' }]);
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => endpoints.shuttle.cancelBooking(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
    },
    onError: () => {
      Alert.alert('Cancel Failed', 'Could not cancel this booking. Please try again.', [{ text: 'OK' }]);
    },
  });

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

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleBook = () => {
    if (!bookingRoute || !selectedWeek || !selectedSlot) return;
    const lines = [
      `Route: ${bookingRoute.name}`,
      `Direction: ${bookingRoute.from} → ${bookingRoute.to}`,
      `Week: ${selectedWeek.label}  (Sun – Thu)`,
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
              weekStart: selectedWeek.start,
            }),
        },
      ]
    );
  };

  const handleCancel = (booking: ShuttleBooking) => {
    Alert.alert(
      'Cancel Booking',
      `Cancel your booking for ${booking.routeName} (${booking.departureTime}, week of ${booking.weekStart})?`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel Booking',
          style: 'destructive',
          onPress: () => cancelMutation.mutate(booking.id),
        },
      ]
    );
  };

  const handleRenew = (booking: ShuttleBooking) => {
    Alert.alert(
      'Confirm Renewal',
      `Renew your slot for ${booking.routeName} (${booking.departureTime}) for next week?`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Confirm Renewal',
          style: 'default',
          onPress: () => renewalMutation.mutate(booking.id),
        },
      ]
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

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

        {/* My Bookings */}
        {myBookings.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA, marginTop: 20 }]}>
              My Bookings
            </Text>
            <View style={{ gap: 8 }}>
              {myBookings.map(booking => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onCancel={() => handleCancel(booking)}
                  onRenew={() => handleRenew(booking)}
                  renewalPending={renewalMutation.isPending && (renewalMutation.variables as string) === booking.id}
                  cancelPending={cancelMutation.isPending && (cancelMutation.variables as string) === booking.id}
                  colors={colors}
                />
              ))}
            </View>
          </>
        )}

        {/* Stats chips */}
        <View style={[styles.chips, { marginTop: myBookings.length > 0 ? 20 : 16 }]}>
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

              {/* Week picker */}
              <Text style={[styles.sheetSection, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                Select Work Week
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -16, paddingLeft: 16 }}
                contentContainerStyle={{ paddingRight: 16, gap: 10, flexDirection: 'row', paddingBottom: 4 }}
              >
                {weeks.map(week => {
                  const active = selectedWeek?.start === week.start;
                  return (
                    <Pressable
                      key={week.start}
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
                          {week.label}
                        </Text>
                        <Text style={[styles.weekChipSub, {
                          color: active ? '#ffffff88' : colors.mutedForeground,
                          fontFamily: 'Inter_400Regular',
                        }]}>
                          {week.subLabel}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Timeslot picker */}
              {selectedWeek && (
                <>
                  <Text style={[styles.sheetSection, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    Departure Time
                  </Text>
                  {timeslotsLoading ? (
                    <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  ) : timeslots.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingBottom: 12 }}>
                      No time slots available for this route
                    </Text>
                  ) : (
                    <View style={styles.timesGrid}>
                      {timeslots.map(slot => {
                        const isBooked = slot.booked;
                        const isPicked = selectedSlot?.id === slot.id;
                        return (
                          <Pressable
                            key={String(slot.id)}
                            onPress={() => !isBooked && setSelectedSlot(slot)}
                            disabled={isBooked}
                            style={[styles.timeChip, {
                              backgroundColor: isPicked ? '#1e1e28' : isBooked ? colors.secondary : 'transparent',
                              borderColor: isPicked ? '#1e1e28' : isBooked ? colors.border : '#1e1e2833',
                              opacity: isBooked ? 0.45 : 1,
                            }]}
                          >
                            <Clock
                              size={13}
                              color={isPicked ? '#fff' : isBooked ? colors.mutedForeground : colors.foreground}
                              strokeWidth={2}
                            />
                            <Text style={[styles.timeChipText, {
                              color: isPicked ? '#fff' : isBooked ? colors.mutedForeground : colors.foreground,
                              fontFamily: 'Inter_600SemiBold',
                            }]}>
                              {slot.departureTime}
                            </Text>
                            {isBooked && (
                              <Text style={[styles.timeChipTaken, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                                Taken
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
                      ? `Confirm — ${selectedWeek.label}  ·  ${selectedSlot.departureTime}`
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

// ─── Booking Card ─────────────────────────────────────────────────────────────

function BookingCard({
  booking,
  onCancel,
  onRenew,
  renewalPending,
  cancelPending,
  colors,
}: {
  booking: ShuttleBooking;
  onCancel: () => void;
  onRenew: () => void;
  renewalPending: boolean;
  cancelPending: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const hasRenewal = !!booking.renewalDeadline && new Date(booking.renewalDeadline).getTime() > Date.now();
  const isActive = booking.status === 'active' || booking.status === 'confirmed';
  const isCompleted = booking.status === 'completed' || booking.status === 'cancelled';

  const statusConfig = isCompleted
    ? { text: booking.status === 'cancelled' ? 'Cancelled' : 'Done', bg: colors.secondary, color: colors.mutedForeground }
    : isActive
    ? { text: 'Active', bg: '#22c55e20', color: '#16a34a' }
    : { text: 'Upcoming', bg: '#3D52D520', color: '#3D52D5' };

  return (
    <GlassView style={styles.bookingCard} borderRadius={18}>
      {hasRenewal && (
        <View style={[styles.renewalBanner, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B33' }]}>
          <AlertTriangle size={12} color="#D97706" strokeWidth={2} />
          <Text style={[styles.renewalBannerText, { color: '#D97706', fontFamily: 'Inter_600SemiBold' }]}>
            Renewal available — deadline {new Date(booking.renewalDeadline!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </Text>
        </View>
      )}
      <View style={styles.bookingCardBody}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.bookingCardRow}>
            <Text style={[styles.bookingRouteName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
              {booking.routeName}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <Text style={[styles.statusText, { color: statusConfig.color, fontFamily: 'Inter_700Bold' }]}>
                {statusConfig.text}
              </Text>
            </View>
          </View>
          <View style={styles.bookingMeta}>
            <View style={styles.metaItem}>
              <Clock size={11} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {booking.departureTime}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Calendar size={11} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Week of {booking.weekStart}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.bookingActions}>
          {hasRenewal && (
            <Pressable
              onPress={onRenew}
              disabled={renewalPending}
              style={[styles.renewBtn, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B44' }]}
            >
              {renewalPending ? (
                <ActivityIndicator size="small" color="#D97706" />
              ) : (
                <Text style={[styles.renewBtnText, { color: '#D97706', fontFamily: 'Inter_700Bold' }]}>Renew</Text>
              )}
            </Pressable>
          )}
          {!isCompleted && (
            <Pressable
              onPress={onCancel}
              disabled={cancelPending}
              style={[styles.cancelBtn, { backgroundColor: colors.secondary }]}
            >
              {cancelPending ? (
                <ActivityIndicator size="small" color={colors.destructive} />
              ) : (
                <Trash2 size={14} color={colors.destructive} strokeWidth={2} />
              )}
            </Pressable>
          )}
        </View>
      </View>
    </GlassView>
  );
}

// ─── Route Card ───────────────────────────────────────────────────────────────

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
  const availableSlots = route.timeslots.filter(ts => !ts.booked).length;
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
  // Booking card
  bookingCard: { padding: 14 },
  renewalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  renewalBannerText: { fontSize: 11, flex: 1 },
  bookingCardBody: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bookingCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  bookingRouteName: { fontSize: 14, flex: 1 },
  bookingMeta: { flexDirection: 'row', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11 },
  bookingActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  renewBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 52,
    alignItems: 'center',
  },
  renewBtnText: { fontSize: 12 },
  cancelBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Route card
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
  // Bottom sheet
  sheetOverlay: { flex: 1, backgroundColor: '#00000060', justifyContent: 'flex-end' },
  sheet: {
    height: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  sheetTitle: { fontSize: 18 },
  sheetSub: { fontSize: 13, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetSection: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 12 },
  // Stations
  stationRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  stationDotCol: { alignItems: 'center', width: 16 },
  stationDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, zIndex: 1 },
  stationConnector: { flex: 1, width: 2, marginVertical: 2, minHeight: 20 },
  stationInfo: { flex: 1, paddingBottom: 16 },
  stationName: { fontSize: 13 },
  stationTime: { fontSize: 11, marginTop: 2 },
  // Week chip
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
  // Timeslot
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
  // Book button
  bookBtn: { marginTop: 12, borderRadius: 16, overflow: 'hidden' },
  bookBtnGrad: { height: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  bookBtnText: { fontSize: 14, color: '#fff' },
});
