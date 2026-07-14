import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { safeBack } from '@/lib/navUtils';
import { AlertCircle, Check, ChevronLeft, Package, Phone, Tag, Users, X } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, ImageErrorEventData, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useShuttle } from '@/lib/shuttleContext';
import { useI18n } from '@/lib/i18nContext';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { endpoints } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';

export default function ShuttleBoardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const botPad = insets.bottom;
  const { t } = useI18n();
  const { socket } = useSocket();
  const { stops, currentStopIndex, passengers, togglePassenger, nextStop, activeLine } = useShuttle();
  const currentStop = stops[currentStopIndex];
  const checkedIn = passengers.filter(p => p.checkedIn).length;
  const total = passengers.length;
  const progressAnim = useRef(new Animated.Value(checkedIn / total)).current;

  const [stationTimeoutVisible, setStationTimeoutVisible] = useState(false);
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({});
  const [isDeparting, setIsDeparting] = useState(false);

  // Task 1: per-passenger action state ('boarded' | 'absent' | null) and loading id
  const [actionState, setActionState] = useState<Record<string, 'boarded' | 'absent'>>({});
  const [loadingPassengerId, setLoadingPassengerId] = useState<string | null>(null);

  useEffect(() => {
    Animated.spring(progressAnim, { toValue: checkedIn / total, useNativeDriver: false, stiffness: 300, damping: 25 }).start();
  }, [checkedIn]);

  // Reset action state when stop changes
  useEffect(() => {
    setActionState({});
  }, [currentStopIndex]);

  useEffect(() => {
    if (!socket) return;

    const handleStationTimeout = (data: { tripId?: string; stationId?: string }) => {
      const tripId = activeLine?.tripId;
      if (!data.tripId || data.tripId === tripId) {
        setStationTimeoutVisible(true);
      }
    };

    socket.on(SOCKET_EVENTS.SHUTTLE_STATION_TIMEOUT, handleStationTimeout);
    return () => {
      socket.off(SOCKET_EVENTS.SHUTTLE_STATION_TIMEOUT, handleStationTimeout);
    };
  }, [socket, activeLine?.tripId]);

  const handleDismissTimeout = () => setStationTimeoutVisible(false);

  const handleProceedToNextStation = () => {
    setStationTimeoutVisible(false);
    nextStop();
    router.back();
  };

  // Task 1: board handler (mark as boarded)
  const handleBoard = (passengerId: string) => {
    if (actionState[passengerId] || loadingPassengerId) return;
    togglePassenger(passengerId);
    setActionState(prev => ({ ...prev, [passengerId]: 'boarded' }));
  };

  // Task 1: no-show handler with confirmation alert
  const handleNoShow = (passengerId: string) => {
    if (actionState[passengerId] || loadingPassengerId) return;
    Alert.alert(
      t.no_show_confirm_title,
      t.no_show_confirm_msg,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.no_show_btn,
          style: 'destructive',
          onPress: async () => {
            setLoadingPassengerId(passengerId);
            try {
              await endpoints.shuttle.noShowBooking(passengerId);
              setActionState(prev => ({ ...prev, [passengerId]: 'absent' }));
            } catch {
              Alert.alert(t.error, t.no_show_error);
            } finally {
              setLoadingPassengerId(null);
            }
          },
        },
      ]
    );
  };

  const handleDepart = async () => {
    if (isDeparting) return;
    const stationId = currentStop?.id;
    if (!stationId) {
      Alert.alert(t.error, t.station_action_error);
      return;
    }
    setIsDeparting(true);
    try {
      const boardedIds = passengers.filter(p => p.checkedIn).map(p => p.id);
      await Promise.allSettled(
        boardedIds.map(bookingId =>
          endpoints.shuttle.boardBooking(bookingId, { stationId })
        )
      );
      nextStop();
      router.back();
    } finally {
      setIsDeparting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: Spacing.lg, paddingHorizontal: Spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => safeBack('/shuttle/trip-active')} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
            <ChevronLeft size={20} color={colors.foreground} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.boarding_title}</Text>
            <Text style={[styles.pageSub, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{currentStop?.name}</Text>
          </View>
        </View>

        {stationTimeoutVisible && (
          <View style={[styles.timeoutBanner, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}>
            <AlertCircle size={18} color="#d97706" strokeWidth={2} />
            <Text style={[styles.timeoutText, { color: '#92400e', fontFamily: 'Inter_400Regular', flex: 1 }]}>
              {t.station_timeout_msg}
            </Text>
            <View style={styles.timeoutActions}>
              <Pressable
                onPress={handleDismissTimeout}
                style={[styles.timeoutBtn, { backgroundColor: '#fed7aa' }]}
              >
                <Text style={[styles.timeoutBtnText, { color: '#92400e', fontFamily: 'Inter_700Bold' }]}>
                  {t.later}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleProceedToNextStation}
                style={[styles.timeoutBtn, { backgroundColor: '#d97706' }]}
              >
                <Text style={[styles.timeoutBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>
                  {t.continue}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

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
          {passengers.map((p) => {
            const action = actionState[p.id];
            const isLoading = loadingPassengerId === p.id;
            const isDisabled = !!action || !!loadingPassengerId;
            const isAbsent = action === 'absent';
            const isBoarded = action === 'boarded';

            return (
              <GlassView
                key={p.id}
                style={[
                  styles.passengerCard,
                  isBoarded ? { borderColor: colors.primary + '4D', borderWidth: 1 } : {},
                  isAbsent ? { borderColor: '#ef4444' + '4D', borderWidth: 1, opacity: 0.7 } : {},
                ]}
                borderRadius={20}
              >
                <View style={styles.passengerContent}>
                  <View style={styles.avatarWrap}>
                    {p.avatar && !avatarErrors[p.id] ? (
                      <Image
                        source={{ uri: p.avatar }}
                        style={[
                          styles.avatar,
                          {
                            borderColor: isBoarded
                              ? colors.primary
                              : isAbsent
                              ? '#ef4444'
                              : colors.border,
                          },
                        ]}
                        onError={() => setAvatarErrors(prev => ({ ...prev, [p.id]: true }))}
                      />
                    ) : (
                      <View style={[
                        styles.avatar,
                        styles.avatarFallback,
                        {
                          backgroundColor: colors.secondary,
                          borderColor: isBoarded
                            ? colors.primary
                            : isAbsent
                            ? '#ef4444'
                            : colors.border,
                        },
                      ]}>
                        <Text style={[styles.avatarInitial, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                          {(p.name || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                    {isBoarded && (
                      <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                        <Check size={10} color={colors.primaryForeground} strokeWidth={3} />
                      </View>
                    )}
                    {isAbsent && (
                      <View style={[styles.checkBadge, { backgroundColor: '#ef4444' }]}>
                        <X size={10} color="#fff" strokeWidth={3} />
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
                    {isAbsent && (
                      <Text style={[styles.absentLabel, { color: '#ef4444', fontFamily: 'Inter_700Bold' }]}>
                        {t.passenger_absent}
                      </Text>
                    )}
                  </View>

                  {/* Task 1: two action buttons */}
                  <View style={styles.actionBtns}>
                    <Pressable
                      onPress={() => handleBoard(p.id)}
                      disabled={isDisabled}
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: isBoarded
                            ? colors.primary
                            : isDisabled
                            ? colors.secondary
                            : colors.primary + '22',
                          borderColor: isBoarded ? colors.primary : colors.primary + '66',
                        },
                      ]}
                    >
                      <Check size={14} color={isBoarded ? colors.primaryForeground : isDisabled ? colors.mutedForeground : colors.primary} strokeWidth={2.5} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleNoShow(p.id)}
                      disabled={isDisabled || isLoading}
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: isAbsent
                            ? '#ef4444'
                            : isDisabled
                            ? colors.secondary
                            : '#ef444422',
                          borderColor: isAbsent ? '#ef4444' : '#ef444466',
                        },
                      ]}
                    >
                      <X size={14} color={isAbsent ? '#fff' : isDisabled ? colors.mutedForeground : '#ef4444'} strokeWidth={2.5} />
                    </Pressable>
                  </View>
                </View>
              </GlassView>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.bottomAction, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: botPad + 12 }]}>
        {total > 0 && checkedIn === total ? (
          <Pressable onPress={handleDepart} disabled={isDeparting} style={[styles.departBtn, { opacity: isDeparting ? 0.7 : 1 }]}>
            <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.departBtnGrad}>
              {isDeparting
                ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                : <Check size={20} color={colors.primaryForeground} strokeWidth={2} />
              }
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
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageTitle: { fontSize: 20 },
  pageSub: { fontSize: Typography.size.xs, marginTop: 2 },
  timeoutBanner: {
    marginTop: Spacing.md, borderRadius: 14, borderWidth: 1,
    padding: 14, gap: Spacing.sm,
  },
  timeoutText: { fontSize: 13, lineHeight: 19 },
  timeoutActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  timeoutBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: Spacing.md, borderRadius: 10, alignItems: 'center' },
  timeoutBtnText: { fontSize: Typography.size.xs },
  progressCard: { marginTop: Spacing.lg, padding: Spacing.lg },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  progressTitle: { fontSize: Typography.size.sm },
  progressSub: { fontSize: Typography.size.xs, marginTop: 2 },
  progressPct: { fontSize: 24 },
  progressTrack: { height: 8, borderRadius: 4, marginTop: Spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  sectionTitle: { fontSize: Typography.size.sm, marginTop: 20, marginBottom: Spacing.md },
  passengerCard: { padding: Spacing.lg },
  passengerContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarWrap: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: Radius.xl, borderWidth: 2 },
  checkBadge: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  passengerName: { fontSize: Typography.size.sm },
  passengerMeta: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  metaText: { fontSize: 11 },
  absentLabel: { fontSize: 11, marginTop: Spacing.xs },
  actionBtns: { flexDirection: 'column', gap: 6 },
  actionBtn: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: Typography.size.lg },
  bottomAction: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  departBtn: { borderRadius: Radius.lg, overflow: 'hidden', elevation: Shadows.large.elevation, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  departBtnGrad: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  departBtnText: { fontSize: 15 },
  waitingCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  waitingText: { fontSize: 13, flex: 1, lineHeight: 20 },
});
