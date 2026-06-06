import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowRight, Check, ChevronLeft, Clock, Map, Navigation, Phone, Users } from 'lucide-react-native';
import React, { useRef, useEffect } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapBackdrop } from '@/components/MapBackdrop';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useShuttle } from '@/lib/shuttleContext';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

export default function ShuttleTripActiveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const { activeLine, stops, currentStopIndex, passengers, nextStop } = useShuttle();
  const currentStop = stops[currentStopIndex];
  const completedCount = currentStopIndex;
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, stiffness: 300, damping: 28 }).start();
  }, [currentStopIndex]);

  const handleCompleteStop = async () => {
    if (!currentStop) return;
    cardAnim.setValue(0);
    try {
      await endpoints.shuttle.boardStop(
        currentStop.id,
        passengers.filter(p => p.checkedIn).map(p => p.id)
      );
    } catch {
      // best-effort
    }
    nextStop();
  };

  const handleFinishRoute = async () => {
    if (!activeLine) return;
    try {
      await endpoints.shuttle.complete(activeLine.id);
    } catch {
      // best-effort
    }
    router.replace('/(shuttle)');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapBackdrop />
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
            <ChevronLeft size={20} color={colors.foreground} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.routeLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{t.shuttle_service}</Text>
            <Text style={[styles.routeTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.active_shuttle}</Text>
          </View>
          <GlassView style={styles.stopBadge} borderRadius={20}>
            <Map size={14} color={colors.foreground} strokeWidth={2} />
            <Text style={[styles.stopBadgeText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {completedCount}/{stops.length}
            </Text>
          </GlassView>
        </View>

        <GlassView strong style={styles.progressCard} borderRadius={20}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.route_progress}</Text>
            <Text style={[styles.progressPct, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
              {stops.length > 0 ? Math.round((completedCount / stops.length) * 100) : 0}%
            </Text>
          </View>
          <View style={styles.stopsProgress}>
            {stops.map((stop, i) => (
              <View key={stop.id} style={styles.stopItemRow}>
                <View style={[styles.stopDot, {
                  backgroundColor: i < currentStopIndex ? colors.primary : i === currentStopIndex ? colors.accent : colors.secondary,
                  borderColor: i === currentStopIndex ? colors.accent + '33' : 'transparent',
                }]} />
                {i < stops.length - 1 && (
                  <View style={[styles.stopConnector, { backgroundColor: i < currentStopIndex ? colors.primary + '66' : colors.border }]} />
                )}
              </View>
            ))}
          </View>
          <View style={styles.progressFooter}>
            <Text style={[styles.footerText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.go}</Text>
            <Text style={[styles.footerText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {t.stops} {currentStopIndex + 1} / {stops.length}
            </Text>
          </View>
        </GlassView>

        {currentStop && (
          <Animated.View style={[{
            marginTop: 12,
            opacity: cardAnim,
            transform: [{ translateX: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [isRTL ? -30 : 30, 0] }) }],
          }]}>
            <GlassView strong style={[styles.currentStopCard, { borderColor: colors.accent + '4D' }]} borderRadius={24}>
              <View style={styles.currentLive}>
                <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.liveLabel, { color: colors.accent, fontFamily: 'Inter_700Bold' }]}>{t.current_stop}</Text>
              </View>
              <Text style={[styles.stopName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{currentStop.name}</Text>
              <Text style={[styles.stopAddress, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{currentStop.address}</Text>

              <View style={styles.stopStats}>
                <View style={styles.statItem}>
                  <Clock size={16} color={colors.mutedForeground} strokeWidth={2} />
                  <Text style={[styles.statText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>ETA {currentStop.eta}</Text>
                </View>
                <View style={styles.statItem}>
                  <Users size={16} color={colors.mutedForeground} strokeWidth={2} />
                  <Text style={[styles.statText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                    {currentStop.boarded}/{currentStop.expected} {t.checked_in}
                  </Text>
                </View>
              </View>

              <View style={styles.stopActions}>
                <Pressable style={[styles.stopActionBtn, { backgroundColor: colors.secondary }]}>
                  <Phone size={16} color={colors.foreground} strokeWidth={2} />
                  <Text style={[styles.stopActionText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.call}</Text>
                </Pressable>
                <Pressable style={[styles.stopActionBtn, { backgroundColor: colors.secondary }]}>
                  <Navigation size={16} color={colors.foreground} strokeWidth={2} />
                  <Text style={[styles.stopActionText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.navigate}</Text>
                </Pressable>
              </View>

              <Pressable onPress={() => router.push('/shuttle/boarding')} style={styles.boardingBtn}>
                <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.boardingBtnGrad}>
                  <Users size={16} color={colors.primaryForeground} strokeWidth={2} />
                  <Text style={[styles.boardingBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                    {t.boarding_title} ({currentStop.expected} {t.passengers})
                  </Text>
                </LinearGradient>
              </Pressable>
            </GlassView>
          </Animated.View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.remaining_stops}</Text>
        <View style={{ gap: 8 }}>
          {stops.slice(currentStopIndex + 1).map((stop, i) => (
            <GlassView key={stop.id} style={styles.remainingCard} borderRadius={16}>
              <View style={[styles.stopNumber, { backgroundColor: colors.secondary }]}>
                <Text style={[{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }]}>{currentStopIndex + i + 2}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.remainingName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{stop.name}</Text>
                <Text style={[styles.remainingAddress, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{stop.address}</Text>
              </View>
              <Text style={[styles.remainingEta, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{stop.eta}</Text>
            </GlassView>
          ))}
        </View>

        <View style={{ marginTop: 20 }}>
          {currentStopIndex < stops.length - 1 ? (
            <Pressable onPress={handleCompleteStop} style={styles.nextBtn}>
              <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGrad}>
                <Check size={20} color={colors.primaryForeground} strokeWidth={2} />
                <Text style={[styles.nextBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.complete_stop}</Text>
                <ArrowRight size={16} color={colors.primaryForeground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable onPress={handleFinishRoute} style={[styles.nextBtn, { backgroundColor: colors.success, elevation: 8, shadowColor: colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56 }}>
                <Check size={20} color="#fff" strokeWidth={2} />
                <Text style={[styles.nextBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{t.finish_route}</Text>
              </View>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  routeLabel: { fontSize: 12 },
  routeTitle: { fontSize: 14 },
  stopBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  stopBadgeText: { fontSize: 12 },
  progressCard: { marginTop: 16, padding: 16 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  progressLabel: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  progressPct: { fontSize: 12 },
  stopsProgress: { flexDirection: 'row', alignItems: 'center' },
  stopItemRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stopDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 4 },
  stopConnector: { flex: 1, height: 2, marginHorizontal: -2 },
  progressFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  footerText: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  currentStopCard: { padding: 20, borderWidth: 2 },
  currentLive: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
  liveLabel: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  stopName: { fontSize: 20 },
  stopAddress: { fontSize: 14, marginTop: 4 },
  stopStats: { flexDirection: 'row', gap: 24, marginTop: 16 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 14 },
  stopActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stopActionBtn: { flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  stopActionText: { fontSize: 14 },
  boardingBtn: { marginTop: 12, borderRadius: 16, overflow: 'hidden', elevation: 6, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 10 },
  boardingBtnGrad: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  boardingBtnText: { fontSize: 14 },
  sectionTitle: { fontSize: 14, marginTop: 24, marginBottom: 12 },
  remainingCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  stopNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  remainingName: { fontSize: 14 },
  remainingAddress: { fontSize: 12, marginTop: 2 },
  remainingEta: { fontSize: 12 },
  nextBtn: { borderRadius: 16, overflow: 'hidden', elevation: 8, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  nextBtnGrad: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextBtnText: { fontSize: 15 },
});
