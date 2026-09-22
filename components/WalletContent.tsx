import { router, useFocusEffect } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Wallet, Wrench } from 'lucide-react-native';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLoader } from '@/components/ui/AppLoader';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { useSocket } from '@/lib/socketContext';
import {
  payoutStatusBadge, normalizeWalletBalance, extractList,
  normalizeSettledTransactions, type PayoutHistoryItem, type RawSettledTransaction,
} from '@/lib/walletHelpers';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { TAB_BAR_HEIGHT_BASE } from '@/constants/tabBar';
import { useSplitColors, type SplitColors } from '@/lib/splitTheme';

// Shared by both app/(tabs)/wallet.tsx (ride tab bar) and
// app/(shuttle)/wallet.tsx (shuttle tab bar) — they used to be two
// independently-drifted screens on the same wallet/earnings endpoints
// (driver_wallet_ledger is unified across ride + shuttle earnings; there
// is no ride-only or shuttle-only wallet data). One screen, two thin
// route wrappers. Picks the best of both: the shuttle screen's weekly
// chart + earnings breakdown, the ride screen's cleaner C-styled hero —
// plus two real bugs fixed along the way (see below).

const C_MINT = '#3DDC97';
const C_AMBER = '#F5A623';

type WalletFeature = {
  isEnabled: boolean;
  displayMode: 'live' | 'coming_soon' | 'maintenance' | 'unavailable';
  unavailableMessage?: string | null;
};

type WeeklyRow = { week_start: string; trip_count: number; total_earned: number | string };
type EarningsSummary = {
  summary: { totalEarnings: string; totalPaid: string; totalPending: string; totalConfirmed: string };
};

function formatWeekLabel(weekStart: string, locale: string): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  if (isNaN(d.getTime())) return weekStart;
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function WalletContent() {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const colors = useColors();
  const S = useSplitColors();
  const styles = useMemo(() => makeStyles(S), [S]);
  const topPad = insets.top;
  const tabBarHeight = TAB_BAR_HEIGHT_BASE + insets.bottom;
  const TA = isRTL ? 'right' as const : 'left' as const;
  const locale = isRTL ? 'ar-EG' : 'en-GB';
  const { socket } = useSocket();

  // ── Wallet feature flag — the backend gates /earnings/* and returns 403
  // when disabled; both screens now handle that gracefully instead of only
  // the shuttle one (the ride screen previously had no gate at all and
  // would just show a raw load-failed error).
  const [walletFeatureOverride, setWalletFeatureOverride] = useState<WalletFeature | null>(null);
  const { data: walletFeatureRaw } = useQuery({
    queryKey: ['wallet-feature'],
    queryFn: endpoints.wallet.feature,
    staleTime: 60_000,
  });
  const walletFeature: WalletFeature = walletFeatureOverride ?? (() => {
    const raw = walletFeatureRaw as { data?: WalletFeature } | WalletFeature | undefined;
    return (raw as { data?: WalletFeature })?.data ?? (raw as WalletFeature) ?? { isEnabled: false, displayMode: 'coming_soon' };
  })();

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: WalletFeature) => setWalletFeatureOverride(payload);
    socket.on(SOCKET_EVENTS.DRIVER_WALLET_FEATURE, handler);
    return () => { socket.off(SOCKET_EVENTS.DRIVER_WALLET_FEATURE, handler); };
  }, [socket]);

  const walletLive = walletFeature.isEnabled && walletFeature.displayMode === 'live';

  const { data: balanceRaw, isLoading: balanceLoading, isError: balanceError, refetch: refetchBalance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: endpoints.wallet.balance,
    enabled: walletLive,
  });
  const { data: txRaw, isLoading: txLoading, isError: txError, refetch: refetchTx } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: () => endpoints.wallet.transactions(1, 20),
    enabled: walletLive,
  });
  const { data: weeklyRaw, isLoading: weeklyLoading } = useQuery({
    queryKey: ['earnings-weekly'],
    queryFn: () => endpoints.earnings.weekly(4),
    enabled: walletLive,
  });
  const { data: summaryRaw, isLoading: summaryLoading } = useQuery({
    queryKey: ['earnings-summary'],
    queryFn: () => endpoints.earnings.summary(),
    enabled: walletLive,
  });

  // M18: the balance/earnings queries above only ever refetched on mount, so
  // a trip completing (or any other wallet-affecting change) while this
  // screen wasn't the active tab left it showing a stale figure until the
  // app was killed and reopened. Refetch on screen focus, and on the same
  // "notification:new" socket event trip-completion already fires (mirrors
  // the passenger app's H18 wallet fix) — no new backend event, no polling.
  const queryClient = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      if (!walletLive) return;
      refetchBalance();
      refetchTx();
      queryClient.invalidateQueries({ queryKey: ['earnings-weekly'] });
      queryClient.invalidateQueries({ queryKey: ['earnings-summary'] });
    }, [walletLive, refetchBalance, refetchTx, queryClient]),
  );

  useEffect(() => {
    if (!socket || !walletLive) return;
    const handler = () => {
      refetchBalance();
      refetchTx();
      queryClient.invalidateQueries({ queryKey: ['earnings-weekly'] });
      queryClient.invalidateQueries({ queryKey: ['earnings-summary'] });
    };
    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, handler);
    return () => { socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, handler); };
  }, [socket, walletLive, refetchBalance, refetchTx, queryClient]);
  const { data: payoutHistoryRaw, isLoading: historyLoading, isError: historyError } = useQuery({
    queryKey: ['payout-history'],
    queryFn: endpoints.wallet.getPayoutHistory,
    enabled: walletLive,
    retry: false,
  });

  const balanceData = normalizeWalletBalance(balanceRaw);
  const txs = useMemo(
    () => normalizeSettledTransactions(txRaw as RawSettledTransaction[] | { data?: RawSettledTransaction[] } | undefined, t, isRTL),
    [txRaw, t, isRTL],
  );
  const payoutHistory = extractList<PayoutHistoryItem>(payoutHistoryRaw as PayoutHistoryItem[] | { data?: PayoutHistoryItem[] } | undefined);

  // The backend's /earnings/weekly returns { week_start, trip_count,
  // total_earned } — a per-WEEK breakdown, listed newest-last (so the most
  // recent week is highlighted below).
  const weeklyRows: WeeklyRow[] = ((weeklyRaw as { weeklyBreakdown?: WeeklyRow[] } | undefined)?.weeklyBreakdown ?? []);
  const summary = summaryRaw as EarningsSummary | undefined;

  const isLoading = walletLive && (balanceLoading || txLoading);
  const isError = balanceError || txError;
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([refetchBalance(), refetchTx()]);
    setRefreshing(false);
  };

  // ── Not-live screen ────────────────────────────────────────────────────────
  if (!walletLive) {
    const isMaintenance = walletFeature.displayMode === 'maintenance';
    return (
      <View style={[styles.container, { backgroundColor: S.bg }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xxl, gap: Spacing.lg }}>
          <View style={[styles.comingSoonIcon, { backgroundColor: S.surfaceMuted, borderColor: S.hair }]}>
            {isMaintenance
              ? <Wrench size={36} color={S.cap} strokeWidth={1.5} />
              : <Wallet size={36} color={S.cap} strokeWidth={1.5} />
            }
          </View>
          <Text style={[styles.comingSoonTitle, { color: S.ink, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>
            {t.wallet_title}
          </Text>
          <View style={[styles.comingSoonBadge, { backgroundColor: S.surfaceMuted, borderColor: S.hair }]}>
            <Text style={[styles.comingSoonBadgeText, { color: S.ink, fontFamily: 'Inter_700Bold' }]}>
              {isMaintenance ? t.under_maintenance : t.coming_soon_badge}
            </Text>
          </View>
          <Text style={[styles.comingSoonSub, { color: S.cap, fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
            {walletFeature.unavailableMessage ?? (isMaintenance ? t.maintenance_wallet_msg : t.coming_soon_wallet_msg)}
          </Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: S.bg, alignItems: 'center', justifyContent: 'center' }]}>
        <AppLoader />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: S.bg, alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <Text style={{ color: S.cap, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{t.wallet_load_fail}</Text>
        <Pressable onPress={() => { refetchBalance(); refetchTx(); }} style={{ paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: S.panel }}>
          <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }}>{t.retry_label}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: S.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Dark hero — balance + paid/pending + cash-out/deposit */}
        <View style={[styles.hero, { paddingTop: topPad + 14 }]}>
          <Text style={[styles.heroCap, { textAlign: TA, fontFamily: 'Inter_700Bold' }]}>{t.available}</Text>
          <View style={[styles.balanceRow, { flexDirection: 'row' }]}>
            <Text style={[styles.balanceAmount, { fontFamily: 'Inter_800ExtraBold' }]}>{balanceData.balance.toFixed(0)}</Text>
            <Text style={[styles.balanceCurrency, { fontFamily: 'Inter_700Bold' }]}>{t.egp}</Text>
          </View>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCell}>
              <Text style={[styles.heroStatValue, { color: C_MINT, fontFamily: 'Inter_800ExtraBold' }]}>{balanceData.totalPaid.toFixed(0)}</Text>
              <Text style={[styles.heroStatCap, { fontFamily: 'Inter_700Bold' }]}>{t.status_paid_out}</Text>
            </View>
          </View>

          <View style={[styles.actionRow, { flexDirection: 'row' }]}>
            <Pressable onPress={() => router.push('/wallet-withdraw')} style={({ pressed }) => [styles.primaryAction, { opacity: pressed ? 0.9 : 1 }]}>
              <ArrowDownLeft size={16} color="#14151A" strokeWidth={2} />
              <Text style={[styles.primaryActionText, { fontFamily: 'Inter_800ExtraBold' }]}>{t.cash_out}</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/wallet-deposit')} style={({ pressed }) => [styles.secondaryAction, { opacity: pressed ? 0.8 : 1 }]}>
              <ArrowUpRight size={16} color="#fff" strokeWidth={2} />
              <Text style={[styles.secondaryActionText, { fontFamily: 'Inter_800ExtraBold' }]}>{t.deposit_label}</Text>
            </Pressable>
          </View>
        </View>

        {/* White body */}
        <View style={{ paddingHorizontal: Spacing.lg }}>
          {/* Weekly earnings */}
          <Text style={[styles.sectionTitle, { color: S.ink, fontFamily: 'Inter_800ExtraBold', textAlign: TA, marginTop: Spacing.xl }]}>{t.this_week}</Text>
          {weeklyLoading ? (
            <View style={[styles.emptyCard, { alignItems: 'center' }]}>
              <ActivityIndicator color={S.ink} />
            </View>
          ) : weeklyRows.length === 0 ? (
            <View style={[styles.emptyCard, { alignItems: 'center' }]}>
              <Text style={{ color: S.cap, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{t.no_data_yet}</Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {weeklyRows.map((w, i) => {
                const amount = parseFloat(String(w.total_earned)) || 0;
                const isCurrent = i === weeklyRows.length - 1;
                return (
                  <View key={w.week_start} style={[styles.txItem, { flexDirection: 'row' }, i > 0 && styles.txItemBorder]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[styles.txTitle, { color: S.ink, fontFamily: isCurrent ? 'Inter_800ExtraBold' : 'Inter_700Bold', textAlign: TA }]}
                        numberOfLines={1}
                      >
                        {formatWeekLabel(w.week_start, locale)}
                      </Text>
                      <Text style={[styles.txSub, { color: S.cap, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={1}>
                        {w.trip_count} {t.trips}
                      </Text>
                    </View>
                    <Text style={[styles.txAmount, { color: S.ink, fontFamily: 'Inter_800ExtraBold' }]}>
                      {amount.toFixed(2)} {t.egp}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Net earnings breakdown */}
          <Text style={[styles.sectionTitle, { color: S.ink, fontFamily: 'Inter_800ExtraBold', textAlign: TA, marginTop: Spacing.xl }]}>{t.net_earnings}</Text>
          {summaryLoading ? (
            <View style={[styles.emptyCard, { alignItems: 'center' }]}>
              <ActivityIndicator color={S.ink} />
            </View>
          ) : (
            <View style={styles.listCard}>
              <SummaryRow label={t.status_confirmed} value={`+${parseFloat(summary?.summary?.totalConfirmed ?? '0').toFixed(2)} ${t.egp}`} color={S.teal} S={S} />
              <SummaryRow label={t.status_paid_out} value={`${parseFloat(summary?.summary?.totalPaid ?? '0').toFixed(2)} ${t.egp}`} color={S.ink} S={S} />
              <SummaryRow label={t.net_earnings} value={`${parseFloat(summary?.summary?.totalEarnings ?? '0').toFixed(2)} ${t.egp}`} color={S.ink} bold S={S} last />
            </View>
          )}

          {/* Payout history */}
          <Text style={[styles.sectionTitle, { color: S.ink, fontFamily: 'Inter_800ExtraBold', textAlign: TA, marginTop: Spacing.xl }]}>{t.payout_history_label}</Text>
          {historyLoading ? (
            <View style={[styles.emptyCard, { alignItems: 'center' }]}>
              <ActivityIndicator color={S.ink} />
            </View>
          ) : historyError ? (
            <View style={[styles.emptyCard, { alignItems: 'center' }]}>
              <Text style={{ color: S.cap, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{t.payout_history_load_err}</Text>
            </View>
          ) : payoutHistory.length === 0 ? (
            <View style={[styles.emptyCard, { alignItems: 'center' }]}>
              <Text style={{ color: S.cap, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{t.payout_history_empty}</Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {payoutHistory.map((item, i) => {
                const badge = payoutStatusBadge(item.status, colors, t);
                return (
                  <View key={item.id} style={[styles.txItem, { flexDirection: 'row' }, i > 0 && styles.txItemBorder]}>
                    <View style={styles.txIcon}>
                      <ArrowUpRight size={15} color={S.ink} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.txTitle, { color: S.ink, fontFamily: 'Inter_700Bold', textAlign: TA }]} numberOfLines={1}>
                        {item.accountName ?? item.method}{item.maskedAccountNumber ? ` — ${item.maskedAccountNumber}` : ''}
                      </Text>
                      <Text style={[styles.txSub, { color: S.cap, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={1}>
                        {new Date(item.createdAt).toLocaleDateString(locale)}
                      </Text>
                    </View>
                    <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end', gap: 4 }}>
                      <Text style={[styles.txAmount, { color: S.ink, fontFamily: 'Inter_800ExtraBold' }]}>
                        {item.amount.toFixed(2)} {t.egp}
                      </Text>
                      <Text style={[styles.statusText, { color: badge.color, fontFamily: 'Inter_800ExtraBold' }]}>{badge.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Transactions */}
          <Text style={[styles.sectionTitle, { color: S.ink, fontFamily: 'Inter_800ExtraBold', textAlign: TA, marginTop: Spacing.xl }]}>{t.transactions_label}</Text>
          {txs.length === 0 ? (
            <View style={[styles.emptyCard, { alignItems: 'center' }]}>
              <Text style={{ color: S.cap, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{t.no_transactions_yet}</Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {txs.map((tx, i) => {
                const txColor = tx.isCredit ? S.teal : C_AMBER;
                const txBg = tx.isCredit ? '#DDF4EB' : '#FFF1DC';
                return (
                  <View key={tx.id} style={[styles.txItem, { flexDirection: 'row' }, i > 0 && styles.txItemBorder]}>
                    <View style={[styles.txIcon, { backgroundColor: txBg }]}>
                      {tx.isCredit
                        ? <ArrowDownLeft size={15} color={txColor} strokeWidth={2} />
                        : <ArrowUpRight size={15} color={txColor} strokeWidth={2} />
                      }
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.txTitle, { color: S.ink, fontFamily: 'Inter_700Bold', textAlign: TA }]} numberOfLines={1}>{tx.title}</Text>
                      <Text style={[styles.txSub, { color: S.cap, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={1}>{tx.subtitle}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: txColor, fontFamily: 'Inter_800ExtraBold' }]}>
                      {tx.isCredit ? '+' : '−'}{tx.amount.toFixed(2)} {t.egp}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryRow({ label, value, color, bold, last, S }: {
  label: string; value: string; color: string; bold?: boolean; last?: boolean; S: SplitColors;
}) {
  return (
    <View style={[styles2.summaryRow, { flexDirection: 'row' }, !last && { borderBottomWidth: 1, borderBottomColor: S.hair }]}>
      <Text style={[styles2.summaryLabel, { color: S.cap, fontFamily: 'Inter_400Regular' }]}>{label}</Text>
      <Text style={[styles2.summaryValue, { color, fontFamily: bold ? 'Inter_800ExtraBold' : 'Inter_700Bold' }]}>{value}</Text>
    </View>
  );
}

const styles2 = StyleSheet.create({
  summaryRow: { alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13.5 },
});

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
  container: { flex: 1 },
  hero: { backgroundColor: S.panel, paddingHorizontal: 22, paddingBottom: 22, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  heroCap: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: S.capOnDark },
  balanceRow: { alignItems: 'flex-end', gap: 8, marginTop: 2 },
  balanceAmount: { fontSize: 44, lineHeight: 48, color: '#fff' },
  balanceCurrency: { fontSize: 18, color: S.capOnDark, marginBottom: 4 },
  heroStatsRow: { flexDirection: 'row', marginTop: 18 },
  heroStatCell: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 15, color: '#fff' },
  heroStatCap: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: S.capOnDark, marginTop: 2 },
  actionRow: { gap: 10, marginTop: 20 },
  // Fixed (not theme-adaptive): this pill sits on the always-dark hero above,
  // same as the hero itself — S.card/S.ink would flip to a near-black pill on
  // dark mode and disappear against the panel.
  primaryAction: { flex: 1, height: 48, borderRadius: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { fontSize: 13.5, color: '#14151A' },
  secondaryAction: { flex: 1, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryActionText: { fontSize: 13.5, color: '#fff' },
  sectionTitle: { fontSize: 15, marginBottom: Spacing.md },
  emptyCard: { padding: Spacing.xl, borderRadius: 16, backgroundColor: S.card },
  listCard: { backgroundColor: S.card, borderRadius: 16, overflow: 'hidden' },
  txItem: { alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  txItemBorder: { borderTopWidth: 1, borderTopColor: S.hair },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: S.hair },
  txTitle: { fontSize: 13.5 },
  txSub: { fontSize: 11.5, marginTop: 2 },
  txAmount: { fontSize: 13.5 },
  statusText: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  comingSoonIcon: { width: 88, height: 88, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  comingSoonTitle: { fontSize: 22 },
  comingSoonBadge: { paddingHorizontal: Spacing.lg, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  comingSoonBadgeText: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  comingSoonSub: { fontSize: 14, lineHeight: 22 },
  });
}
