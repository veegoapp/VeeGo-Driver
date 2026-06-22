import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Banknote, Check, Clock, MapPin, Navigation, Ruler, Star, Users } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { endpoints } from '@/lib/api';

// Task 3: updated TripDetail to match backend spec
type TripDetail = {
  id: string;
  routeId?: string | number;
  status: 'waiting_driver' | 'driver_assigned' | 'active' | 'completed' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  cancelReason?: string;
  earnings?: { amount: string | number };
  bookings?: { id: string; passengerName?: string }[];
  // May also carry legacy fields from some backends
  date?: string;
  distance?: number | string;
  fare?: number | string;
  pickup?: string;
  destination?: string;
  riderRating?: number | string;
};

// Task 3: station shape from GET /driver/trips/:id/stations
type Station = {
  id: string;
  name: string;
  status: 'pending' | 'arrived' | 'completed';
  sequence?: number;
  arrivedAt?: string;
};

export default function TripDetailScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const queryClient = useQueryClient();

  // Cancel modal
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [stationBusy, setStationBusy] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<TripDetail>({
    queryKey: ['trip', tripId],
    queryFn: () => endpoints.trips.detail(tripId) as Promise<TripDetail>,
    enabled: !!tripId,
  });

  // Task 3: fetch stations for this trip
  const { data: stationsRaw } = useQuery<{ data: Station[] } | Station[]>({
    queryKey: ['trip-stations', tripId],
    queryFn: () => endpoints.trips.stations(tripId) as Promise<{ data: Station[] } | Station[]>,
    enabled: !!tripId && !!data && data.status !== 'completed' && data.status !== 'cancelled',
  });

  // Backend may return { data: Station[] } or Station[] directly
  const stations: Station[] = Array.isArray(stationsRaw)
    ? stationsRaw
    : (stationsRaw as { data: Station[] } | undefined)?.data ?? [];

  // Task 2 + 3: trip lifecycle handlers
  const doTripAction = async (action: 'accept' | 'reject' | 'start' | 'complete') => {
    if (actionBusy) return;
    setActionBusy(action);
    try {
      await endpoints.trips[action](tripId);
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
    } catch {
      Alert.alert('Error', `Could not ${action} trip. Please try again.`);
    } finally {
      setActionBusy(null);
    }
  };

  const doCancelConfirm = async () => {
    if (!cancelReason.trim()) return;
    setCancelBusy(true);
    try {
      await endpoints.trips.cancel(tripId, cancelReason.trim());
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
      setShowCancel(false);
      setCancelReason('');
    } catch {
      Alert.alert('Error', 'Could not cancel trip. Please try again.');
    } finally {
      setCancelBusy(false);
    }
  };

  // Task 3: station lifecycle handlers
  const doStationArrived = async (stationId: string) => {
    setStationBusy(`arrived-${stationId}`);
    try {
      await endpoints.trips.stationArrived(tripId, stationId);
      queryClient.invalidateQueries({ queryKey: ['trip-stations', tripId] });
    } catch {
      Alert.alert('Error', 'Could not mark station as arrived.');
    } finally {
      setStationBusy(null);
    }
  };

  const doStationCompleted = async (stationId: string) => {
    setStationBusy(`done-${stationId}`);
    try {
      await endpoints.trips.stationCompleted(tripId, stationId);
      queryClient.invalidateQueries({ queryKey: ['trip-stations', tripId] });
    } catch {
      Alert.alert('Error', 'Could not mark station as done.');
    } finally {
      setStationBusy(null);
    }
  };

  const fare = parseFloat(String(data?.fare ?? data?.earnings?.amount ?? 0));
  const distance = parseFloat(String(data?.distance ?? 0));
  const riderRating = parseFloat(String(data?.riderRating ?? 0));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Cancel modal */}
      <Modal visible={showCancel} transparent animationType="fade" onRequestClose={() => setShowCancel(false)}>
        <View style={styles.modalOverlay}>
          <GlassView strong style={styles.modalCard} borderRadius={24}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Cancel trip</Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Please provide a reason</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.secondary }]}
              placeholder="e.g. Vehicle breakdown"
              placeholderTextColor={colors.mutedForeground}
              value={cancelReason}
              onChangeText={setCancelReason}
              autoFocus
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.secondary }]} onPress={() => setShowCancel(false)}>
                <Text style={[styles.modalBtnText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.destructive, opacity: (!cancelReason.trim() || cancelBusy) ? 0.5 : 1 }]}
                onPress={doCancelConfirm}
                disabled={!cancelReason.trim() || cancelBusy}
              >
                {cancelBusy
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[styles.modalBtnText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>Confirm</Text>
                }
              </Pressable>
            </View>
          </GlassView>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 48, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </Pressable>

        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Trip detail</Text>
        {data?.date && (
          <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{data.date}</Text>
        )}

        {isLoading && (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {isError && (
          <GlassView style={styles.centeredState} borderRadius={20}>
            <Text style={[styles.stateTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Could not load trip</Text>
            <Text style={[styles.stateSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Go back and try again.</Text>
          </GlassView>
        )}

        {!isLoading && !isError && data && (
          <>
            {/* Stats row */}
            <GlassView style={styles.statsRow} borderRadius={20}>
              <StatCell icon={<Banknote size={18} color={colors.primary} strokeWidth={2} />} label="Fare" value={`${fare.toFixed(2)} DT`} highlight colors={colors} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <StatCell icon={<Ruler size={18} color={colors.mutedForeground} strokeWidth={2} />} label="Distance" value={distance > 0 ? `${distance.toFixed(1)} km` : '—'} colors={colors} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <StatCell icon={<Star size={18} color="#f59e0b" strokeWidth={2} fill="#f59e0b" />} label="Rating" value={riderRating > 0 ? riderRating.toFixed(1) : '—'} colors={colors} />
            </GlassView>

            {/* Route */}
            {(data.pickup || data.destination) && (
              <GlassView style={{ marginTop: 16 }} borderRadius={20}>
                <RouteRow icon={<MapPin size={16} color={colors.primary} strokeWidth={2} />} label="Pickup" value={data.pickup ?? '—'} colors={colors} />
                <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
                <RouteRow icon={<Navigation size={16} color={colors.foreground} strokeWidth={2} />} label="Destination" value={data.destination ?? '—'} colors={colors} />
              </GlassView>
            )}

            {/* Bookings count */}
            {Array.isArray(data.bookings) && data.bookings.length > 0 && (
              <GlassView style={{ marginTop: 16 }} borderRadius={20}>
                <View style={styles.detailRow}>
                  <Users size={16} color={colors.mutedForeground} strokeWidth={2} />
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Bookings</Text>
                  <Text style={[styles.detailValue, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{data.bookings.length} passengers</Text>
                </View>
              </GlassView>
            )}

            {/* Timestamps */}
            {data.date && (
              <GlassView style={{ marginTop: 16 }} borderRadius={20}>
                <View style={styles.detailRow}>
                  <Clock size={16} color={colors.mutedForeground} strokeWidth={2} />
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Date</Text>
                  <Text style={[styles.detailValue, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{data.date}</Text>
                </View>
                {data.startedAt && (
                  <>
                    <View style={[styles.rowSep, { backgroundColor: colors.border }]} />
                    <View style={styles.detailRow}>
                      <Clock size={16} color={colors.mutedForeground} strokeWidth={2} />
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Started</Text>
                      <Text style={[styles.detailValue, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{data.startedAt}</Text>
                    </View>
                  </>
                )}
                {data.completedAt && (
                  <>
                    <View style={[styles.rowSep, { backgroundColor: colors.border }]} />
                    <View style={styles.detailRow}>
                      <Check size={16} color="#22c55e" strokeWidth={2} />
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Completed</Text>
                      <Text style={[styles.detailValue, { color: '#22c55e', fontFamily: 'Inter_600SemiBold' }]}>{data.completedAt}</Text>
                    </View>
                  </>
                )}
              </GlassView>
            )}

            {/* Task 2: trip lifecycle action buttons */}
            {data.status === 'waiting_driver' && (
              <View style={[styles.actionBar, { flexDirection: 'row' }]}>
                <Pressable style={[styles.rejectBtn, { backgroundColor: colors.secondary, opacity: actionBusy ? 0.6 : 1 }]} onPress={() => doTripAction('reject')} disabled={!!actionBusy}>
                  {actionBusy === 'reject' ? <ActivityIndicator size="small" color={colors.foreground} /> : <Text style={[styles.actionBtnText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Reject</Text>}
                </Pressable>
                <Pressable style={[styles.acceptBtnWrap, { opacity: actionBusy ? 0.6 : 1 }]} onPress={() => doTripAction('accept')} disabled={!!actionBusy}>
                  <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.acceptBtnGrad}>
                    {actionBusy === 'accept' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.actionBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>Accept</Text>}
                  </LinearGradient>
                </Pressable>
              </View>
            )}

            {data.status === 'driver_assigned' && (
              <Pressable style={[styles.fullActionBtn, { opacity: actionBusy ? 0.6 : 1 }]} onPress={() => doTripAction('start')} disabled={!!actionBusy}>
                <LinearGradient colors={['#22c55e', '#16a34a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.acceptBtnGrad}>
                  {actionBusy === 'start' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.actionBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>Start Trip</Text>}
                </LinearGradient>
              </Pressable>
            )}

            {data.status === 'active' && (
              <View style={[styles.actionBar, { flexDirection: 'row' }]}>
                <Pressable style={[styles.rejectBtn, { backgroundColor: '#ef444415', opacity: actionBusy ? 0.6 : 1 }]} onPress={() => setShowCancel(true)} disabled={!!actionBusy}>
                  <Text style={[styles.actionBtnText, { color: '#ef4444', fontFamily: 'Inter_600SemiBold' }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.acceptBtnWrap, { opacity: actionBusy ? 0.6 : 1 }]} onPress={() => doTripAction('complete')} disabled={!!actionBusy}>
                  <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.acceptBtnGrad}>
                    {actionBusy === 'complete' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.actionBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>Complete</Text>}
                  </LinearGradient>
                </Pressable>
              </View>
            )}

            {/* Task 3: station lifecycle */}
            {stations.length > 0 && (
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>STATIONS</Text>
                <View style={{ gap: 10, marginTop: 10 }}>
                  {stations.map((station) => (
                    <StationRow
                      key={station.id}
                      station={station}
                      colors={colors}
                      arrivedBusy={stationBusy === `arrived-${station.id}`}
                      doneBusy={stationBusy === `done-${station.id}`}
                      onArrived={() => doStationArrived(station.id)}
                      onDone={() => doStationCompleted(station.id)}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Task 3: station row with Arrived / Done buttons
function StationRow({ station, colors, arrivedBusy, doneBusy, onArrived, onDone }: {
  station: Station;
  colors: ReturnType<typeof useColors>;
  arrivedBusy: boolean;
  doneBusy: boolean;
  onArrived: () => void;
  onDone: () => void;
}) {
  const isDone = station.status === 'completed';
  const isArrived = station.status === 'arrived';
  const dotColor = isDone ? '#22c55e' : isArrived ? '#f59e0b' : colors.border;

  return (
    <GlassView style={styles.stationCard} borderRadius={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[styles.stationDot, { backgroundColor: dotColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.stationName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{station.name}</Text>
          {station.arrivedAt && (
            <Text style={[styles.stationMeta, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Arrived: {station.arrivedAt}</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {/* Arrived button — only shown when status is pending */}
          {station.status === 'pending' && (
            <Pressable
              style={[styles.stationBtn, { backgroundColor: '#f59e0b22', opacity: arrivedBusy ? 0.6 : 1 }]}
              onPress={onArrived}
              disabled={arrivedBusy}
            >
              {arrivedBusy
                ? <ActivityIndicator size="small" color="#f59e0b" />
                : <Text style={[styles.stationBtnText, { color: '#f59e0b', fontFamily: 'Inter_600SemiBold' }]}>Arrived</Text>
              }
            </Pressable>
          )}
          {/* Done button — only shown when status is arrived */}
          {station.status === 'arrived' && (
            <Pressable
              style={[styles.stationBtn, { backgroundColor: '#22c55e22', opacity: doneBusy ? 0.6 : 1 }]}
              onPress={onDone}
              disabled={doneBusy}
            >
              {doneBusy
                ? <ActivityIndicator size="small" color="#22c55e" />
                : <Text style={[styles.stationBtnText, { color: '#22c55e', fontFamily: 'Inter_700Bold' }]}>Done</Text>
              }
            </Pressable>
          )}
          {/* Completed label — both buttons disabled after done */}
          {station.status === 'completed' && (
            <View style={[styles.stationBtn, { backgroundColor: '#22c55e22' }]}>
              <Check size={14} color="#22c55e" strokeWidth={2.5} />
            </View>
          )}
        </View>
      </View>
    </GlassView>
  );
}

function StatCell({ icon, label, value, highlight, colors }: {
  icon: React.ReactNode; label: string; value: string; highlight?: boolean; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.statCell}>
      {icon}
      <Text style={[styles.statValue, { color: highlight ? colors.primary : colors.foreground, fontFamily: 'Inter_700Bold' }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{label}</Text>
    </View>
  );
}

function RouteRow({ icon, label, value, colors }: {
  icon: React.ReactNode; label: string; value: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.routeRow}>
      <View style={[styles.routeIconWrap, { backgroundColor: colors.secondary }]}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.routeLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{label}</Text>
        <Text style={[styles.routeValue, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageTitle: { fontSize: 24, marginTop: 24 },
  pageSubtitle: { fontSize: 13, marginTop: 4 },
  centeredState: { marginTop: 60, alignItems: 'center', padding: 32, gap: 10 },
  stateTitle: { fontSize: 16, textAlign: 'center' },
  stateSub: { fontSize: 13, textAlign: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, padding: 4 },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 4 },
  statDivider: { width: 1, height: 40 },
  statValue: { fontSize: 17 },
  statLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  routeIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  routeLine: { height: 1, marginLeft: 60 },
  routeLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  routeValue: { fontSize: 14, lineHeight: 20 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  detailLabel: { fontSize: 13, flex: 1 },
  detailValue: { fontSize: 13 },
  rowSep: { height: 1, marginHorizontal: 16 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  // Task 2: action buttons
  actionBar: { gap: 10, marginTop: 20 },
  rejectBtn: { flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  acceptBtnWrap: { flex: 2, borderRadius: 16, overflow: 'hidden', elevation: 6, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8 },
  fullActionBtn: { marginTop: 20, borderRadius: 16, overflow: 'hidden', elevation: 6, shadowColor: '#22c55e', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8 },
  acceptBtnGrad: { height: 52, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontSize: 15 },
  // Task 3: station
  stationCard: { padding: 14 },
  stationDot: { width: 12, height: 12, borderRadius: 6 },
  stationName: { fontSize: 14 },
  stationMeta: { fontSize: 11, marginTop: 2 },
  stationBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minWidth: 64 },
  stationBtnText: { fontSize: 12 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', padding: 24, gap: 12 },
  modalTitle: { fontSize: 18 },
  modalSub: { fontSize: 13 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontSize: 14 },
});
