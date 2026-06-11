import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertTriangle, ArrowLeft, Calendar, CheckCircle, Clock,
  GitBranch, RefreshCw, Star, Trash2, Users, XCircle,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { useShuttle, type ShuttleBooking } from '@/lib/shuttleContext';
import { endpoints, ApiError } from '@/lib/api';

const TAB_BAR_HEIGHT = 96;

type DriverTrip = {
  id: string;
  routeName?: string;
  date?: string;
  boardedPassengers?: number;
  totalPassengers?: number;
  earnings?: number | string;
  status?: string;
};

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusConfig(status: string, colors: ReturnType<typeof useColors>) {
  if (status === 'cancelled') return { text: 'Cancelled', bg: colors.secondary, color: colors.mutedForeground, Icon: XCircle };
  if (status === 'completed') return { text: 'Completed', bg: '#22c55e18', color: '#16a34a', Icon: CheckCircle };
  if (status === 'active') return { text: 'Active', bg: '#22c55e18', color: '#16a34a', Icon: CheckCircle };
  return { text: 'Booked', bg: '#3D52D520', color: '#3D52D5', Icon: Calendar };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BookingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { myBookings, refetch } = useShuttle();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<ShuttleBooking | null>(null);
  // Fix 6: driver trip history pagination
  const [tripPage, setTripPage] = useState(1);
  const TRIP_LIMIT = 10;

  // Fix 6: fetch driver trip history
  const { data: driverTripsRaw, isLoading: tripsLoading } = useQuery({
    queryKey: ['shuttle-driver-trips', tripPage],
    queryFn: () => endpoints.shuttle.driverTrips(tripPage, TRIP_LIMIT),
    staleTime: 30000,
  });
  const driverTripsData = driverTripsRaw as { trips?: DriverTrip[]; total?: number } | undefined;
  const driverTrips: DriverTrip[] = driverTripsData?.trips ?? [];
  const driverTripsTotal = driverTripsData?.total ?? 0;
  const hasMoreTrips = driverTrips.length > 0 && tripPage * TRIP_LIMIT < driverTripsTotal;

  const handleRefresh = () => {
    setRefreshing(true);
    refetch();
    queryClient.invalidateQueries({ queryKey: ['shuttle-driver-trips'] });
    setTimeout(() => setRefreshing(false), 1200);
  };

  const cancelMutation = useMutation({
    mutationFn: (id: string) => endpoints.shuttle.cancelBooking(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      setSelectedBooking(null);
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
      setSelectedBooking(null);
    },
    onError: () => {
      Alert.alert('Renewal Failed', 'Could not confirm renewal. Please try again.', [{ text: 'OK' }]);
    },
  });

  const handleCancelPress = (booking: ShuttleBooking) => {
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

  const handleRenewPress = (booking: ShuttleBooking) => {
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

  const upcomingBookings = myBookings.filter(b => b.status !== 'completed' && b.status !== 'cancelled');
  const historyBookings = myBookings.filter(b => b.status === 'completed' || b.status === 'cancelled');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: TAB_BAR_HEIGHT + 24, paddingHorizontal: 16 }}
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
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
          My Bookings
        </Text>
        <Text style={[styles.pageSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
          Your trip history and upcoming slots
        </Text>

        {/* Summary chips */}
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: '#1e1e2820', borderColor: '#1e1e2833' }]}>
            <GitBranch size={12} color="#2d2d42" strokeWidth={2} />
            <Text style={[styles.chipText, { color: '#2d2d42', fontFamily: 'Inter_700Bold' }]}>
              {myBookings.length} total
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: '#3D52D520', borderColor: '#3D52D533' }]}>
            <Calendar size={12} color="#3D52D5" strokeWidth={2} />
            <Text style={[styles.chipText, { color: '#3D52D5', fontFamily: 'Inter_700Bold' }]}>
              {upcomingBookings.length} upcoming
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: '#22c55e18', borderColor: '#22c55e33' }]}>
            <CheckCircle size={12} color="#16a34a" strokeWidth={2} />
            <Text style={[styles.chipText, { color: '#16a34a', fontFamily: 'Inter_700Bold' }]}>
              {historyBookings.filter(b => b.status === 'completed').length} done
            </Text>
          </View>
        </View>

        {myBookings.length === 0 && (
          <View style={styles.emptyState}>
            <GitBranch size={40} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              No bookings yet
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Head to the Lines tab to book a route
            </Text>
          </View>
        )}

        {/* Upcoming */}
        {upcomingBookings.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              Upcoming
            </Text>
            <View style={{ gap: 8 }}>
              {upcomingBookings.map(b => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  colors={colors}
                  onPress={() => setSelectedBooking(b)}
                />
              ))}
            </View>
          </>
        )}

        {/* History */}
        {historyBookings.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA, marginTop: upcomingBookings.length > 0 ? 24 : 0 }]}>
              History
            </Text>
            <View style={{ gap: 8 }}>
              {historyBookings.map(b => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  colors={colors}
                  onPress={() => setSelectedBooking(b)}
                />
              ))}
            </View>
          </>
        )}

        {/* Fix 6: Driver trip history */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA, marginTop: 28 }]}>
          Completed Trips
        </Text>
        <Text style={[styles.pageSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA, marginBottom: 12 }]}>
          Trips you've driven for passengers
        </Text>

        {tripsLoading ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : driverTrips.length === 0 ? (
          <GlassView style={[styles.emptyTripsCard, { borderColor: colors.border }]} borderRadius={16}>
            <Users size={24} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 0 }]}>
              No completed trips yet
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>
              Completed shuttle trips will appear here
            </Text>
          </GlassView>
        ) : (
          <View style={{ gap: 8 }}>
            {driverTrips.map(trip => (
              <DriverTripRow key={trip.id} trip={trip} colors={colors} />
            ))}

            {/* Pagination */}
            {(hasMoreTrips || tripPage > 1) && (
              <View style={styles.paginationRow}>
                {tripPage > 1 && (
                  <Pressable
                    style={[styles.pageBtn, { borderColor: colors.border }]}
                    onPress={() => setTripPage(p => Math.max(1, p - 1))}
                  >
                    <Text style={[styles.pageBtnText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>← Prev</Text>
                  </Pressable>
                )}
                <Text style={[styles.pageIndicator, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  Page {tripPage}
                </Text>
                {hasMoreTrips && (
                  <Pressable
                    style={[styles.pageBtn, { borderColor: colors.border }]}
                    onPress={() => setTripPage(p => p + 1)}
                  >
                    <Text style={[styles.pageBtnText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Next →</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Detail bottom sheet */}
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
              cancelPending={cancelMutation.isPending}
              renewPending={renewalMutation.isPending}
              onClose={() => setSelectedBooking(null)}
              onCancel={() => handleCancelPress(selectedBooking)}
              onRenew={() => handleRenewPress(selectedBooking)}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Booking row (list item) ───────────────────────────────────────────────────

function BookingRow({
  booking,
  colors,
  onPress,
}: {
  booking: ShuttleBooking;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const cfg = statusConfig(booking.status, colors);
  const StatusIcon = cfg.Icon;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <GlassView style={styles.bookingRow} borderRadius={16}>
        <View style={[styles.rowAccent, { backgroundColor: cfg.color }]} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.rowRoute, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
            {booking.routeName}
          </Text>
          <View style={styles.rowMeta}>
            <Clock size={11} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.rowMetaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {booking.departureTime}
            </Text>
            <Text style={[{ color: colors.border }]}>·</Text>
            <Calendar size={11} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.rowMetaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {booking.weekStart}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <StatusIcon size={11} color={cfg.color} strokeWidth={2.5} />
          <Text style={[styles.statusText, { color: cfg.color, fontFamily: 'Inter_700Bold' }]}>
            {cfg.text}
          </Text>
        </View>
      </GlassView>
    </Pressable>
  );
}

// Fix 6: Driver trip row
function DriverTripRow({ trip, colors }: { trip: DriverTrip; colors: ReturnType<typeof useColors> }) {
  const isCompleted = trip.status === 'completed';
  const earnings = trip.earnings != null ? `${parseFloat(String(trip.earnings)).toFixed(2)} DT` : '—';
  const occupancy = trip.boardedPassengers != null && trip.totalPassengers != null
    ? `${trip.boardedPassengers}/${trip.totalPassengers}`
    : '—';

  return (
    <GlassView style={styles.driverTripRow} borderRadius={16}>
      <View style={[styles.rowAccent, { backgroundColor: isCompleted ? '#16a34a' : colors.mutedForeground }]} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.rowRoute, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
          {trip.routeName ?? 'Shuttle Trip'}
        </Text>
        <View style={styles.rowMeta}>
          {trip.date && (
            <>
              <Calendar size={11} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[styles.rowMetaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {trip.date}
              </Text>
              <Text style={[{ color: colors.border }]}>·</Text>
            </>
          )}
          <Users size={11} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[styles.rowMetaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {occupancy} passengers
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.tripEarnings, { color: '#16a34a', fontFamily: 'Inter_700Bold' }]}>
          {earnings}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: isCompleted ? '#22c55e18' : colors.secondary }]}>
          <Star size={9} color={isCompleted ? '#16a34a' : colors.mutedForeground} strokeWidth={2} fill={isCompleted ? '#16a34a' : 'transparent'} />
          <Text style={[styles.statusText, { color: isCompleted ? '#16a34a' : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
            {trip.status ?? 'completed'}
          </Text>
        </View>
      </View>
    </GlassView>
  );
}

// ─── Booking detail sheet ─────────────────────────────────────────────────────

function BookingDetailSheet({
  booking,
  colors,
  insetBottom,
  cancelPending,
  renewPending,
  onClose,
  onCancel,
  onRenew,
}: {
  booking: ShuttleBooking;
  colors: ReturnType<typeof useColors>;
  insetBottom: number;
  cancelPending: boolean;
  renewPending: boolean;
  onClose: () => void;
  onCancel: () => void;
  onRenew: () => void;
}) {
  const cfg = statusConfig(booking.status, colors);
  const StatusIcon = cfg.Icon;
  const isCompleted = booking.status === 'completed' || booking.status === 'cancelled';
  const hasRenewal = !!booking.renewalDeadline && new Date(booking.renewalDeadline).getTime() > Date.now();

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insetBottom + 20 }]}>
      <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

      {/* Header */}
      <View style={styles.sheetHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={2}>
            {booking.routeName}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg, alignSelf: 'flex-start', marginTop: 6 }]}>
            <StatusIcon size={11} color={cfg.color} strokeWidth={2.5} />
            <Text style={[styles.statusText, { color: cfg.color, fontFamily: 'Inter_700Bold' }]}>{cfg.text}</Text>
          </View>
        </View>
        <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.secondary }]} hitSlop={8}>
          <XCircle size={18} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
        {/* Info rows */}
        <GlassView style={styles.infoCard} borderRadius={16}>
          <DetailRow icon={<Clock size={16} color={colors.mutedForeground} strokeWidth={2} />} label="Departure" value={booking.departureTime} colors={colors} />
          <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
          <DetailRow icon={<Calendar size={16} color={colors.mutedForeground} strokeWidth={2} />} label="Week" value={`${booking.weekStart}${booking.weekEnd ? ` → ${booking.weekEnd}` : ''}`} colors={colors} />
          <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
          <DetailRow icon={<GitBranch size={16} color={colors.mutedForeground} strokeWidth={2} />} label="Booking ID" value={`#${booking.id.slice(0, 8).toUpperCase()}`} colors={colors} />
        </GlassView>

        {/* Renewal banner */}
        {hasRenewal && (
          <View style={[styles.renewalBanner, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B44' }]}>
            <AlertTriangle size={14} color="#D97706" strokeWidth={2} />
            <Text style={[styles.renewalBannerText, { color: '#D97706', fontFamily: 'Inter_400Regular' }]}>
              Renewal available — deadline{' '}
              {new Date(booking.renewalDeadline!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
          </View>
        )}

        {/* Actions */}
        {!isCompleted && (
          <View style={{ gap: 10 }}>
            {hasRenewal && (
              <Pressable
                onPress={onRenew}
                disabled={renewPending}
                style={({ pressed }) => [styles.actionBtn, { backgroundColor: '#F59E0B', opacity: pressed ? 0.85 : 1 }]}
              >
                {renewPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <RefreshCw size={16} color="#fff" strokeWidth={2} />
                    <Text style={[styles.actionBtnText, { fontFamily: 'Inter_700Bold' }]}>Confirm Renewal</Text>
                  </>
                )}
              </Pressable>
            )}
            <Pressable
              onPress={onCancel}
              disabled={cancelPending}
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.destructive + '18', borderWidth: 1, borderColor: colors.destructive + '44', opacity: pressed ? 0.85 : 1 }]}
            >
              {cancelPending ? (
                <ActivityIndicator color={colors.destructive} size="small" />
              ) : (
                <>
                  <Trash2 size={16} color={colors.destructive} strokeWidth={2} />
                  <Text style={[styles.actionBtnText, { color: colors.destructive, fontFamily: 'Inter_700Bold' }]}>Cancel Booking</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.detailRow}>
      {icon}
      <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 24, paddingTop: 8 },
  pageSub: { fontSize: 13, marginTop: 4 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12 },
  sectionTitle: { fontSize: 14, marginTop: 20, marginBottom: 10 },
  emptyState: { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16 },
  emptySub: { fontSize: 13, textAlign: 'center' },
  emptyTripsCard: { flexDirection: 'column', alignItems: 'center', gap: 8, padding: 24, borderWidth: 1 },
  bookingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, overflow: 'hidden' },
  driverTripRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, overflow: 'hidden' },
  rowAccent: { width: 4, height: 36, borderRadius: 2 },
  rowRoute: { fontSize: 14 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowMetaText: { fontSize: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11 },
  tripEarnings: { fontSize: 13 },
  // Pagination
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  pageBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  pageBtnText: { fontSize: 13 },
  pageIndicator: { fontSize: 13 },
  // Sheet
  sheetOverlay: { flex: 1, backgroundColor: '#00000060', justifyContent: 'flex-end' },
  sheet: { maxHeight: '80%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingHorizontal: 20, overflow: 'hidden' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  sheetTitle: { fontSize: 18, lineHeight: 24 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  infoCard: { padding: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  detailLabel: { fontSize: 13, flex: 1 },
  detailValue: { fontSize: 13, maxWidth: '55%', textAlign: 'right' },
  detailDivider: { height: 1, marginHorizontal: 14 },
  renewalBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  renewalBannerText: { fontSize: 12, flex: 1 },
  actionBtn: { height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionBtnText: { fontSize: 14, color: '#fff' },
});
