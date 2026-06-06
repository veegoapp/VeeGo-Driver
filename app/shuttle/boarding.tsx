import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AlertCircle, Check, ChevronLeft, Package, Phone, Tag, Users } from 'lucide-react-native';
import React, { useRef, useEffect } from 'react';
import { Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useShuttle } from '@/lib/shuttleContext';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

export default function ShuttleBoardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useI18n();
  const { stops, currentStopIndex, passengers, togglePassenger, nextStop } = useShuttle();
  const currentStop = stops[currentStopIndex];
  const checkedIn = passengers.filter(p => p.checkedIn).length;
  const total = passengers.length;
  const progressAnim = useRef(new Animated.Value(checkedIn / total)).current;

  useEffect(() => {
    Animated.spring(progressAnim, { toValue: checkedIn / total, useNativeDriver: false, stiffness: 300, damping: 25 }).start();
  }, [checkedIn]);

  const handleDepart = async () => {
    try {
      await endpoints.shuttle.boardStop(
        currentStop.id,
        passengers.filter(p => p.checkedIn).map(p => p.id)
      );
    } catch {
      // best-effort
    }
    nextStop();
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: botPad + 100, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
            <ChevronLeft size={20} color={colors.foreground} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.boarding_title}</Text>
            <Text style={[styles.pageSub, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{currentStop?.name}</Text>
          </View>
        </View>

        <GlassView strong style={styles.progressCard} borderRadius={20}>
          <View style={styles.progressHeader}>
            <View style={styles.progressLeft}>
              <Users size={20} color={colors.primary} strokeWidth={2} />
              <View>
                <Text style={[styles.progressTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                  {checkedIn} / {total} {t.checked_in}
                </Text>
                <Text style={[styles.progressSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.tap_to_mark}</Text>
              </View>
            </View>
            <Text style={[styles.progressPct, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
              {Math.round((checkedIn / total) * 100)}%
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
            <Animated.View style={[styles.progressFill, {
              backgroundColor: colors.primary,
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]} />
          </View>
        </GlassView>

        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.passengers}</Text>
        <View style={{ gap: 10 }}>
          {passengers.map((p) => (
            <Pressable key={p.id} onPress={() => togglePassenger(p.id)} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
              <GlassView style={[styles.passengerCard, p.checkedIn ? { borderColor: colors.primary + '4D', borderWidth: 1 } : {}]} borderRadius={20}>
                <View style={styles.passengerContent}>
                  <View style={styles.avatarWrap}>
                    <Image source={{ uri: p.avatar }} style={[styles.avatar, { borderColor: p.checkedIn ? colors.primary : colors.border }]} />
                    {p.checkedIn && (
                      <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                        <Check size={10} color={colors.primaryForeground} strokeWidth={3} />
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.passengerName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{p.name}</Text>
                      {p.luggage && <Package size={14} color={colors.mutedForeground} strokeWidth={2} />}
                    </View>
                    <View style={styles.passengerMeta}>
                      <View style={styles.metaItem}>
                        <Tag size={12} color={colors.mutedForeground} strokeWidth={2} />
                        <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{p.ticket}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Phone size={12} color={colors.mutedForeground} strokeWidth={2} />
                        <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{p.phone}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={[styles.checkCircle, {
                    backgroundColor: p.checkedIn ? colors.primary : colors.secondary,
                    borderColor: p.checkedIn ? 'transparent' : colors.border,
                  }]}>
                    {p.checkedIn ? (
                      <Check size={16} color={colors.primaryForeground} strokeWidth={2} />
                    ) : (
                      <View style={[styles.emptyDot, { borderColor: colors.mutedForeground }]} />
                    )}
                  </View>
                </View>
              </GlassView>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.bottomAction, { paddingBottom: botPad + 12 }]}>
        {checkedIn === total ? (
          <Pressable onPress={handleDepart} style={styles.departBtn}>
            <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.departBtnGrad}>
              <Check size={20} color={colors.primaryForeground} strokeWidth={2} />
              <Text style={[styles.departBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.all_aboard}</Text>
            </LinearGradient>
          </Pressable>
        ) : (
          <GlassView strong style={styles.waitingCard} borderRadius={16}>
            <AlertCircle size={20} color={colors.accent} strokeWidth={2} />
            <Text style={[styles.waitingText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              <Text style={[{ color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{total - checkedIn}</Text>
              {' '}{t.still_waiting}
            </Text>
          </GlassView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageTitle: { fontSize: 20 },
  pageSub: { fontSize: 12, marginTop: 2 },
  progressCard: { marginTop: 16, padding: 16 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressTitle: { fontSize: 14 },
  progressSub: { fontSize: 12, marginTop: 2 },
  progressPct: { fontSize: 24 },
  progressTrack: { height: 8, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  sectionTitle: { fontSize: 14, marginTop: 20, marginBottom: 12 },
  passengerCard: { padding: 16 },
  passengerContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2 },
  checkBadge: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  passengerName: { fontSize: 14 },
  passengerMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11 },
  checkCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  emptyDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  bottomAction: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 8, backgroundColor: 'transparent' },
  departBtn: { borderRadius: 16, overflow: 'hidden', elevation: 8, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  departBtnGrad: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  departBtnText: { fontSize: 15 },
  waitingCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  waitingText: { fontSize: 13, flex: 1, lineHeight: 20 },
});
