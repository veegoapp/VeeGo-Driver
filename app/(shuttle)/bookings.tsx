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
import { useI18n } from '@/lib/i18nContext';

const TAB_BAR_HEIGHT = 96;

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'upcoming' | 'completed';

type DriverTrip = {
  id: string;
  routeName?: string;
  date?: string;
  boardedPassengers?: number;
  totalPassengers?: number;
  earnings?: number | string;
  revenueAmount?: number | string;
  status?: string;
};

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

// Always produces a YYYY-MM-DD string from LOCAL date parts, not UTC.
// toISOString() converts to UTC first, which causes off-by-one errors in
// UTC+ timezones (e.g. Egypt UTC+2: local midnight → previous day in UTC).
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

// Normalises a weekStart value from the backend which may arrive as:
//   "YYYY-MM-DD"              — already correct, just slice
//   "YYYY-MM-DDTHH:mm:ss..."  — full ISO; parse and extract LOCAL date parts
function normalizeWeekStart(weekStart: string): string {
  if (!weekStart) return '';
  if (weekStart.includes('T')) {
    const d = new Date(weekStart);
    if (!isNaN(d.getTime())) return toLocalDateString(d);
  }
  return weekStart.slice(0, 10);
}

type WeekBucket = 'current' | 'next' | 'other';

function getWeekBucket(weekStart: string): WeekBucket {
  const currentSun = getCurrentWeekSunday();
  const nextSun = new Date(currentSun);
  nextSun.setDate(currentSun.getDate() + 7);

  const ws = normalizeWeekStart(weekStart);
  if (ws === toLocalDateString(currentSun)) return 'current';
  if (ws === toLocalDateString(nextSun)) return 'next';
  return 'other';
}

function formatWeekRange(weekStart: string, weekEnd?: string, locale = 'ar-EG'): string {
  if (!weekStart) return '—';
  try {
    const s = new Date(weekStart + 'T00:00:00Z');
    const fmtDay = (d: Date) =>
      d.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    if (weekEnd) {
      const e = new Date(weekEnd + 'T00:00:00Z');
      return `${fmtDay(s)} — ${fmtDay(e)}`;
    }
    return fmtDay(s);
  } catch {
    return weekStart;
  }
}

function formatCurrency(amount: number | string | undefined, egp = 'EGP'): string {
  if (amount == null) return '—';
  const n = parseFloat(String(amount));
  if (isNaN(n)) return '—';
  return `${n.toFixed(0)} ${egp}`;
}

const COUNTDOWN_EXPIRED = '__EXPIRED__';

// Countdown is display-only. renewalDeadline is NEVER used for logic decisions.
// The backend status field is the single source of truth for all UI state.
function formatCountdown(deadlineIso: string | undefined | null): string {
  if (!deadlineIso) return '--';
  const t = Date.parse(deadlineIso);
  if (isNaN(t)) return '--';
  const ms = t - Date.now();
  if (ms <= 0) return COUNTDOWN_EXPIRED;
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
  const { t, isRTL, language } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const locale = language === 'ar' ? 'ar-EG' : 'en-GB';

  const { myBookings, renewalBooking, refetch } = useShuttle();
  const queryClient = useQueryClient();

  const [mainTab, setMainTab] = useState<MainTab>('upcoming');
  const [selectedBooking, setSelectedBooking] = useState<ShuttleBooking | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tripPage, setTripPage] = useState(1);
  const [declineModalId, setDeclineModalId] = useState<string | null>(null);
  const TRIP_LIMIT = 10;

  // ── Queries ────────────────────────────────────────────────────────────────

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

  // 'booked' is the confirmed-booking status returned by the backend;
  // 'active' is an alias used in some backend versions;
  // 'pending_renewal' means the driver must confirm for the next week.
  const upcomingBookings = myBookings.filter(
    b => b.status === 'booked' || b.status === 'active' || b.status === 'pending_renewal'
  );
  if (__DEV__) {
    const currentSunStr = toLocalDateString(getCurrentWeekSunday());
    console.log('[Bookings] myBookings count:', myBookings.length);
    console.log('[Bookings] currentWeekSunday (local):', currentSunStr);
    myBookings.forEach(b => {
      const normalized = normalizeWeekStart(b.weekStart);
      const bucket = getWeekBucket(b.weekStart);
      console.log(
        `[Bookings] id=${b.id} status="${b.status}" weekStart="${b.weekStart}" → normalized="${normalized}" bucket="${bucket}"`
      );
    });
    console.log('[Bookings] upcomingBookings:', upcomingBookings.length);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  const confirmRenewalMutation = useMutation({
    mutationFn: (id: string) => endpoints.shuttle.confirmRenewal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      refetch();
      Alert.alert('', t.renewal_confirmed_success);
    },
    onError: (err) => {
      const apiErr = err instanceof ApiError ? err : null;
      const body = apiErr?.body as Record<string, unknown> | null;
      const msg =
        (typeof body?.error === 'string' ? body.error : null) ??
        (typeof body?.message === 'string' ? body.message : null) ??
        (apiErr?.status === 409 ? t.renewal_conflict_error : null) ??
        t.renewal_failed_error;
      Alert.alert('', msg);
    },
  });

  const declineRenewalMutation = useMutation({
    mutationFn: (id: string) => endpoints.shuttle.declineRenewal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-available-weeks'] });
      refetch();
    },
    onError: (err) => {
      const apiErr = err instanceof ApiError ? err : null;
      const body = apiErr?.body as Record<string, unknown> | null;
      const msg =
        (typeof body?.error === 'string' ? body.error : null) ??
        (typeof body?.message === 'string' ? body.message : null) ??
        t.decline_renewal_failed;
      Alert.alert('', msg);
    },
  });

  const handleConfirmRenewal = (booking: ShuttleBooking) => {
    if (booking.status !== 'pending_renewal') {
      Alert.alert('', t.renewal_not_available);
      return;
    }
    if (confirmRenewalMutation.isPending || declineRenewalMutation.isPending) return;
    Alert.alert(
      t.confirm_renewal_title,
      t.confirm_renewal_body,
      [
        { text: t.back, style: 'cancel' },
        {
          text: t.confirm_renewal_title,
          onPress: () => confirmRenewalMutation.mutate(booking.id),
        },
      ]
    );
  };

  const handleDeclineRenewal = (bookingId: string) => {
    if (declineRenewalMutation.isPending || confirmRenewalMutation.isPending) return;
    setDeclineModalId(bookingId);
  };

  const handleDeclineModalClose = () => {
    setDeclineModalId(null);
  };

  const handleDeclineConfirm = () => {
    if (!declineModalId) return;
    const id = declineModalId;
    setDeclineModalId(null);
    declineRenewalMutation.mutate(id);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    refetch();
    queryClient.invalidateQueries({ queryKey: ['shuttle-driver-trips'] });
    setTimeout(() => setRefreshing(false), 1200);
  };

  const renewalPending = confirmRenewalMutation.isPending || declineRenewalMutation.isPending;
  // renewalPending kept for button disabled states inside mutations

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
        <Text style={[styles.pageTitle, { color: colors.foreground, textAlign: TA }]}>
          {t.my_bookings}
        </Text>
        <Text style={[styles.pageSub, { color: colors.mutedForeground, textAlign: TA }]}>
          {t.weekly_schedule_subtitle}
        </Text>

        {/* Renewal banner — visible only when backend status is pending_renewal */}
        {renewalBooking && (
          <RenewalBanner
            booking={renewalBooking}
            confirmPending={confirmRenewalMutation.isPending}
            declinePending={declineRenewalMutation.isPending}
            onConfirm={() => handleConfirmRenewal(renewalBooking)}
            onDecline={() => handleDeclineRenewal(renewalBooking.id)}
          />
        )}

        {/* Main tabs */}
        <View style={[styles.mainTabRow, { borderColor: colors.border }]}>
          <MainTabBtn
            label={t.upcoming_trips}
            count={upcomingBookings.length}
            active={mainTab === 'upcoming'}
            onPress={() => setMainTab('upcoming')}
            colors={colors}
          />
          <MainTabBtn
            label={t.completed_trips_tab}
            count={driverTripsTotal || driverTrips.length}
            active={mainTab === 'completed'}
            onPress={() => setMainTab('completed')}
            colors={colors}
          />
        </View>

        {/* ── Upcoming tab ── */}
        {mainTab === 'upcoming' && (
          <>
            {upcomingBookings.length === 0 ? (
              <View style={styles.smartEmptyState}>
                <Calendar size={40} color={colors.mutedForeground} strokeWidth={1.2} />
                <Text style={[styles.smartEmptyTitle, { color: colors.foreground }]}>
                  {t.no_scheduled_trips_week}
                </Text>
                <Pressable
                  onPress={() => router.push('/(shuttle)/lines')}
                  style={({ pressed }) => [
                    styles.smartEmptyCta,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={styles.smartEmptyCtaText}>
                    {t.browse_available_book}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 8, marginTop: 4 }}>
                {upcomingBookings.map(b => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    colors={colors}
                    onPress={() =>
                      router.push({
                        pathname: '/shuttle/trip-details',
                        params: {
                          bookingId: String(b.id),
                          routeId: String(b.routeId),
                          routeName: b.routeName,
                          routeNameAr: b.routeNameAr ?? '',
                          departureTime: b.departureTime,
                          weekStart: b.weekStart ?? '',
                          weekEnd: b.weekEnd ?? '',
                          status: b.status,
                        },
                      } as any)
                    }
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
                  {t.no_completed_trips_yet}
                </Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  {t.completed_trips_appear}
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
                          {t.prev_page}
                        </Text>
                      </Pressable>
                    )}
                    <Text style={[styles.pageIndicator, { color: colors.mutedForeground }]}>
                      {t.page_label_prefix} {tripPage}
                    </Text>
                    {hasMoreTrips && (
                      <Pressable
                        style={[styles.pageBtn, { borderColor: colors.border }]}
                        onPress={() => setTripPage(p => p + 1)}
                      >
                        <Text style={[styles.pageBtnText, { color: colors.foreground }]}>
                          {t.next_page}
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

      {/* ── Decline Renewal Dialog ────────────────────────────────── */}
      <Modal
        visible={!!declineModalId}
        transparent
        animationType="fade"
        onRequestClose={handleDeclineModalClose}
      >
        <View style={styles.dialogOverlay}>
          <View style={[styles.dialogCard, { backgroundColor: '#ffffff' }]}>
            <View style={[styles.dialogIconRow, { backgroundColor: '#FEF2F2' }]}>
              <AlertTriangle size={28} color="#DC2626" strokeWidth={2} />
            </View>
            <View style={styles.dialogBody}>
              <Text style={[styles.dialogTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>
                {t.decline_route_title}
              </Text>
              <Text style={[styles.dialogBodyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
                {t.decline_route_body}
              </Text>
            </View>
            <View style={[styles.dialogButtons, { borderTopColor: colors.border }]}>
              <Pressable
                onPress={handleDeclineModalClose}
                style={({ pressed }) => [styles.dialogBtnSecondary, { backgroundColor: pressed ? colors.secondary : '#fff', borderColor: colors.border }]}
              >
                <Text style={[styles.dialogBtnLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.back}</Text>
              </Pressable>
              <Pressable
                onPress={handleDeclineConfirm}
                style={({ pressed }) => [styles.dialogBtnDestructive, { backgroundColor: pressed ? '#b91c1c' : '#DC2626' }]}
              >
                {declineRenewalMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[styles.dialogBtnLabel, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{t.decline_renewal_label}</Text>
                }
              </Pressable>
            </View>
          </View>
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
  const { t, isRTL } = useI18n();
  const locale = isRTL ? 'ar-EG' : 'en-GB';
  // countdown is display-only — never drives UI state
  const [countdown, setCountdown] = useState(() =>
    formatCountdown(booking.renewalDeadline)
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown(formatCountdown(booking.renewalDeadline));
    }, 1000);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [booking.renewalDeadline]);

  const countdownExpired = countdown === COUNTDOWN_EXPIRED || countdown === '--';

  return (
    <View style={styles.renewalBanner}>
      {/* Header row */}
      <View style={styles.renewalHeaderRow}>
        <AlertTriangle size={16} color="#D97706" strokeWidth={2.5} />
        <Text style={styles.renewalTitle}>{t.weekly_renewal_title}</Text>
        {!countdownExpired && (
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
        {booking.weekStart ? `  ·  ${formatWeekRange(booking.weekStart, booking.weekEnd, locale)}` : ''}
      </Text>

      <Text style={styles.renewalBody}>
        {t.weekly_renewal_body}
      </Text>

      {/* Actions — always rendered; visibility driven by booking.status === 'pending_renewal' */}
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
              <Text style={styles.renewalConfirmLabel}>{t.confirm_renewal_title}</Text>
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
            <Text style={styles.renewalDeclineLabel}>{t.decline_renewal_label}</Text>
          )}
        </Pressable>
      </View>
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
  const { t, isRTL } = useI18n();
  const locale = isRTL ? 'ar-EG' : 'en-GB';
  // hasRenewal is display-only (pill badge) — driven by backend status
  const hasRenewal = booking.status === 'pending_renewal';

  const bucket = getWeekBucket(booking.weekStart);
  const weekLabel =
    bucket === 'current' ? t.current_week :
    bucket === 'next' ? t.next_week_label : '';

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
              {formatWeekRange(booking.weekStart, booking.weekEnd, locale)}
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
          {booking.trip ? (
            !booking.trip.thresholdMet ? (
              <View style={[styles.renewalPill, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1 }]}>
                <Text style={[styles.renewalPillText, { color: '#92400E' }]}>
                  {t.status_pending}
                </Text>
              </View>
            ) : (
              <View style={[styles.renewalPill, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC', borderWidth: 1 }]}>
                <Text style={[styles.renewalPillText, { color: '#166534' }]}>
                  {t.active}
                </Text>
              </View>
            )
          ) : null}
          {hasRenewal && (
            <View style={[styles.renewalPill, { backgroundColor: '#FEF3C718' }]}>
              <AlertTriangle size={9} color="#D97706" strokeWidth={2.5} />
              <Text style={styles.renewalPillText}>{t.renew_label}</Text>
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
  const { t } = useI18n();
  const netEarnings = formatCurrency(trip.earnings, t.egp);
  const grossRevenue = trip.revenueAmount != null ? formatCurrency(trip.revenueAmount, t.egp) : null;
  const passengersLabel =
    trip.boardedPassengers != null && trip.totalPassengers != null
      ? `${trip.boardedPassengers} / ${trip.totalPassengers} ${t.pax_one}`
      : trip.boardedPassengers != null
      ? `${trip.boardedPassengers} ${t.pax_one}`
      : '—';

  return (
    <View style={[styles.tripCard, { backgroundColor: '#fff', borderColor: colors.border }]}>
      <View style={[styles.tripCardAccent, { backgroundColor: '#22c55e' }]} />
      <View style={{ flex: 1, gap: 5 }}>
        <Text
          style={[styles.bookingCardRoute, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {trip.routeName ?? t.shuttle_trip_default}
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
        {grossRevenue && (
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {t.gross_revenue} {grossRevenue}
          </Text>
        )}
        <View style={[styles.completedBadge, { backgroundColor: '#22c55e18' }]}>
          <CheckCircle size={9} color="#16a34a" strokeWidth={2.5} />
          <Text style={[styles.completedBadgeText, { color: '#16a34a' }]}>{t.completed_label}</Text>
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
  const { t, isRTL } = useI18n();
  const locale = isRTL ? 'ar-EG' : 'en-GB';

  const { data: detailRaw, refetch: refetchDetail } = useQuery<BookingDetail>({
    queryKey: ['shuttle-booking-detail', booking.id],
    queryFn: () => endpoints.shuttle.bookingDetail(booking.id) as Promise<BookingDetail>,
    staleTime: 15_000,
    // No interval polling — live passenger count is pushed via SLOT_TAKEN / SLOT_RELEASED
    // socket events (handled in the useEffect below). Manual refresh via the ↺ icon.
    retry: false,
  });

  useEffect(() => {
    if (!socket) return;

    const handlePassengerUpdated = (data: { bookingId: string; bookedSeats: number; thresholdMet: boolean }) => {
      if (String(data.bookingId) !== String(booking.id)) return;
      queryClient.setQueryData<BookingDetail>(['shuttle-booking-detail', booking.id], (prev) =>
        prev ? { ...prev, bookedSeats: data.bookedSeats, thresholdMet: data.thresholdMet } : prev
      );
    };

    const handleSlotTaken = () => { refetchDetail(); };

    socket.on(SOCKET_EVENTS.BOOKING_PASSENGER_UPDATED, handlePassengerUpdated);
    socket.on(SOCKET_EVENTS.SLOT_TAKEN, handleSlotTaken);
    return () => {
      socket.off(SOCKET_EVENTS.BOOKING_PASSENGER_UPDATED, handlePassengerUpdated);
      socket.off(SOCKET_EVENTS.SLOT_TAKEN, handleSlotTaken);
    };
  }, [socket, booking.id, refetchDetail, queryClient]);

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
          routeNameAr: booking.routeNameAr ?? '',
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
          routeNameAr: booking.routeNameAr ?? '',
          departureTime: booking.departureTime,
          fromStation: booking.fromStation ?? '',
          toStation: booking.toStation ?? '',
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
              ? `  ·  ${formatWeekRange(booking.weekStart, booking.weekEnd, locale)}`
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
              {thresholdMet ? t.threshold_met_status : t.threshold_waiting_status}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.thresholdBadge,
              { backgroundColor: '#1e1e2808', borderColor: colors.border },
            ]}
          >
            <GitBranch size={14} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.thresholdBadgeText, { color: colors.mutedForeground }]}>
              {t.booking_confirmed_waiting}
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
                {t.booked_passengers_label}
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
                {t.pax_one}
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
                {t.min_required_passengers.replace('{n}', String(minRequired))}
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
            label={t.departure_time_label}
            value={booking.departureTime}
            colors={colors}
          />
          <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
          <InfoRow
            icon={<Calendar size={14} color={colors.mutedForeground} strokeWidth={2} />}
            label={t.weekly_period_label}
            value={formatWeekRange(booking.weekStart, booking.weekEnd, locale)}
            colors={colors}
          />
          <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
          <InfoRow
            icon={<GitBranch size={14} color={colors.mutedForeground} strokeWidth={2} />}
            label={t.booking_number_label}
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
                {t.cancel_trip_label}
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
                {t.refer_driver_label}
              </Text>
            </Pressable>
          </View>
        )}

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

  // Empty states
  emptyState: { alignItems: 'center', marginTop: 48, gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  loaderWrap: { padding: 32, alignItems: 'center' },

  // Smart empty state (upcoming tab — no scheduled week blocks)
  smartEmptyState: {
    alignItems: 'center',
    marginTop: 56,
    marginHorizontal: 8,
    gap: 16,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  smartEmptyTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    lineHeight: 24,
  },
  smartEmptyCta: {
    marginTop: 4,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
  },
  smartEmptyCtaText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    textAlign: 'center',
  },

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
  dialogIconRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 28,
    paddingBottom: 12,
  },
  dialogBody: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  dialogTitle: { fontSize: 18, marginBottom: 10 },
  dialogBodyText: { fontSize: 14, lineHeight: 22 },
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
  dialogBtnDestructive: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnLabel: { fontSize: 13, letterSpacing: 0.3, fontFamily: 'Inter_700Bold' },
});
