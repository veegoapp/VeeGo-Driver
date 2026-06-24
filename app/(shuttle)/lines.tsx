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
import { useLocalSearchParams } from 'expo-router';
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
  // isBooked  — THIS driver has a confirmed booking for this slot in this week block
  isBooked: boolean;
  // isTaken   — ANY other driver has claimed this slot for this week block
  isTaken: boolean;
  takenByDriverName?: string | null;
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
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const headerAnim = useRef(new Animated.Value(0)).current;
  const queryClient = useQueryClient();

  const { openRouteId } = useLocalSearchParams<{ openRouteId?: string }>();

  const [search, setSearch] = useState('');
  const [bookingRoute, setBookingRoute] = useState<ShuttleRoute | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  // selectedWeek is now a BackendWeek (from server) — never generated client-side
  const [selectedWeek, setSelectedWeek] = useState<BackendWeek | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BackendSlot | null>(null);

  const { routes, myBookings, listLoading: contextLoading, error: contextError, refetch } = useShuttle();

  // Deep-link from slot_released toast: auto-open booking sheet for the given route
  useEffect(() => {
    if (!openRouteId || routes.length === 0) return;
    const target = routes.find(r => String(r.id) === openRouteId);
    if (target) setBookingRoute(target);
  }, [openRouteId, routes]);

  const [refreshing, setRefreshing] = useState(false);


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

  // ── Book-Week mutation ─────────────────────────────────────────────────────
  // Fires POST /shuttle/lines/:id/book-week committing the driver to the full
  // Sun–Thu 5-day block. See endpoints.shuttle.bookWeek for the full contract.
  const bookMutation = useMutation({
    mutationFn: ({
      routeId,
      slotId,
      startSundayDate,
      endThursdayDate,
    }: {
      routeId: string | number;
      slotId: string | number;
      startSundayDate: string;
      endThursdayDate: string;
    }) =>
      endpoints.shuttle.bookWeek(routeId, {
        slotId,
        startSundayDate,
        endThursdayDate,
        daysArray: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-available-weeks', bookingRoute?.id] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      // Keep the sheet open — driver can still browse other weeks/slots.
      // Only reset the slot selection so the sheet reflects the new state.
      setSelectedSlot(null);
      setShowSuccessDialog(true);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.status === 409) {
        Alert.alert(
          'Slot Taken',
          'This slot was just claimed by another driver. Please choose a different time or week.',
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
    setShowConfirmDialog(true);
  };

  const handleConfirmBooking = () => {
    setShowConfirmDialog(false);
    if (!bookingRoute || !selectedWeek || !selectedSlot) return;
    bookMutation.mutate({
      routeId: bookingRoute.id,
      slotId: selectedSlot.id,
      // startSundayDate / endThursdayDate come directly from the server.
      // Never generate these client-side — the backend owns the canonical
      // week boundaries to avoid timezone drift.
      startSundayDate: selectedWeek.weekStart,
      endThursdayDate: selectedWeek.weekEnd,
    });
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
            {t.lines_sub}
          </Text>
        </Animated.View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
            placeholder={t.lines_search_placeholder}
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
              {t.lines_chip_routes.replace('{n}', String(routes.length))}
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Users size={12} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.chipText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {t.lines_chip_booked.replace('{n}', String(myBookings.length))}
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <CheckCircle size={12} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.chipText, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
              {t.lines_chip_done.replace('{n}', String(myBookings.filter(b => b.status === 'completed').length))}
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
              {t.lines_load_failed}
            </Text>
          </View>
        )}

        {!contextLoading && !contextError && filteredRoutes.length === 0 && (
          <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
            <Text style={{ fontSize: 32 }}>🔍</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
              {t.lines_no_routes}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
              {t.lines_no_routes_sub}
            </Text>
          </View>
        )}

        {!contextLoading && !contextError && filteredRoutes.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              {t.lines_available_routes}
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
                {t.stations}
              </Text>
              {stationsLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : stations.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingBottom: 12 }}>
                  {t.lines_no_station}
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
                        {t.lines_stop_n.replace('{n}', String(st.order))}
                      </Text>
                    </View>
                  </View>
                ))
              )}

              {/* Week picker — weeks come from the server, not generated locally */}
              <Text style={[styles.sheetSection, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {t.lines_select_week}
              </Text>

              {weeksLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : weeksError ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingBottom: 12 }}>
                  {t.lines_weeks_load_failed}
                </Text>
              ) : serverWeeks.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingBottom: 12 }}>
                  {t.lines_no_weeks}
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
                    {t.departure_time_label}
                  </Text>
                  {currentSlots.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingBottom: 12 }}>
                      {t.lines_no_slots}
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
                                {t.lines_yours}
                              </Text>
                            )}
                            {takenByOther && !bookedByMe && (
                              <Text style={[styles.timeChipTaken, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                                {slot.takenByDriverName ?? 'Driver'}
                              </Text>
                            )}
                            {!isDisabled && slot.availableSeats !== null && slot.availableSeats !== undefined && (
                              <Text style={[styles.timeChipTaken, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                                {t.lines_seats_n.replace('{n}', String(slot.availableSeats))}
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
                      ? t.lines_confirm_btn.replace('{week}', formatWeekLabel(selectedWeek.weekStart, selectedWeek.weekEnd)).replace('{time}', selectedSlot.departureTime)
                      : !selectedWeek
                      ? t.lines_pick_week
                      : t.lines_pick_time}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Confirm 5-Day Booking Dialog ──────────────────────────── */}
      <Modal
        visible={showConfirmDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmDialog(false)}
      >
        <View style={styles.dialogOverlay}>
          <View style={[styles.dialogCard, { backgroundColor: '#ffffff' }]}>
            <View style={[styles.dialogHeader, { backgroundColor: colors.primary }]}>
              <Calendar size={18} color="#fff" strokeWidth={2} />
              <Text style={[styles.dialogHeaderTitle, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>
                {t.lines_confirm_title}
              </Text>
            </View>
            <View style={styles.dialogBody}>
              <View style={styles.dialogInfoRow}>
                <MapPin size={14} color={colors.primary} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dialogInfoLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.lines_dialog_route}</Text>
                  <Text style={[styles.dialogInfoValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{bookingRoute?.name}</Text>
                </View>
              </View>
              <View style={[styles.dialogSep, { backgroundColor: colors.border }]} />
              <View style={styles.dialogInfoRow}>
                <GitBranch size={14} color={colors.primary} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dialogInfoLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.lines_dialog_direction}</Text>
                  <Text style={[styles.dialogInfoValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    {bookingRoute?.from} → {bookingRoute?.to}
                  </Text>
                </View>
              </View>
              <View style={[styles.dialogSep, { backgroundColor: colors.border }]} />
              <View style={styles.dialogInfoRow}>
                <Calendar size={14} color={colors.primary} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dialogInfoLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.lines_dialog_week}</Text>
                  <Text style={[styles.dialogInfoValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    {selectedWeek ? formatWeekLabel(selectedWeek.weekStart, selectedWeek.weekEnd) : '—'}
                  </Text>
                </View>
              </View>
              <View style={[styles.dialogSep, { backgroundColor: colors.border }]} />
              <View style={styles.dialogInfoRow}>
                <Clock size={14} color={colors.primary} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dialogInfoLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.lines_dialog_departure}</Text>
                  <Text style={[styles.dialogInfoValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{selectedSlot?.departureTime}</Text>
                </View>
              </View>
              {!!bookingRoute?.stationCount && (
                <>
                  <View style={[styles.dialogSep, { backgroundColor: colors.border }]} />
                  <View style={styles.dialogInfoRow}>
                    <Users size={14} color={colors.primary} strokeWidth={2} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dialogInfoLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.lines_dialog_stops}</Text>
                      <Text style={[styles.dialogInfoValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.lines_dialog_stops_n.replace('{n}', String(bookingRoute.stationCount))}</Text>
                    </View>
                  </View>
                </>
              )}
              <View style={[styles.dialogNote, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 18, textAlign: 'center' }]}>
                  {t.lines_dialog_note}
                </Text>
              </View>
            </View>
            <View style={[styles.dialogButtons, { borderTopColor: colors.border }]}>
              <Pressable
                onPress={() => setShowConfirmDialog(false)}
                style={({ pressed }) => [styles.dialogBtnSecondary, { backgroundColor: pressed ? colors.secondary : '#fff', borderColor: colors.border }]}
              >
                <Text style={[styles.dialogBtnLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.cancel.toUpperCase()}</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmBooking}
                style={({ pressed }) => [styles.dialogBtnPrimary, { backgroundColor: pressed ? '#2d2d42' : colors.primary }]}
              >
                {bookMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[styles.dialogBtnLabel, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{t.lines_confirm_week}</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Week Committed! Success Dialog ────────────────────────── */}
      <Modal
        visible={showSuccessDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessDialog(false)}
      >
        <View style={styles.dialogOverlay}>
          <View style={[styles.dialogCard, { backgroundColor: '#ffffff' }]}>
            <View style={[styles.dialogSuccessIcon, { backgroundColor: '#f0fdf4' }]}>
              <CheckCircle size={52} color="#16a34a" strokeWidth={1.5} />
            </View>
            <View style={styles.dialogBody}>
              <Text style={[styles.dialogSuccessTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {t.lines_week_committed}
              </Text>
              <Text style={[styles.dialogSuccessBody, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {t.lines_success_body}
              </Text>
              <View style={[styles.dialogNoteRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Clock size={13} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', flex: 1 }]}>
                  {t.lines_renewal_note}
                </Text>
              </View>
            </View>
            <View style={[styles.dialogButtons, { borderTopColor: colors.border }]}>
              <Pressable
                onPress={() => setShowSuccessDialog(false)}
                style={({ pressed }) => [styles.dialogBtnPrimary, { flex: 1, backgroundColor: pressed ? '#2d2d42' : colors.primary }]}
              >
                <Text style={[styles.dialogBtnLabel, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{t.lines_got_it}</Text>
              </Pressable>
            </View>
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
  const { t } = useI18n();

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      delay: index * 50,
      stiffness: 200,
      damping: 20,
      useNativeDriver: true,
    }).start();
  }, []);

  // Informational: does this driver hold an active booking on this route?
  // NOTE: this flag is purely visual (badge color). It NEVER blocks the card.
  // Routes are globally public — all drivers can always open any route to
  // explore other weeks and slots.
  const hasActiveBooking = myBookings.some(b =>
    String(b.routeId) === String(route.id) &&
    b.status !== 'cancelled' &&
    b.status !== 'completed'
  );
  const availableSlots = route.timeslots.filter(ts => !ts.isBooked).length;
  const totalSlots = route.timeslots.length;

  // Status badge is purely informational — it does not control interactivity
  const badge = hasActiveBooking
    ? { text: `${t.status_booked} ✓`, bg: '#22c55e20', color: '#16a34a' }
    : availableSlots === 0 && totalSlots > 0
    ? { text: t.status_full, bg: colors.secondary, color: colors.mutedForeground }
    : { text: t.available, bg: '#3D52D520', color: '#3D52D5' };

  // CTA label changes based on context but the card is ALWAYS tappable
  const ctaLabel = hasActiveBooking
    ? t.cta_view_slots
    : availableSlots === 0 && totalSlots > 0
    ? t.cta_view_weeks
    : t.cta_tap_to_book;

  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
    }}>
      <Pressable
        onPress={onBook}
        style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.99 : 1 }] }]}
      >
        <GlassView style={styles.lineCard} borderRadius={20}>
          <View style={styles.lineCardHeader}>
            <View style={[styles.lineNumberBadge, { backgroundColor: hasActiveBooking ? '#22c55e20' : colors.secondary }]}>
              <Text style={[styles.lineNumberText, {
                color: hasActiveBooking ? '#16a34a' : colors.mutedForeground,
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
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statusText, { color: badge.color, fontFamily: 'Inter_700Bold' }]}>
                {badge.text}
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
                  {t.lines_slots_free.replace('{available}', String(availableSlots)).replace('{total}', String(totalSlots))}
                </Text>
              </View>
            )}
            <View style={[styles.lineStat, { marginLeft: 'auto' as any }]}>
              <Text style={[styles.lineStatText, { color: '#3D52D5', fontFamily: 'Inter_600SemiBold' }]}>
                {ctaLabel}
              </Text>
            </View>
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

  // ── Dialog styles ──────────────────────────────────────────────────
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  dialogHeaderTitle: { fontSize: 16 },
  dialogBody: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  dialogInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  dialogInfoLabel: { fontSize: 11, letterSpacing: 0.3, marginBottom: 2 },
  dialogInfoValue: { fontSize: 14 },
  dialogSep: { height: 1 },
  dialogNote: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
    marginBottom: 8,
    alignItems: 'center',
  },
  dialogNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
    marginBottom: 8,
  },
  dialogButtons: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  dialogBtnSecondary: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnPrimary: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnLabel: { fontSize: 13, letterSpacing: 0.5 },
  dialogSuccessIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 28,
    paddingBottom: 8,
  },
  dialogSuccessTitle: { fontSize: 20, textAlign: 'center', marginBottom: 10 },
  dialogSuccessBody: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
});
