import { showAlert } from '@/lib/alert';
import { router } from 'expo-router';
import {
  AlertTriangle, Calendar, CheckCircle, Clock,
  GitBranch, RefreshCw, Send, Trash2, Users, X,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useShuttle, type ShuttleBooking } from '@/lib/shuttleContext';
import { endpoints, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18nContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { TAB_BAR_HEIGHT_BASE } from '@/constants/tabBar';
import { UpcomingTripCard } from '@/components/UpcomingTripCard';
import { CompletedTripCard } from '@/components/CompletedTripCard';
import { MainTabBtn } from '@/components/MainTabBtn';
import { RenewalBanner } from '@/components/RenewalBanner';

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'upcoming' | 'completed';

import type { DriverTrip } from '@/lib/types';

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

export function getWeekBucket(weekStart: string): WeekBucket {
  const currentSun = getCurrentWeekSunday();
  const nextSun = new Date(currentSun);
  nextSun.setDate(currentSun.getDate() + 7);

  const ws = normalizeWeekStart(weekStart);
  if (ws === toLocalDateString(currentSun)) return 'current';
  if (ws === toLocalDateString(nextSun)) return 'next';
  return 'other';
}

export function formatWeekRange(weekStart: string, weekEnd?: string, locale = 'ar-EG'): string {
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

export function formatCurrency(amount: number | string | undefined, egp = 'EGP'): string {
  if (amount == null) return '—';
  const n = parseFloat(String(amount));
  if (isNaN(n)) return '—';
  return `${n.toFixed(0)} ${egp}`;
}

export const COUNTDOWN_EXPIRED = '__EXPIRED__';

// Countdown is display-only. renewalDeadline is NEVER used for logic decisions.
// The backend status field is the single source of truth for all UI state.
export function formatCountdown(deadlineIso: string | undefined | null): string {
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
  const topPad = insets.top;
  const tabBarHeight = TAB_BAR_HEIGHT_BASE + insets.bottom;
  const { t, isRTL, language } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const locale = language === 'ar' ? 'ar-EG' : 'en-GB';

  const { myBookings, allLines, renewalBooking, refetch } = useShuttle();
  const queryClient = useQueryClient();

  const [mainTab, setMainTab] = useState<MainTab>('upcoming');
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
  // Backend (GET /shuttle/driver/my-trips) returns { data, total, page, limit },
  // and each item's id field is `tripId`, not `id` — remapped here since
  // DriverTrip (and CompletedTripCard's key={trip.id}) expects `id`.
  const driverTripsData = driverTripsRaw as { data?: (DriverTrip & { tripId?: string | number })[]; total?: number } | undefined;
  const driverTrips: DriverTrip[] = (driverTripsData?.data ?? []).map((t) => ({ ...t, id: String(t.tripId ?? t.id) }));
  const driverTripsTotal = driverTripsData?.total ?? 0;
  const hasMoreTrips = driverTrips.length > 0 && tripPage * TRIP_LIMIT < driverTripsTotal;

  // ── Derived booking lists ──────────────────────────────────────────────────

  // One card per actual trip, not per weekly booking — matches home.tsx's
  // Upcoming Trips list (each day is an independent trip with its own
  // passengers/status; a cancelled or expired trip must stop showing here
  // even while the rest of the week's booking stays active).
  const upcomingLines = allLines
    .filter(l => l.tripId && l.status === 'upcoming')
    .sort((a, b) => new Date(a.departureIso ?? 0).getTime() - new Date(b.departureIso ?? 0).getTime());
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
    console.log('[Bookings] upcomingLines:', upcomingLines.length);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  const confirmRenewalMutation = useMutation({
    mutationFn: (id: string) => endpoints.shuttle.confirmRenewal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      refetch();
      showAlert('', t.renewal_confirmed_success);
    },
    onError: (err) => {
      const apiErr = err instanceof ApiError ? err : null;
      const body = apiErr?.body as Record<string, unknown> | null;
      const msg =
        (typeof body?.error === 'string' ? body.error : null) ??
        (typeof body?.message === 'string' ? body.message : null) ??
        (apiErr?.status === 409 ? t.renewal_conflict_error : null) ??
        t.renewal_failed_error;
      showAlert('', msg);
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
      showAlert('', msg);
    },
  });

  const handleConfirmRenewal = (booking: ShuttleBooking) => {
    if (booking.status !== 'pending_renewal') {
      showAlert('', t.renewal_not_available);
      return;
    }
    if (confirmRenewalMutation.isPending || declineRenewalMutation.isPending) return;
    showAlert(
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
          paddingBottom: tabBarHeight + 24,
          paddingHorizontal: Spacing.lg,
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
            count={upcomingLines.length}
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
            {upcomingLines.length === 0 ? (
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
              <View style={{ gap: Spacing.sm, marginTop: Spacing.xs }}>
                {upcomingLines.map(line => {
                  // The weekly booking this trip belongs to — still needed to
                  // open /shuttle/trip-details for the Start Trip flow.
                  // tripId is passed separately so Cancel acts on this exact
                  // trip, not the week.
                  const b = myBookings.find(mb =>
                    String(mb.routeId) === String(line.routeId) &&
                    (!mb.direction || !line.direction || mb.direction === line.direction)
                  );
                  return (
                    <UpcomingTripCard
                      key={line.id}
                      line={line}
                      colors={colors}
                      isRTL={isRTL}
                      onPress={() => {
                        if (!b) return;
                        router.push({
                          pathname: '/shuttle/trip-details',
                          params: {
                            bookingId: String(b.id),
                            tripId: line.tripId ?? '',
                            routeId: String(b.routeId),
                            routeName: b.routeName,
                            routeNameAr: b.routeNameAr ?? '',
                            departureTime: b.departureTime,
                            weekStart: b.weekStart ?? '',
                            weekEnd: b.weekEnd ?? '',
                            status: b.status,
                          },
                        } as any);
                      }}
                    />
                  );
                })}
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
              <View style={{ gap: Spacing.sm, marginTop: Spacing.xs }}>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  pageTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'right', paddingTop: Spacing.sm },
  pageSub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: Spacing.xs },

  // Main tabs
  mainTabRow: {
    flexDirection: 'row',
    marginTop: 20,
    borderBottomWidth: 1,
  },
  // Empty states
  emptyState: { alignItems: 'center', marginTop: 48, gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  loaderWrap: { padding: Spacing.xxl, alignItems: 'center' },

  // Smart empty state (upcoming tab — no scheduled week blocks)
  smartEmptyState: {
    alignItems: 'center',
    marginTop: 56,
    marginHorizontal: Spacing.sm,
    gap: Spacing.lg,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 40,
    paddingHorizontal: Spacing.xl,
  },
  smartEmptyTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    lineHeight: 24,
  },
  smartEmptyCta: {
    marginTop: Spacing.xs,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
  },
  smartEmptyCtaText: {
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    textAlign: 'center',
  },

  // Pagination
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
  },
  pageBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  pageBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  pageIndicator: { fontSize: 13, fontFamily: 'Inter_400Regular' },

  // Bottom sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
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
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Threshold badge
  thresholdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
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
  passengerTotal: { fontSize: Typography.size.lg, fontFamily: 'Inter_400Regular' },
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
    paddingVertical: Spacing.md,
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
    gap: Spacing.sm,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnLabel: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },

  // ── Dialog styles ──────────────────────────────────────────────────
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
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
    paddingBottom: Spacing.md,
  },
  dialogBody: { paddingHorizontal: 20, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  dialogTitle: { fontSize: Typography.size.lg, marginBottom: 10 },
  dialogBodyText: { fontSize: Typography.size.sm, lineHeight: 22 },
  dialogButtons: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 10,
  },
  dialogBtnSecondary: {
    flex: 1,
    height: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnDestructive: {
    flex: 1,
    height: 46,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnLabel: { fontSize: 13, letterSpacing: 0.3, fontFamily: 'Inter_700Bold' },
});
