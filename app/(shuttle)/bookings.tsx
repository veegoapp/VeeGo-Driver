import { router } from 'expo-router';
import {
  AlertTriangle, Calendar, CheckCircle, Clock,
  GitBranch, RefreshCw, Send, Trash2, Users, X,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { useShuttle, type ShuttleBooking } from '@/lib/shuttleContext';
import { endpoints, ApiError } from '@/lib/api';

const TAB_BAR_HEIGHT = 96;

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'upcoming' | 'completed';
type WeekFilter = 'current' | 'next';

// TODO: Backend Integration - GET /shuttle/driver/my-trips response shape
// Expected: { trips: DriverTrip[]; total: number }
type DriverTrip = {
  id: string;
  routeName?: string;
  date?: string;
  boardedPassengers?: number;
  totalPassengers?: number;
  // TODO: Backend Integration - earnedAmount (driver net after fees) & revenueAmount (gross)
  // Backend should return both fields for the completed trip stats cards.
  earnings?: number | string;
  revenueAmount?: number | string;
  status?: string;
};

// TODO: Backend Integration - GET /shuttle/route-bookings/:id/detail response shape
// See api.ts bookingDetail() for the full contract.
type BookingDetail = {
  id: string;
  bookedSeats: number;
  totalSeats: number | null;
  minRequiredPassengers: number | null;
  thresholdMet: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentWeekSunday(): Date {
  const today = new Date();
  const day = today.getDay(); // 0=Sun … 6=Sat
  const sun = new Date(today);
  sun.setDate(today.getDate() - day);
  sun.setHours(0, 0, 0, 0);
  return sun;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type WeekBucket = 'current' | 'next' | 'other';

function getWeekBucket(weekStart: string): WeekBucket {
  const currentSun = getCurrentWeekSunday();
  const nextSun = new Date(currentSun);
  nextSun.setDate(currentSun.getDate() + 7);
  const afterNextSun = new Date(nextSun);
  afterNextSun.setDate(nextSun.getDate() + 7);

  const ws = weekStart.slice(0, 10);
  if (ws === toDateString(currentSun)) return 'current';
  if (ws === toDateString(nextSun)) return 'next';
  return 'other';
}

function formatWeekRange(weekStart: string, weekEnd?: string): string {
  if (!weekStart) return '—';
  try {
    const s = new Date(weekStart + 'T00:00:00Z');
    const fmtDay = (d: Date) =>
      d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    if (weekEnd) {
      const e = new Date(weekEnd + 'T00:00:00Z');
      return `${fmtDay(s)} — ${fmtDay(e)}`;
    }
    return fmtDay(s);
  } catch {
    return weekStart;
  }
}

function formatCurrency(amount: number | string | undefined): string {
  if (amount == null) return '—';
  const n = parseFloat(String(amount));
  if (isNaN(n)) return '—';
  return `${n.toFixed(0)} جنيه`;
}

function formatCountdown(deadlineIso: string): string {
  const ms = new Date(deadlineIso).getTime() - Date.now();
  if (ms <= 0) return 'انتهى الوقت';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BookingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { myBookings, renewalBooking, refetch } = useShuttle();
  const queryClient = useQueryClient();

  const [mainTab, setMainTab] = useState<MainTab>('upcoming');
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('current');
  const [selectedBooking, setSelectedBooking] = useState<ShuttleBooking | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tripPage, setTripPage] = useState(1);
  const TRIP_LIMIT = 10;

  // ── Queries ────────────────────────────────────────────────────────────────

  // TODO: Backend Integration - GET /shuttle/driver/my-trips
  // Parses both backend-translated route/station strings (routeNameAr, fromAr, toAr)
  // and segregated temporal data (completedAt, earnedAmount, revenueAmount).
  // Must support pagination via page/limit query params.
  const { data: driverTripsRaw, isLoading: tripsLoading } = useQuery({
    queryKey: ['shuttle-driver-trips', tripPage],
    queryFn: () => endpoints.shuttle.driverTrips(tripPage, TRIP_LIMIT),
    staleTime: 30_000,
  });
  const driverTripsData = driverTripsRaw as { trips?: DriverTrip[]; total?: number } | undefined;
  const driverTrips: DriverTrip[] = driverTripsData?.trips ?? [];
  const driverTripsTotal = driverTripsData?.total ?? 0;
  const hasMoreTrips = driverTrips.length > 0 && tripPage * TRIP_LIMIT < driverTripsTotal;

  // ── Derived booking lists ──────────────────────────────────────────────────

  const upcomingBookings = myBookings.filter(
    b => b.status !== 'completed' && b.status !== 'cancelled'
  );
  const filteredUpcoming = upcomingBookings.filter(b => {
    const bucket = getWeekBucket(b.weekStart);
    return bucket === weekFilter;
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const confirmRenewalMutation = useMutation({
    mutationFn: (id: string) => endpoints.shuttle.confirmRenewal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      Alert.alert('', 'تم تأكيد حجزك للأسبوع القادم بنجاح');
    },
    onError: (err) => {
      const msg = err instanceof ApiError && err.status === 409
        ? 'تم حجز هذا الموعد بالفعل من قِبل سائق آخر.'
        : 'تعذّر تأكيد التجديد. يرجى المحاولة مجدداً.';
      Alert.alert('', msg);
    },
  });

  // TODO: Backend Integration - decline-renewal mutation
  // POST /shuttle/route-bookings/:id/decline-renewal
  // On success: backend releases the slot, broadcasts slot_released event,
  // and pushes "slot available" notification to all drivers.
  const declineRenewalMutation = useMutation({
    mutationFn: (id: string) => endpoints.shuttle.declineRenewal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-available-weeks'] });
    },
    onError: () => {
      Alert.alert('', 'تعذّر الاعتذار عن الخط. يرجى المحاولة مجدداً.');
    },
  });

  const handleConfirmRenewal = (bookingId: string) => {
    Alert.alert(
      'تأكيد التجديد',
      'سيتم تأكيد حجزك لنفس الموعد في الأسبوع القادم.',
      [
        { text: 'رجوع', style: 'cancel' },
        {
          text: 'تأكيد التجديد',
          onPress: () => confirmRenewalMutation.mutate(bookingId),
        },
      ]
    );
  };

  const handleDeclineRenewal = (bookingId: string) => {
    Alert.alert(
      'الاعتذار عن الخط',
      'هل أنت متأكد من الاعتذار عن هذا الخط للأسبوع القادم؟ سيتم تحرير الموعد لسائقين آخرين فوراً.',
      [
        { text: 'رجوع', style: 'cancel' },
        {
          text: 'اعتذار عن الخط',
          style: 'destructive',
          onPress: () => declineRenewalMutation.mutate(bookingId),
        },
      ]
    );
  };

  const handleRefresh = () => {
    setRefreshing(true);
    refetch();
    queryClient.invalidateQueries({ queryKey: ['shuttle-driver-trips'] });
    setTimeout(() => setRefreshing(false), 1200);
  };

  const renewalPending = confirmRenewalMutation.isPending || declineRenewalMutation.isPending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 8,
          paddingBottom: TAB_BAR_HEIGHT + 24,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Page header */}
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>
          حجوزاتي
        </Text>
        <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
          المواعيد الأسبوعية والرحلات المكتملة
        </Text>

        {/* Wednesday renewal banner */}
        {renewalBooking && renewalBooking.renewalDeadline && (
          <RenewalBanner
            booking={renewalBooking}
            confirmPending={confirmRenewalMutation.isPending}
            declinePending={declineRenewalMutation.isPending}
            onConfirm={() => handleConfirmRenewal(renewalBooking.id)}
            onDecline={() => handleDeclineRenewal(renewalBooking.id)}
          />
        )}

        {/* Main tabs */}
        <View style={[styles.mainTabRow, { borderColor: colors.border }]}>
          <MainTabBtn
            label="الرحلات القادمة"
            count={upcomingBookings.length}
            active={mainTab === 'upcoming'}
            onPress={() => setMainTab('upcoming')}
            colors={colors}
          />
          <MainTabBtn
            label="الرحلات المكتملة"
            count={driverTripsTotal || driverTrips.length}
            active={mainTab === 'completed'}
            onPress={() => setMainTab('completed')}
            colors={colors}
          />
        </View>

        {/* ── Upcoming tab ── */}
        {mainTab === 'upcoming' && (
          <>
            {/* Week filter chips */}
            <View style={styles.weekFilterRow}>
              <WeekFilterBtn
                label="الأسبوع الحالي"
                active={weekFilter === 'current'}
                onPress={() => setWeekFilter('current')}
                colors={colors}
              />
              <WeekFilterBtn
                label="الأسبوع القادم"
                active={weekFilter === 'next'}
                onPress={() => setWeekFilter('next')}
                colors={colors}
              />
            </View>

            {filteredUpcoming.length === 0 ? (
              <View style={styles.emptyState}>
                <Calendar size={36} color={colors.mutedForeground} strokeWidth={1.5} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {weekFilter === 'current' ? 'لا توجد حجوزات هذا الأسبوع' : 'لا توجد حجوزات الأسبوع القادم'}
                </Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  توجه إلى تبويب الخطوط لحجز موعد جديد
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8, marginTop: 4 }}>
                {filteredUpcoming.map(b => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    colors={colors}
                    onPress={() => setSelectedBooking(b)}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {/* ── Completed tab ── */}
        {mainTab === 'completed' && (
          <>
            {tripsLoading ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : driverTrips.length === 0 ? (
              <View style={styles.emptyState}>
                <CheckCircle size={36} color={colors.mutedForeground} strokeWidth={1.5} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  لا توجد رحلات مكتملة بعد
                </Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  ستظهر هنا الرحلات التي قمت بتسييرها
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8, marginTop: 4 }}>
                {driverTrips.map(trip => (
                  <CompletedTripCard key={trip.id} trip={trip} colors={colors} />
                ))}

                {(hasMoreTrips || tripPage > 1) && (
                  <View style={styles.paginationRow}>
                    {tripPage > 1 && (
                      <Pressable
                        style={[styles.pageBtn, { borderColor: colors.border }]}
                        onPress={() => setTripPage(p => Math.max(1, p - 1))}
                      >
                        <Text style={[styles.pageBtnText, { color: colors.foreground }]}>
                          السابق
                        </Text>
                      </Pressable>
                    )}
                    <Text style={[styles.pageIndicator, { color: colors.mutedForeground }]}>
                      صفحة {tripPage}
                    </Text>
                    {hasMoreTrips && (
                      <Pressable
                        style={[styles.pageBtn, { borderColor: colors.border }]}
                        onPress={() => setTripPage(p => p + 1)}
                      >
                        <Text style={[styles.pageBtnText, { color: colors.foreground }]}>
                          التالي
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Booking detail bottom sheet */}
      <Modal
        visible={!!selectedBooking}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedBooking(null)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setSelectedBooking(null)} />
          {selectedBooking && (
            <BookingDetailSheet
              booking={selectedBooking}
              colors={colors}
              insetBottom={insets.bottom}
              onClose={() => setSelectedBooking(null)}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Main tab button ──────────────────────────────────────────────────────────

function MainTabBtn({
  label, count, active, onPress, colors,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.mainTabBtn,
        active && [styles.mainTabBtnActive, { borderBottomColor: colors.primary }],
      ]}
    >
      <Text
        style={[
          styles.mainTabLabel,
          { color: active ? colors.primary : colors.mutedForeground },
          active ? { fontFamily: 'Inter_700Bold' } : { fontFamily: 'Inter_400Regular' },
        ]}
      >
        {label}
      </Text>
      {count > 0 && (
        <View
          style={[
            styles.tabBadge,
            { backgroundColor: active ? colors.primary : colors.secondary },
          ]}
        >
          <Text
            style={[
              styles.tabBadgeText,
              { color: active ? '#fff' : colors.mutedForeground },
            ]}
          >
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Week filter button ───────────────────────────────────────────────────────

function WeekFilterBtn({
  label, active, onPress, colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.weekBtn,
        {
          backgroundColor: active ? colors.primary : colors.secondary,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.weekBtnLabel,
          {
            color: active ? '#fff' : colors.mutedForeground,
            fontFamily: active ? 'Inter_700Bold' : 'Inter_400Regular',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Wednesday Renewal Banner ─────────────────────────────────────────────────

function RenewalBanner({
  booking,
  confirmPending,
  declinePending,
  onConfirm,
  onDecline,
}: {
  booking: ShuttleBooking;
  confirmPending: boolean;
  declinePending: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const [countdown, setCountdown] = useState(() =>
    formatCountdown(booking.renewalDeadline!)
  );

  useEffect(() => {
    const iv = setInterval(() => {
      setCountdown(formatCountdown(booking.renewalDeadline!));
    }, 1000);
    return () => clearInterval(iv);
  }, [booking.renewalDeadline]);

  const expired = countdown === 'انتهى الوقت';

  return (
    <View style={styles.renewalBanner}>
      {/* Header row */}
      <View style={styles.renewalHeaderRow}>
        <AlertTriangle size={16} color="#D97706" strokeWidth={2.5} />
        <Text style={styles.renewalTitle}>تجديد الحجز الأسبوعي</Text>
        {!expired && (
          <View style={styles.countdownPill}>
            <Clock size={10} color="#92400E" strokeWidth={2.5} />
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        )}
      </View>

      {/* Route info */}
      <Text style={styles.renewalRouteName} numberOfLines={1}>
        {booking.routeName}
      </Text>
      <Text style={styles.renewalRouteMeta}>
        {booking.departureTime}
        {booking.weekStart ? `  ·  ${formatWeekRange(booking.weekStart, booking.weekEnd)}` : ''}
      </Text>

      <Text style={styles.renewalBody}>
        هل تريد تجديد حجز هذا الخط للأسبوع القادم؟ يجب التأكيد قبل انتهاء الموعد.
      </Text>

      {/* Actions */}
      {!expired && (
        <View style={styles.renewalActions}>
          <Pressable
            onPress={onConfirm}
            disabled={confirmPending || declinePending}
            style={({ pressed }) => [
              styles.renewalConfirmBtn,
              { opacity: pressed || confirmPending ? 0.8 : 1 },
            ]}
          >
            {confirmPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <RefreshCw size={14} color="#fff" strokeWidth={2.5} />
                <Text style={styles.renewalConfirmLabel}>تأكيد التجديد</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={onDecline}
            disabled={confirmPending || declinePending}
            style={({ pressed }) => [
              styles.renewalDeclineBtn,
              { opacity: pressed || declinePending ? 0.8 : 1 },
            ]}
          >
            {declinePending ? (
              <ActivityIndicator size="small" color="#92400E" />
            ) : (
              <Text style={styles.renewalDeclineLabel}>اعتذار عن الخط</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Booking card (upcoming list item) ───────────────────────────────────────

function BookingCard({
  booking, colors, onPress,
}: {
  booking: ShuttleBooking;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const hasRenewal =
    !!booking.renewalDeadline &&
    new Date(booking.renewalDeadline).getTime() > Date.now();

  const bucket = getWeekBucket(booking.weekStart);
  const weekLabel =
    bucket === 'current' ? 'الأسبوع الحالي' :
    bucket === 'next' ? 'الأسبوع القادم' : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={[styles.bookingCard, { backgroundColor: '#fff', borderColor: colors.border }]}>
        <View style={styles.bookingCardAccent} />
        <View style={{ flex: 1, gap: 5 }}>
          <Text
            style={[styles.bookingCardRoute, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {booking.routeName}
          </Text>
          <View style={styles.metaRow}>
            <Clock size={11} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {booking.departureTime}
            </Text>
            <Text style={[styles.dot, { color: colors.border }]}>·</Text>
            <Calendar size={11} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {formatWeekRange(booking.weekStart, booking.weekEnd)}
            </Text>
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          {weekLabel ? (
            <View style={[styles.weekPill, { backgroundColor: '#1e1e2812' }]}>
              <Text style={[styles.weekPillText, { color: colors.primary }]}>
                {weekLabel}
              </Text>
            </View>
          ) : null}
          {hasRenewal && (
            <View style={[styles.renewalPill, { backgroundColor: '#FEF3C718' }]}>
              <AlertTriangle size={9} color="#D97706" strokeWidth={2.5} />
              <Text style={styles.renewalPillText}>تجديد</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Completed trip card ──────────────────────────────────────────────────────

function CompletedTripCard({
  trip, colors,
}: {
  trip: DriverTrip;
  colors: ReturnType<typeof useColors>;
}) {
  // TODO: Backend Integration - Surface revenueAmount (gross) vs earnings (net after fees)
  // When backend returns both fields, show them side by side in the card.
  const netEarnings = formatCurrency(trip.earnings);
  const passengersLabel =
    trip.boardedPassengers != null && trip.totalPassengers != null
      ? `${trip.boardedPassengers} / ${trip.totalPassengers} راكب`
      : trip.boardedPassengers != null
      ? `${trip.boardedPassengers} راكب`
      : '—';

  return (
    <View style={[styles.tripCard, { backgroundColor: '#fff', borderColor: colors.border }]}>
      <View style={[styles.tripCardAccent, { backgroundColor: '#22c55e' }]} />
      <View style={{ flex: 1, gap: 5 }}>
        <Text
          style={[styles.bookingCardRoute, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {trip.routeName ?? 'رحلة شاتل'}
        </Text>
        <View style={styles.metaRow}>
          {trip.date && (
            <>
              <Calendar size={11} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {trip.date}
              </Text>
              <Text style={[styles.dot, { color: colors.border }]}>·</Text>
            </>
          )}
          <Users size={11} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {passengersLabel}
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.earningsText, { color: '#16a34a' }]}>
          {netEarnings}
        </Text>
        <View style={[styles.completedBadge, { backgroundColor: '#22c55e18' }]}>
          <CheckCircle size={9} color="#16a34a" strokeWidth={2.5} />
          <Text style={[styles.completedBadgeText, { color: '#16a34a' }]}>مكتملة</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Booking Detail Sheet ─────────────────────────────────────────────────────

function BookingDetailSheet({
  booking, colors, insetBottom, onClose,
}: {
  booking: ShuttleBooking;
  colors: ReturnType<typeof useColors>;
  insetBottom: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  // TODO: Backend Integration - GET /shuttle/route-bookings/:id/detail
  // Returns live passenger count + threshold status for this week block.
  // See api.ts bookingDetail() for the full contract and socket event docs.
  const { data: detailRaw, refetch: refetchDetail } = useQuery<BookingDetail>({
    queryKey: ['shuttle-booking-detail', booking.id],
    // TODO: Backend Integration - remove `enabled: false` once GET /shuttle/route-bookings/:id/detail
    // is live. The component degrades gracefully (no passenger card shown) until then.
    queryFn: () => endpoints.shuttle.bookingDetail(booking.id) as Promise<BookingDetail>,
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: false,
    retry: false,
  });

  // TODO: Backend Integration - Socket live passenger count sync
  // When backend emits `booking:passenger_updated` to the booking room:
  //   payload: { bookingId: string, bookedSeats: number, thresholdMet: boolean }
  // Subscribe on mount, update query cache directly for zero-latency UI update.
  useEffect(() => {
    if (!socket) return;

    const handleSlotTaken = () => {
      // Proxy: any slot change on this route may affect passenger count
      refetchDetail();
    };

    socket.on(SOCKET_EVENTS.SLOT_TAKEN, handleSlotTaken);
    return () => {
      socket.off(SOCKET_EVENTS.SLOT_TAKEN, handleSlotTaken);
    };
  }, [socket, refetchDetail]);

  const detail = detailRaw ?? null;

  // Derive threshold state from live detail or fall back gracefully
  const bookedSeats: number = detail?.bookedSeats ?? 0;
  const totalSeats: number | null = detail?.totalSeats ?? null;
  const minRequired: number | null = detail?.minRequiredPassengers ?? null;
  const thresholdMet: boolean = detail?.thresholdMet ?? false;
  const hasDetail = detail != null;

  const isCompleted =
    booking.status === 'completed' || booking.status === 'cancelled';

  // ── Navigate to cancellation flow ─────────────────────────────────────────

  const handleCancelPress = () => {
    onClose();
    setTimeout(() => {
      router.push({
        pathname: '/shuttle/direct-cancel',
        params: {
          bookingId: booking.id,
          routeName: booking.routeName,
          departureTime: booking.departureTime,
        },
      } as any);
    }, 300);
  };

  // ── Navigate to referral flow ──────────────────────────────────────────────

  const handleReferPress = () => {
    onClose();
    setTimeout(() => {
      router.push({
        pathname: '/shuttle/referral-request',
        params: {
          bookingId: booking.id,
          routeName: booking.routeName,
          departureTime: booking.departureTime,
          // TODO: Backend Integration - pass fromStation / toStation from booking detail
          fromStation: '',
          toStation: '',
        },
      } as any);
    }, 300);
  };

  return (
    <View
      style={[
        styles.sheet,
        { backgroundColor: colors.background, paddingBottom: insetBottom + 16 },
      ]}
    >
      <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

      {/* Header */}
      <View style={styles.sheetHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.sheetTitle, { color: colors.foreground }]}
            numberOfLines={2}
          >
            {booking.routeName}
          </Text>
          <Text style={[styles.sheetMeta, { color: colors.mutedForeground }]}>
            {booking.departureTime}
            {booking.weekStart
              ? `  ·  ${formatWeekRange(booking.weekStart, booking.weekEnd)}`
              : ''}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={[styles.sheetCloseBtn, { backgroundColor: colors.secondary }]}
        >
          <X size={16} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
      >
        {/* ── Dynamic threshold status badge ── */}
        {hasDetail ? (
          <View
            style={[
              styles.thresholdBadge,
              {
                backgroundColor: thresholdMet ? '#22c55e14' : '#F59E0B14',
                borderColor: thresholdMet ? '#22c55e44' : '#F59E0B44',
              },
            ]}
          >
            {thresholdMet ? (
              <CheckCircle size={14} color="#16a34a" strokeWidth={2.5} />
            ) : (
              <AlertTriangle size={14} color="#D97706" strokeWidth={2.5} />
            )}
            <Text
              style={[
                styles.thresholdBadgeText,
                { color: thresholdMet ? '#16a34a' : '#D97706' },
              ]}
            >
              {thresholdMet
                ? 'نشط — اكتمل الحد الأدنى للركاب'
                : 'بانتظار اكتمال الحد الأدنى للركاب'}
            </Text>
          </View>
        ) : (
          // TODO: Backend Integration - shown when bookingDetail endpoint is not yet available
          <View
            style={[
              styles.thresholdBadge,
              { backgroundColor: '#1e1e2808', borderColor: colors.border },
            ]}
          >
            <GitBranch size={14} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.thresholdBadgeText, { color: colors.mutedForeground }]}>
              الحجز مؤكد — في انتظار بيانات الركاب
            </Text>
          </View>
        )}

        {/* ── Live passenger counter ── */}
        {hasDetail && totalSeats != null && (
          <View
            style={[
              styles.passengerCard,
              { backgroundColor: '#fff', borderColor: colors.border },
            ]}
          >
            <View style={styles.passengerCardHeader}>
              <Users size={14} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[styles.passengerCardTitle, { color: colors.foreground }]}>
                الركاب المحجوزون
              </Text>
              <Pressable
                onPress={() => refetchDetail()}
                hitSlop={8}
                style={{ marginRight: 'auto' }}
              >
                <RefreshCw size={12} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
            </View>

            {/* Numeric counter */}
            <View style={styles.passengerCountRow}>
              <Text style={[styles.passengerCount, { color: colors.foreground }]}>
                {bookedSeats}
              </Text>
              <Text style={[styles.passengerTotal, { color: colors.mutedForeground }]}>
                {' / '}{totalSeats}
              </Text>
              <Text style={[styles.passengerLabel, { color: colors.mutedForeground }]}>
                راكب
              </Text>
            </View>

            {/* Progress bar */}
            <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, (bookedSeats / totalSeats) * 100)}%` as any,
                    backgroundColor: thresholdMet ? '#22c55e' : '#F59E0B',
                  },
                ]}
              />
            </View>

            {/* Threshold marker label */}
            {minRequired != null && (
              <Text style={[styles.thresholdHint, { color: colors.mutedForeground }]}>
                الحد الأدنى المطلوب: {minRequired} راكب
              </Text>
            )}
          </View>
        )}

        {/* ── Booking info card ── */}
        <View
          style={[
            styles.infoCard,
            { backgroundColor: '#fff', borderColor: colors.border },
          ]}
        >
          <InfoRow
            icon={<Clock size={14} color={colors.mutedForeground} strokeWidth={2} />}
            label="وقت المغادرة"
            value={booking.departureTime}
            colors={colors}
          />
          <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
          <InfoRow
            icon={<Calendar size={14} color={colors.mutedForeground} strokeWidth={2} />}
            label="الفترة الأسبوعية"
            value={formatWeekRange(booking.weekStart, booking.weekEnd)}
            colors={colors}
          />
          <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
          <InfoRow
            icon={<GitBranch size={14} color={colors.mutedForeground} strokeWidth={2} />}
            label="رقم الحجز"
            value={`#${booking.id.slice(0, 8).toUpperCase()}`}
            colors={colors}
          />
        </View>

        {/* ── Driver actions ── */}
        {!isCompleted && (
          <View style={{ gap: 10 }}>
            {/* Cancel trip */}
            <Pressable
              onPress={handleCancelPress}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: '#FEF2F2',
                  borderColor: '#FCA5A544',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Trash2 size={16} color="#DC2626" strokeWidth={2} />
              <Text style={[styles.actionBtnLabel, { color: '#DC2626' }]}>
                إلغاء الرحلة
              </Text>
            </Pressable>

            {/* Refer trip */}
            <Pressable
              onPress={handleReferPress}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: '#EFF6FF',
                  borderColor: '#BFDBFE44',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Send size={16} color="#2563EB" strokeWidth={2} />
              <Text style={[styles.actionBtnLabel, { color: '#2563EB' }]}>
                تحويل الرحلة لسائق آخر
              </Text>
            </Pressable>
          </View>
        )}

        {/* TODO: Backend Integration - When backend returns booking detail with
            penalty info or special flags, surface them here as additional info rows */}
      </ScrollView>
    </View>
  );
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({
  icon, label, value, colors,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.infoRow}>
      {icon}
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  pageTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'right', paddingTop: 8 },
  pageSub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: 4 },

  // Main tabs
  mainTabRow: {
    flexDirection: 'row',
    marginTop: 20,
    borderBottomWidth: 1,
  },
  mainTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 10,
  },
  mainTabBtnActive: {
    borderBottomWidth: 2,
    marginBottom: -1,
  },
  mainTabLabel: { fontSize: 13 },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },

  // Week filter
  weekFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 4,
  },
  weekBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  weekBtnLabel: { fontSize: 13 },

  // Empty states
  emptyState: { alignItems: 'center', marginTop: 48, gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  loaderWrap: { padding: 32, alignItems: 'center' },

  // Renewal banner
  renewalBanner: {
    marginTop: 16,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D88',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  renewalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  renewalTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#92400E',
    textAlign: 'right',
  },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countdownText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#92400E',
    fontVariant: ['tabular-nums'],
  },
  renewalRouteName: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#1e1e28',
    textAlign: 'right',
  },
  renewalRouteMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#92400E',
    textAlign: 'right',
  },
  renewalBody: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#78350F',
    textAlign: 'right',
    lineHeight: 20,
  },
  renewalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  renewalConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e1e28',
    borderRadius: 12,
    paddingVertical: 12,
  },
  renewalConfirmLabel: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  renewalDeclineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FCD34D88',
  },
  renewalDeclineLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#92400E',
  },

  // Booking card
  bookingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bookingCardAccent: {
    width: 4,
    height: 36,
    borderRadius: 2,
    backgroundColor: '#1e1e28',
  },
  bookingCardRoute: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'flex-end' },
  metaText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  dot: { fontSize: 12 },
  weekPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  weekPillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  renewalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  renewalPillText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#D97706',
  },

  // Completed trip card
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tripCardAccent: { width: 4, height: 36, borderRadius: 2 },
  earningsText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  completedBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },

  // Pagination
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  pageBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pageBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  pageIndicator: { fontSize: 13, fontFamily: 'Inter_400Regular' },

  // Bottom sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    textAlign: 'right',
    lineHeight: 24,
  },
  sheetMeta: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'right',
    marginTop: 3,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Threshold badge
  thresholdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'flex-end',
  },
  thresholdBadgeText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'right',
    flex: 1,
  },

  // Passenger counter card
  passengerCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  passengerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'flex-end',
  },
  passengerCardTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  passengerCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: 2,
  },
  passengerCount: { fontSize: 32, fontFamily: 'Inter_700Bold' },
  passengerTotal: { fontSize: 18, fontFamily: 'Inter_400Regular' },
  passengerLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', marginRight: 2 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  thresholdHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'right',
  },

  // Info card
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'flex-end',
  },
  infoLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1, textAlign: 'right' },
  infoValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  infoDivider: { height: 1 },

  // Action buttons
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnLabel: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
