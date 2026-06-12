import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft, Target } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

type BonusTarget = {
  id: string;
  title: string;
  description?: string;
  targetType: string;
  targetValue: number;
  bonusAmount: number;
  progress: number;
  vehicleType?: string;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
};

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export default function BonusTargetsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { data: raw, isLoading, isError, refetch } = useQuery({
    queryKey: ['bonus-targets'],
    queryFn: endpoints.bonusTargets.list,
  });

  const targets: BonusTarget[] = Array.isArray(raw)
    ? (raw as BonusTarget[])
    : ((raw as { data?: BonusTarget[]; bonusTargets?: BonusTarget[] })?.data
      ?? (raw as { bonusTargets?: BonusTarget[] })?.bonusTargets
      ?? []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, flexDirection: R, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]} hitSlop={8}>
          <ChevronLeft size={24} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.bonus_targets}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, marginBottom: 16 }}>
            Failed to load bonus targets.
          </Text>
          <Pressable onPress={() => refetch()} style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}>
            <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>Retry</Text>
          </Pressable>
        </View>
      ) : targets.length === 0 ? (
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Target size={32} color={colors.mutedForeground} strokeWidth={1.5} />
          </View>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 16, textAlign: 'center' }}>
            {t.no_bonus_targets}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {targets.map((target) => {
            const pct = target.targetValue > 0
              ? Math.min(1, target.progress / target.targetValue)
              : 0;
            const completed = target.progress >= target.targetValue;

            return (
              <GlassView key={target.id} style={styles.card} borderRadius={20}>
                <View style={[styles.cardTop, { flexDirection: R }]}>
                  <View style={[styles.targetIcon, { backgroundColor: completed ? '#0d9488' + '1A' : colors.primary + '1A' }]}>
                    <Target size={20} color={completed ? '#0d9488' : colors.primary} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]} numberOfLines={2}>
                      {target.title}
                    </Text>
                    {!!target.description && (
                      <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={2}>
                        {target.description}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: completed ? '#0d9488' + '1A' : colors.primary + '1A' }]}>
                    <Text style={[styles.statusText, { color: completed ? '#0d9488' : colors.primary, fontFamily: 'Inter_700Bold' }]}>
                      {completed ? t.bonus_completed : t.bonus_in_progress}
                    </Text>
                  </View>
                </View>

                <View style={[styles.progressSection, { marginTop: 14 }]}>
                  <View style={[styles.progressMeta, { flexDirection: R }]}>
                    <Text style={[styles.progressLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      {target.progress} / {target.targetValue}
                    </Text>
                    <Text style={[styles.progressLabel, { color: completed ? '#0d9488' : colors.primary, fontFamily: 'Inter_700Bold' }]}>
                      {Math.round(pct * 100)}%
                    </Text>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: colors.secondary, marginTop: 6 }]}>
                    {completed ? (
                      <LinearGradient
                        colors={['#0d9488', '#14b8a6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.progressFill, { width: '100%' }]}
                      />
                    ) : (
                      <View style={[styles.progressFill, {
                        width: `${Math.round(pct * 100)}%`,
                        backgroundColor: colors.primary,
                      }]} />
                    )}
                  </View>
                </View>

                <View style={[styles.cardFooter, { flexDirection: R, marginTop: 14 }]}>
                  <View style={[styles.bonusPill, { backgroundColor: '#D5B23D1A', flexDirection: R }]}>
                    <Text style={[styles.bonusLabel, { color: '#D5B23D', fontFamily: 'Inter_400Regular' }]}>{t.bonus_amount}: </Text>
                    <Text style={[styles.bonusValue, { color: '#D5B23D', fontFamily: 'Inter_700Bold' }]}>{target.bonusAmount} {t.egp}</Text>
                  </View>
                  <Text style={[styles.validUntil, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: isRTL ? 'left' as const : 'right' as const }]}>
                    {t.valid_until} {formatDate(target.endsAt)}
                  </Text>
                </View>
              </GlassView>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  card: { marginBottom: 12, padding: 16 },
  cardTop: { alignItems: 'flex-start', gap: 12 },
  targetIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15 },
  cardDesc: { fontSize: 13, marginTop: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, letterSpacing: 0.5 },
  progressSection: {},
  progressMeta: { justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' },
  progressFill: { height: 6, borderRadius: 3 },
  cardFooter: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  bonusPill: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, gap: 2 },
  bonusLabel: { fontSize: 12 },
  bonusValue: { fontSize: 13 },
  validUntil: { fontSize: 11, flex: 1 },
});
