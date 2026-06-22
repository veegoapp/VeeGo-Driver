import { router } from 'expo-router';
import {
  CheckCircle,
  ChevronLeft,
  Clock,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import type { BonusTarget } from '@/lib/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const CARD_RADIUS = 16;
const BORDER_COLOR = 'rgba(0,0,0,0.08)';

// Teal for completed milestones
const COLOR_COMPLETED = '#0d9488';
const COLOR_COMPLETED_BG = 'rgba(13,148,136,0.10)';

// Amber for in-progress milestones
const COLOR_PROGRESS = '#D5B23D';
const COLOR_PROGRESS_BG = 'rgba(213,178,61,0.10)';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-US');
}

/** Normalise the server response — accepts root array, { data: [] }, or { bonusTargets: [] } */
function extractTargets(raw: unknown): BonusTarget[] {
  if (Array.isArray(raw)) return raw as BonusTarget[];
  const obj = raw as Record<string, unknown> | null;
  if (!obj) return [];
  if (Array.isArray(obj.data)) return obj.data as BonusTarget[];
  if (Array.isArray(obj.bonusTargets)) return obj.bonusTargets as BonusTarget[];
  return [];
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function BonusTargetsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();

  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  const [refreshing, setRefreshing] = useState(false);

  const {
    data: raw,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['bonus-targets'],
    queryFn: endpoints.bonusTargets.list,
    retry: 1,
  });

  const targets = extractTargets(raw);

  // ── Summary derivation (no extra endpoint needed) ─────────────────────
  const earnedTotal = targets
    .filter((b) => b.completed && (b.paidOut !== false))
    .reduce((sum, b) => sum + b.bonusAmount, 0);

  const pendingTotal = targets
    .filter((b) => !b.completed && b.isActive)
    .reduce((sum, b) => sum + b.bonusAmount, 0);

  // ── Pull-to-refresh ───────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  // ── Status helpers ────────────────────────────────────────────────────
  const getStatusConfig = (target: BonusTarget) => {
    if (!target.isActive && !target.completed) {
      return { label: t.bonus_expired, color: colors.mutedForeground, bg: colors.secondary };
    }
    if (target.completed) {
      return { label: t.bonus_completed, color: COLOR_COMPLETED, bg: COLOR_COMPLETED_BG };
    }
    return { label: t.bonus_in_progress, color: COLOR_PROGRESS, bg: COLOR_PROGRESS_BG };
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header bar ────────────────────────────────────────────── */}
      <View style={[
        styles.header,
        {
          paddingTop: topPad + 8,
          flexDirection: R,
          backgroundColor: colors.background,
          borderBottomColor: BORDER_COLOR,
        },
      ]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <ChevronLeft
            size={24}
            color={colors.foreground}
            strokeWidth={2}
            style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground, textAlign: TA }]}>
            {t.bonus_targets}
          </Text>
        </View>
      </View>

      {/* ── Loading state ─────────────────────────────────────────── */}
      {isLoading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>

      /* ── Error state ──────────────────────────────────────────── */
      ) : isError ? (
        <View style={styles.center}>
          <View style={[styles.stateIconWrap, { backgroundColor: 'rgba(232,84,84,0.08)' }]}>
            <XCircle size={34} color={colors.destructive} strokeWidth={1.5} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.foreground, textAlign: 'center' }]}>
            {t.bonus_failed_load}
          </Text>
          <Text style={[styles.stateSub, { color: colors.mutedForeground, textAlign: 'center' }]}>
            {t.bonus_targets_empty_sub}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: '#fff' }]}>
              {t.bonus_retry}
            </Text>
          </Pressable>
        </View>

      /* ── Content ──────────────────────────────────────────────── */
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 40,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {/* ── Summary Card (Earned / Pending) ───────────────────── */}
          <View style={[styles.summaryCard, { flexDirection: R }]}>
            {/* Earned */}
            <View style={[styles.summarySegment, { borderRightWidth: isRTL ? 0 : 1, borderLeftWidth: isRTL ? 1 : 0, borderColor: BORDER_COLOR }]}>
              <View style={[styles.summaryIconWrap, { backgroundColor: COLOR_COMPLETED_BG }]}>
                <CheckCircle size={18} color={COLOR_COMPLETED} strokeWidth={2} />
              </View>
              <Text style={[styles.summaryAmount, { color: colors.foreground, textAlign: 'center' }]}>
                {formatAmount(earnedTotal)}
                <Text style={[styles.summaryAmountUnit, { color: colors.mutedForeground }]}> {t.egp}</Text>
              </Text>
              <Text style={[styles.summaryLabel, { color: COLOR_COMPLETED, textAlign: 'center' }]}>
                {t.earned_bonuses}
              </Text>
            </View>

            {/* Pending */}
            <View style={styles.summarySegment}>
              <View style={[styles.summaryIconWrap, { backgroundColor: COLOR_PROGRESS_BG }]}>
                <Clock size={18} color={COLOR_PROGRESS} strokeWidth={2} />
              </View>
              <Text style={[styles.summaryAmount, { color: colors.foreground, textAlign: 'center' }]}>
                {formatAmount(pendingTotal)}
                <Text style={[styles.summaryAmountUnit, { color: colors.mutedForeground }]}> {t.egp}</Text>
              </Text>
              <Text style={[styles.summaryLabel, { color: COLOR_PROGRESS, textAlign: 'center' }]}>
                {t.pending_bonuses}
              </Text>
            </View>
          </View>

          {/* ── Empty state (no targets) ───────────────────────────── */}
          {targets.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.stateIconWrap, { backgroundColor: colors.secondary }]}>
                <Target size={34} color={colors.mutedForeground} strokeWidth={1.5} />
              </View>
              <Text style={[styles.stateTitle, { color: colors.foreground, textAlign: 'center' }]}>
                {t.no_bonus_targets}
              </Text>
              <Text style={[styles.stateSub, { color: colors.mutedForeground, textAlign: 'center' }]}>
                {t.bonus_targets_empty_sub}
              </Text>
            </View>
          ) : (
            <>
              {/* ── Section label ─────────────────────────────────── */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                {t.bonus_summary_label}
              </Text>

              {/* ── Milestone timeline list ────────────────────────── */}
              {targets.map((target, idx) => {
                const pct = target.targetValue > 0
                  ? Math.min(1, target.progress / target.targetValue)
                  : 0;
                const status = getStatusConfig(target);
                const isLast = idx === targets.length - 1;

                return (
                  <View key={target.id} style={styles.timelineRow}>
                    {/* Timeline spine */}
                    <View style={styles.spineCol}>
                      <View style={[
                        styles.spineDot,
                        {
                          backgroundColor: target.completed
                            ? COLOR_COMPLETED
                            : target.isActive
                              ? COLOR_PROGRESS
                              : colors.border,
                          borderColor: target.completed
                            ? COLOR_COMPLETED_BG
                            : target.isActive
                              ? COLOR_PROGRESS_BG
                              : 'transparent',
                        },
                      ]}>
                        {target.completed
                          ? <CheckCircle size={10} color="#fff" strokeWidth={2.5} />
                          : <TrendingUp size={10} color="#fff" strokeWidth={2.5} />
                        }
                      </View>
                      {!isLast && (
                        <View style={[styles.spineLine, { backgroundColor: BORDER_COLOR }]} />
                      )}
                    </View>

                    {/* Milestone card */}
                    <View style={[styles.milestoneCard, { marginBottom: isLast ? 0 : 12 }]}>
                      {/* Top row: title + status badge */}
                      <View style={[styles.milestoneTop, { flexDirection: R }]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={[styles.milestoneTitle, { color: colors.foreground, textAlign: TA }]}
                            numberOfLines={2}
                          >
                            {target.title}
                          </Text>
                          {!!target.description && (
                            <Text
                              style={[styles.milestoneDesc, { color: colors.mutedForeground, textAlign: TA }]}
                              numberOfLines={2}
                            >
                              {target.description}
                            </Text>
                          )}
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                          <Text style={[styles.statusText, { color: status.color }]}>
                            {status.label}
                          </Text>
                        </View>
                      </View>

                      {/* Progress bar */}
                      <View style={styles.progressSection}>
                        <View style={[styles.progressMeta, { flexDirection: R }]}>
                          <Text style={[styles.progressFigures, { color: colors.mutedForeground }]}>
                            {target.progress} / {target.targetValue}
                          </Text>
                          <Text style={[styles.progressPct, {
                            color: target.completed ? COLOR_COMPLETED : COLOR_PROGRESS,
                          }]}>
                            {Math.round(pct * 100)}%
                          </Text>
                        </View>
                        <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
                          <View style={[
                            styles.progressFill,
                            {
                              width: `${Math.round(pct * 100)}%` as `${number}%`,
                              backgroundColor: target.completed ? COLOR_COMPLETED : COLOR_PROGRESS,
                            },
                          ]} />
                        </View>
                      </View>

                      {/* Footer row: payout pill + date */}
                      <View style={[styles.milestoneFooter, { flexDirection: R }]}>
                        <View style={[styles.payoutPill, {
                          backgroundColor: target.completed ? COLOR_COMPLETED_BG : COLOR_PROGRESS_BG,
                          flexDirection: R,
                        }]}>
                          <Text style={[styles.payoutLabel, {
                            color: target.completed ? COLOR_COMPLETED : COLOR_PROGRESS,
                          }]}>
                            {t.bonus_amount}:{'  '}
                          </Text>
                          <Text style={[styles.payoutValue, {
                            color: target.completed ? COLOR_COMPLETED : COLOR_PROGRESS,
                          }]}>
                            {formatAmount(target.bonusAmount)} {t.egp}
                          </Text>
                        </View>

                        <View style={[styles.datePill, { flexDirection: R }]}>
                          {target.completed ? (
                            <>
                              <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>
                                {t.completion_date}:{'  '}
                              </Text>
                              <Text style={[styles.dateValue, { color: colors.foreground }]}>
                                {formatDate(target.completedAt ?? target.endsAt)}
                              </Text>
                            </>
                          ) : target.endsAt ? (
                            <>
                              <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>
                                {t.valid_until}:{'  '}
                              </Text>
                              <Text style={[styles.dateValue, { color: colors.foreground }]}>
                                {formatDate(target.endsAt)}
                              </Text>
                            </>
                          ) : null}
                        </View>
                      </View>

                      {/* Payout status row (only when relevant) */}
                      {target.completed && (
                        <View style={[styles.payoutStatusRow, {
                          flexDirection: R,
                          borderTopColor: BORDER_COLOR,
                        }]}>
                          <View style={[styles.payoutStatusDot, {
                            backgroundColor: target.paidOut !== false ? COLOR_COMPLETED : COLOR_PROGRESS,
                          }]} />
                          <Text style={[styles.payoutStatusText, {
                            color: target.paidOut !== false ? COLOR_COMPLETED : COLOR_PROGRESS,
                            textAlign: TA,
                          }]}>
                            {target.paidOut !== false ? t.bonus_paid_out : t.bonus_awaiting_payout}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },

  // State containers
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 32,
    gap: 12,
  },
  stateIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stateTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  stateSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 12,
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },

  // Summary card (split two segments)
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    marginBottom: 20,
    overflow: 'hidden',
  },
  summarySegment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
    gap: 6,
  },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  summaryAmount: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  summaryAmountUnit: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  // Timeline
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  spineCol: {
    alignItems: 'center',
    width: 24,
    paddingTop: 18,
  },
  spineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    zIndex: 1,
  },
  spineLine: {
    flex: 1,
    width: 2,
    marginTop: 4,
    borderRadius: 1,
    minHeight: 20,
  },

  // Milestone card
  milestoneCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    overflow: 'hidden',
  },
  milestoneTop: {
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    paddingBottom: 0,
  },
  milestoneTitle: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
  },
  milestoneDesc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
  },

  // Progress
  progressSection: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  progressMeta: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressFigures: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  progressPct: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  progressTrack: {
    height: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 4,
  },

  // Footer
  milestoneFooter: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
    flexWrap: 'wrap',
  },
  payoutPill: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 2,
  },
  payoutLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  payoutValue: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  datePill: {
    alignItems: 'center',
    gap: 2,
  },
  dateLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  dateValue: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },

  // Payout status row
  payoutStatusRow: {
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  payoutStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  payoutStatusText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
});
