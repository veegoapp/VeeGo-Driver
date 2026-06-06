import { LinearGradient } from 'expo-linear-gradient';
import { Calendar, CheckCircle, Clock, GitBranch, MapPin, Search, Users, X } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapBackdrop } from '@/components/MapBackdrop';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { type ShuttleLine, useShuttle } from '@/lib/shuttleContext';
import { useI18n } from '@/lib/i18nContext';
import { endpoints, ApiError } from '@/lib/api';

const TAB_BAR_HEIGHT = 96;
const SCREEN_H = Dimensions.get('window').height;

type WorkWeek = {
  start: string;    // YYYY-MM-DD (Sunday)
  end: string;      // YYYY-MM-DD (Thursday)
  label: string;    // e.g. "Jun 1–5" or "May 31 – Jun 4"
  subLabel: string; // e.g. "This Week" | "Next Week" | "Sun – Thu"
};

type BackendStation = {
  id: number;
  name: string;
  order: number;
  latitude?: number;
  longitude?: number;
};

const DEPARTURE_TIMES = ['07:00', '08:00', '09:00', '10:00', '13:00', '14:00', '15:00', '16:00'];

function parseStations(raw: unknown): BackendStation[] {
  if (!raw) return [];
  const r = raw as { data?: { stations?: BackendStation[] }; stations?: BackendStation[] };
  return r.data?.stations ?? r.stations ?? [];
}

function generateWorkWeeks(count = 8): WorkWeek[] {
  const weeks: WorkWeek[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dow = now.getDay(); // 0=Sun … 6=Sat

  // Rewind to this week's Sunday
  const thisSunday = new Date(now);
  thisSunday.setDate(now.getDate() - dow);

  // If Wed(3), Thu(4), Fri(5), Sat(6): skip current week — too late to plan
  const startW = dow >= 3 ? 1 : 0;

  for (let w = startW; w < count + startW; w++) {
    const sun = new Date(thisSunday);
    sun.setDate(thisSunday.getDate() + w * 7);
    const thu = new Date(sun);
    thu.setDate(sun.getDate() + 4);

    const start = sun.toISOString().split('T')[0];
    const end   = thu.toISOString().split('T')[0];

    const fmtMon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
    const label  = thu.getMonth() === sun.getMonth()
      ? `${fmtMon(sun)} ${sun.getDate()}–${thu.getDate()}`
      : `${fmtMon(sun)} ${sun.getDate()} – ${fmtMon(thu)} ${thu.getDate()}`;

    const idx = w - startW; // 0-based position in the shown list
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
  const [bookingLine, setBookingLine] = useState<ShuttleLine | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<WorkWeek | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const weeks = generateWorkWeeks();

  const { allLines, loading: isLoading, error } = useShuttle();

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const filteredLines = search.trim()
    ? allLines.filter(l =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.lineNumber.toLowerCase().includes(search.toLowerCase()) ||
        (l.from ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (l.to ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : allLines;

  const { data: lineDetailRaw, isLoading: stationsLoading } = useQuery({
    queryKey: ['shuttle-line-detail', bookingLine?.id],
    queryFn: () => endpoints.shuttle.line(bookingLine!.id),
    enabled: !!bookingLine,
    staleTime: 5 * 60 * 1000,
  });

  const stations = parseStations(lineDetailRaw);

  const bookMutation = useMutation({
    mutationFn: ({
      lineId, weekStart, weekEnd, departureTime,
    }: { lineId: string; weekStart: string; weekEnd: string; departureTime: string }) =>
      endpoints.shuttle.book(lineId, { weekStart, weekEnd, departureTime }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setBookingLine(null);
      setSelectedWeek(null);
      setSelectedTime(null);
      Alert.alert(
        '✅ Booked!',
        'Your weekly slot is confirmed. This trip will now appear in your upcoming schedule and other drivers will see it as reserved.',
        [{ text: 'OK' }]
      );
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.status === 404) {
        Alert.alert(
          'Not Available Yet',
          'The weekly booking feature is not yet active on the server. Contact your administrator to enable it.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Booking Failed', 'Could not complete the booking. Please try again.', [{ text: 'OK' }]);
      }
    },
  });

  const handleBook = () => {
    if (!bookingLine || !selectedWeek || !selectedTime) return;
    const lines = [
      `Line ${bookingLine.lineNumber}: ${bookingLine.name}`,
      `Route: ${bookingLine.from} → ${bookingLine.to}`,
      `Week: ${selectedWeek.label}  (Sun – Thu)`,
      `Departure: ${selectedTime}`,
      bookingLine.stationCount ? `Stations: ${bookingLine.stationCount} stops` : '',
    ].filter(Boolean);
    Alert.alert(
      'Confirm Booking',
      lines.join('\n') + '\n\nOther drivers will see this week and time as reserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: () =>
            bookMutation.mutate({
              lineId: bookingLine.id,
              weekStart: selectedWeek.start,
              weekEnd: selectedWeek.end,
              departureTime: selectedTime,
            }),
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapBackdrop />

      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 8,
          paddingBottom: TAB_BAR_HEIGHT + 24,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <Animated.View style={{
          opacity: headerAnim,
          transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
        }}>
          <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
            {t.shuttle_routes}
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
            Choose a line and pick your schedule
          </Text>
        </Animated.View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
            placeholder="Search by name, number, or route…"
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
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: '#1e1e2820', borderColor: '#1e1e2833' }]}>
            <GitBranch size={12} color="#2d2d42" strokeWidth={2} />
            <Text style={[styles.chipText, { color: '#2d2d42', fontFamily: 'Inter_700Bold' }]}>
              {allLines.length} lines
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Users size={12} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.chipText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {allLines.filter(l => l.assigned).length} booked
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <CheckCircle size={12} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.chipText, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
              {allLines.filter(l => l.status === 'completed').length} done
            </Text>
          </View>
        </View>

        {isLoading && (
          <View style={{ alignItems: 'center', marginTop: 48 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {!!error && !isLoading && (
          <View style={{ alignItems: 'center', marginTop: 48 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>
              Failed to load lines. Pull down to retry.
            </Text>
          </View>
        )}

        {!isLoading && !error && filteredLines.length === 0 && (
          <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
            <Text style={{ fontSize: 32 }}>🔍</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
              No lines found
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
              Try a different search term
            </Text>
          </View>
        )}

        {!isLoading && !error && filteredLines.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              Available Lines
            </Text>
            <View style={{ gap: 10 }}>
              {filteredLines.map((line, idx) => (
                <LineCard
                  key={line.id}
                  line={line}
                  index={idx}
                  onBook={() => {
                    setSelectedWeek(null);
                    setSelectedTime(null);
                    setBookingLine(line);
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
        visible={!!bookingLine}
        transparent
        animationType="slide"
        onRequestClose={() => setBookingLine(null)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setBookingLine(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 20 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                  {bookingLine?.name}
                </Text>
                <Text style={[styles.sheetSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {bookingLine?.from} → {bookingLine?.to}
                </Text>
              </View>
              <Pressable
                onPress={() => setBookingLine(null)}
                style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
                hitSlop={8}
              >
                <X size={16} color={colors.foreground} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
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
                      onPress={() => { setSelectedWeek(week); setSelectedTime(null); }}
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

              {/* Departure time */}
              {selectedWeek && (
                <>
                  <Text style={[styles.sheetSection, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    Departure Time
                  </Text>
                  <View style={styles.timesGrid}>
                    {DEPARTURE_TIMES.map(time => {
                      const picked = selectedTime === time;
                      return (
                        <Pressable
                          key={time}
                          onPress={() => setSelectedTime(time)}
                          style={[styles.timeChip, {
                            backgroundColor: picked ? '#1e1e28' : 'transparent',
                            borderColor: picked ? '#1e1e28' : '#1e1e2833',
                          }]}
                        >
                          <Clock size={13} color={picked ? '#fff' : colors.foreground} strokeWidth={2} />
                          <Text style={[styles.timeChipText, {
                            color: picked ? '#fff' : colors.foreground,
                            fontFamily: 'Inter_600SemiBold',
                          }]}>
                            {time}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              <View style={{ height: 16 }} />
            </ScrollView>

            {/* Book button */}
            <Pressable
              onPress={handleBook}
              disabled={!selectedWeek || !selectedTime || bookMutation.isPending}
              style={[styles.bookBtn, { opacity: !selectedWeek || !selectedTime || bookMutation.isPending ? 0.45 : 1 }]}
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
                    {selectedWeek && selectedTime
                      ? `Confirm — ${selectedWeek.label}  ·  ${selectedTime}`
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

function LineCard({
  line,
  index,
  onBook,
  colors,
}: {
  line: ShuttleLine;
  index: number;
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

  const isActive = line.status === 'in-progress';
  const isCompleted = line.status === 'completed';
  const isYours = line.assigned;

  const statusConfig = isActive
    ? { text: 'Active', bg: '#1e1e2820', color: '#2d2d42' }
    : isCompleted
    ? { text: 'Done', bg: '#f4f4fb', color: '#9e9ea8' }
    : isYours
    ? { text: 'Yours', bg: '#22c55e20', color: '#16a34a' }
    : { text: 'Available', bg: '#3D52D520', color: '#3D52D5' };

  const canBook = !isCompleted && !isActive;

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
            <View style={[styles.lineNumberBadge, {
              backgroundColor: isActive ? '#1e1e2820' : colors.secondary,
            }]}>
              <Text style={[styles.lineNumberText, {
                color: isActive ? '#2d2d42' : colors.mutedForeground,
                fontFamily: 'Inter_700Bold',
              }]}>
                {line.lineNumber}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.lineName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}
                numberOfLines={1}
              >
                {line.name}
              </Text>
              <Text style={[styles.lineRoute, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {line.from} → {line.to}
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
                {line.stationCount} stops
              </Text>
            </View>
            <View style={styles.lineStat}>
              <Clock size={12} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[styles.lineStatText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {line.departure} — {line.arrival}
              </Text>
            </View>
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
  chips: { flexDirection: 'row', gap: 8, marginTop: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 11 },
  sectionTitle: { fontSize: 13, letterSpacing: 0.5, marginBottom: 10, marginTop: 20 },
  lineCard: { padding: 16 },
  lineCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineNumberBadge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lineNumberText: { fontSize: 12, letterSpacing: 1 },
  lineName: { fontSize: 14 },
  lineRoute: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 10, letterSpacing: 0.8 },
  lineStats: { flexDirection: 'row', gap: 16, marginTop: 12, alignItems: 'center' },
  lineStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lineStatText: { fontSize: 11 },
  // Bottom sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    height: SCREEN_H * 0.84,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  sheetTitle: { fontSize: 18 },
  sheetSub: { fontSize: 13, marginTop: 3 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetSection: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 12,
  },
  stationRow: { flexDirection: 'row', gap: 12 },
  stationDotCol: { alignItems: 'center', width: 16 },
  stationDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  stationConnector: { width: 1, flex: 1, marginVertical: 2, minHeight: 20 },
  stationInfo: { flex: 1, paddingBottom: 16 },
  stationName: { fontSize: 13 },
  stationTime: { fontSize: 11, marginTop: 2 },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  dateChipText: { fontSize: 13 },
  weekChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 11,
    minWidth: 120,
  },
  weekChipLabel: { fontSize: 14 },
  weekChipSub: { fontSize: 11, marginTop: 1 },
  timesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  timeChipText: { fontSize: 14 },
  timeChipBooked: { fontSize: 9, marginLeft: 2 },
  bookBtn: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#1e1e28',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  bookBtnGrad: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bookBtnText: { fontSize: 16, color: '#fff' },
});
