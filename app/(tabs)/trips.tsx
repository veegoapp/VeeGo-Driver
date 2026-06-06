import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Check, ChevronRight, Sliders, Star, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

// Task 2: status field added — drives which action buttons are shown
type Trip = {
  id: string;
  date: string;
  from: string;
  to: string;
  fare: string | number;
  rating: string | number;
  distance: string;
  status: 'waiting_driver' | 'driver_assigned' | 'active' | 'completed' | 'cancelled';
};

type FilterKey = 'all' | 'scheduled' | 'active' | 'completed';
const FILTER_KEYS: FilterKey[] = ['all', 'scheduled', 'active', 'completed'];
const TAB_BAR_HEIGHT = 96;
const MAX_ANIM = 50;

export default function TripsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const PAGE_LIMIT = 20;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const queryClient = useQueryClient();

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const filterLabels: Record<FilterKey, string> = {
    all: t.all,
    scheduled: 'Scheduled',
    active: 'Active',
    completed: 'Completed',
  };

  const { data: rawData, isLoading, isError } = useQuery({
    queryKey: ['trips', filter, page],
    queryFn: () => endpoints.trips.list(filter === 'all' ? undefined : filter, page, PAGE_LIMIT),
  });

  const _raw = rawData as Trip[] | { trips?: Trip[]; data?: Trip[] } | undefined;
  const newTrips: Trip[] = Array.isArray(_raw) ? _raw : ((_raw as { trips?: Trip[] })?.trips ?? ((_raw as { data?: Trip[] })?.data ?? []));
  const hasMore = newTrips.length === PAGE_LIMIT;

  useEffect(() => {
    setPage(1);
    setAllTrips([]);
  }, [filter]);

  useEffect(() => {
    if (!rawData) return;
    if (page === 1) {
      setAllTrips(newTrips);
    } else {
      setAllTrips(prev => [...prev, ...newTrips]);
    }
  }, [rawData, page]);

  const tripsData = allTrips;
  const cardAnims = useRef(Array.from({ length: MAX_ANIM }, () => new Animated.Value(0))).current;

  useEffect(() => {
    cardAnims.forEach(a => a.setValue(0));
    Animated.stagger(40, tripsData.map((_, i) =>
      Animated.timing(cardAnims[i], { toValue: 1, duration: 350, useNativeDriver: true })
    )).start();
  }, [tripsData.length, filter]);

  // Task 2: trip lifecycle action handlers
  const handleAccept = async (tripId: string) => {
    try {
      await endpoints.trips.accept(tripId);
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    } catch {
      Alert.alert('Error', 'Could not accept trip. Please try again.');
    }
  };

  const handleReject = async (tripId: string) => {
    try {
      await endpoints.trips.reject(tripId);
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    } catch {
      Alert.alert('Error', 'Could not reject trip. Please try again.');
    }
  };

  const handleStart = async (tripId: string) => {
    try {
      await endpoints.trips.start(tripId);
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    } catch {
      Alert.alert('Error', 'Could not start trip. Please try again.');
    }
  };

  const handleComplete = async (tripId: string) => {
    try {
      await endpoints.trips.complete(tripId);
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    } catch {
      Alert.alert('Error', 'Could not complete trip. Please try again.');
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    setCancelBusy(true);
    try {
      await endpoints.trips.cancel(cancelTarget, cancelReason.trim());
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setCancelTarget(null);
      setCancelReason('');
    } catch {
      Alert.alert('Error', 'Could not cancel trip. Please try again.');
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Cancel reason modal */}
      <Modal
        visible={cancelTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelTarget(null)}
      >
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
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.secondary }]}
                onPress={() => { setCancelTarget(null); setCancelReason(''); }}
              >
                <Text style={[styles.modalBtnText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.destructive, opacity: (!cancelReason.trim() || cancelBusy) ? 0.6 : 1 }]}
                onPress={handleCancelConfirm}
                disabled={!cancelReason.trim() || cancelBusy}
              >
                {cancelBusy
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[styles.modalBtnText, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>Cancel trip</Text>
                }
              </Pressable>
            </View>
          </GlassView>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: TAB_BAR_HEIGHT + 24, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { flexDirection: R }]}>
          <View>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.history}</Text>
            <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.your_trips}</Text>
          </View>
          <GlassView style={styles.filterBtn} borderRadius={20}>
            <Sliders size={16} color={colors.foreground} strokeWidth={2} />
          </GlassView>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
          {FILTER_KEYS.map(key => (
            <Pressable key={key} onPress={() => setFilter(key)}>
              {key === filter ? (
                <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.chip, { elevation: 6, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 8 }]}>
                  <Text style={[styles.chipText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{filterLabels[key]}</Text>
                </LinearGradient>
              ) : (
                <GlassView style={styles.chip} borderRadius={20}>
                  <Text style={[styles.chipText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{filterLabels[key]}</Text>
                </GlassView>
              )}
            </Pressable>
          ))}
        </ScrollView>

        {isLoading ? (
          <View style={{ marginTop: 60, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={{ marginTop: 60, alignItems: 'center' }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>Failed to load trips. Please try again.</Text>
          </View>
        ) : tripsData.length === 0 ? (
          <View style={{ marginTop: 60, alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 32 }}>🚗</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>No trips yet</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
              {filter === 'all' ? 'Your completed trips will appear here.' : `No ${filter} trips found.`}
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 20, gap: 10 }}>
            {tripsData.map((trip, i) => (
              <Animated.View key={trip.id} style={{ opacity: cardAnims[i], transform: [{ translateY: cardAnims[i].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
                <Pressable onPress={() => router.push(`/trips/${trip.id}`)}>
                  <GlassView style={styles.tripCard} borderRadius={20}>
                    {/* Trip route info */}
                    <View style={[styles.tripRow, { flexDirection: R }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.tripMeta, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>{trip.date} · {trip.distance}</Text>
                        <View style={[styles.tripRoute, { flexDirection: R }]}>
                          <View style={styles.routeDots}>
                            <View style={[styles.dotTop, { backgroundColor: colors.primary }]} />
                            <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
                            <View style={[styles.dotBottom, { backgroundColor: colors.accent }]} />
                          </View>
                          <View style={{ flex: 1, gap: 6 }}>
                            <Text style={[styles.routeText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]} numberOfLines={1}>{trip.from}</Text>
                            <Text style={[styles.routeText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]} numberOfLines={1}>{trip.to}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end', marginLeft: isRTL ? 0 : 12, marginRight: isRTL ? 12 : 0 }}>
                        {/* parseFloat: backend returns fare as string */}
                        <Text style={[styles.fareText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{parseFloat(String(trip.fare ?? 0)).toFixed(2)} DT</Text>
                        <View style={[styles.starsRow, { flexDirection: R }]}>
                          {Array.from({ length: 5 }).map((_, idx) => (
                            <Star key={idx} size={12} color={idx < parseFloat(String(trip.rating ?? 0)) ? colors.accent : colors.mutedForeground + '4D'} fill={idx < parseFloat(String(trip.rating ?? 0)) ? colors.accent : 'transparent'} strokeWidth={2} />
                          ))}
                        </View>
                        <StatusBadge status={trip.status} colors={colors} />
                        <ChevronRight size={14} color={colors.mutedForeground} style={{ marginTop: 4, transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
                      </View>
                    </View>

                    {/* Task 2: lifecycle action buttons based on status */}
                    <TripActionBar
                      trip={trip}
                      colors={colors}
                      isRTL={isRTL}
                      onAccept={() => handleAccept(trip.id)}
                      onReject={() => handleReject(trip.id)}
                      onStart={() => handleStart(trip.id)}
                      onComplete={() => handleComplete(trip.id)}
                      onCancel={() => setCancelTarget(trip.id)}
                    />
                  </GlassView>
                </Pressable>
              </Animated.View>
            ))}
            {hasMore && !isLoading && (
              <Pressable
                onPress={() => setPage(p => p + 1)}
                style={{ marginTop: 8, marginBottom: 16, alignItems: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: 'rgba(61,82,213,0.08)' }}
              >
                <Text style={{ color: '#3D52D5', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Load more</Text>
              </Pressable>
            )}
            {isLoading && page > 1 && (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <ActivityIndicator color="#3D52D5" />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatusBadge({ status, colors }: { status: Trip['status']; colors: ReturnType<typeof useColors> }) {
  const map: Record<Trip['status'], { label: string; bg: string; fg: string }> = {
    waiting_driver: { label: 'Pending', bg: '#f59e0b22', fg: '#f59e0b' },
    driver_assigned: { label: 'Assigned', bg: '#3D52D522', fg: '#3D52D5' },
    active: { label: 'Active', bg: '#22c55e22', fg: '#22c55e' },
    completed: { label: 'Done', bg: colors.secondary, fg: colors.mutedForeground },
    cancelled: { label: 'Cancelled', bg: '#ef444422', fg: '#ef4444' },
  };
  const s = map[status] ?? map.completed;
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.bg, marginTop: 4 }]}>
      <Text style={[styles.statusText, { color: s.fg, fontFamily: 'Inter_700Bold' }]}>{s.label}</Text>
    </View>
  );
}

// Task 2: renders the correct action bar for each trip status
function TripActionBar({ trip, colors, isRTL, onAccept, onReject, onStart, onComplete, onCancel }: {
  trip: Trip;
  colors: ReturnType<typeof useColors>;
  isRTL: boolean;
  onAccept: () => void;
  onReject: () => void;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const [busy, setBusy] = useState(false);

  const wrap = (fn: () => void | Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  if (trip.status === 'waiting_driver') {
    return (
      <View style={[styles.actionBar, { flexDirection: R }]}>
        <Pressable style={[styles.actionBtnSecondary, { backgroundColor: colors.secondary, flex: 1, opacity: busy ? 0.6 : 1 }]} onPress={wrap(onReject)} disabled={busy}>
          <X size={14} color={colors.foreground} strokeWidth={2} />
          <Text style={[styles.actionBtnText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Reject</Text>
        </Pressable>
        <Pressable style={[styles.actionBtnPrimary, { flex: 2, opacity: busy ? 0.6 : 1 }]} onPress={wrap(onAccept)} disabled={busy}>
          <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Check size={14} color="#fff" strokeWidth={2} />
                <Text style={[styles.actionBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>Accept</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  if (trip.status === 'driver_assigned') {
    return (
      <View style={styles.actionBar}>
        <Pressable style={[styles.actionBtnPrimary, { opacity: busy ? 0.6 : 1 }]} onPress={wrap(onStart)} disabled={busy}>
          <LinearGradient colors={['#22c55e', '#16a34a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : (
              <Text style={[styles.actionBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>Start Trip</Text>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  if (trip.status === 'active') {
    return (
      <View style={[styles.actionBar, { flexDirection: R }]}>
        <Pressable style={[styles.actionBtnSecondary, { backgroundColor: '#ef444415', flex: 1, opacity: busy ? 0.6 : 1 }]} onPress={onCancel} disabled={busy}>
          <Text style={[styles.actionBtnText, { color: '#ef4444', fontFamily: 'Inter_600SemiBold' }]}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.actionBtnPrimary, { flex: 2, opacity: busy ? 0.6 : 1 }]} onPress={wrap(onComplete)} disabled={busy}>
          <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Check size={14} color="#fff" strokeWidth={2} />
                <Text style={[styles.actionBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>Complete</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  pageTitle: { fontSize: 24, marginTop: 2 },
  filterBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  chipText: { fontSize: 12 },
  tripCard: { padding: 16 },
  tripRow: { alignItems: 'flex-start' },
  tripMeta: { fontSize: 11, marginBottom: 8 },
  tripRoute: { gap: 8 },
  routeDots: { alignItems: 'center', paddingTop: 4 },
  dotTop: { width: 8, height: 8, borderRadius: 4 },
  routeLine: { width: 1, flex: 1, marginVertical: 3 },
  dotBottom: { width: 8, height: 8, borderRadius: 2 },
  routeText: { fontSize: 14 },
  fareText: { fontSize: 16 },
  starsRow: { gap: 2, marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  statusText: { fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  // Task 2: action bar styles
  actionBar: { flexDirection: 'row', gap: 8, marginTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', paddingTop: 14 },
  actionBtnPrimary: { borderRadius: 14, overflow: 'hidden', elevation: 4, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6 },
  actionBtnSecondary: { height: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionBtnGrad: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionBtnText: { fontSize: 13 },
  // Cancel modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', padding: 24, gap: 12 },
  modalTitle: { fontSize: 18 },
  modalSub: { fontSize: 13 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontSize: 14 },
});
