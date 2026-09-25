import { router, useFocusEffect } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Wallet, Wrench } from 'lucide-react-native';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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

const C_AMBER = '#F5A623';
// Ticket-stub styling: money figures render in a monospace face (tabular
// numerals, receipt/boarding-pass feel) — a system font, not a bundled one,
// since the app only loads the Inter family today.
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

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
        {/* Balance — a ticket-stub card on the page's normal background,
            replacing the old full-bleed dark hero block. */}
        <View style={{ paddingTop: topPad + 14, paddingHorizontal: Spacing.lg }}>
          <View style={[styles.ticketCard, { borderColor: S.hair, backgroundColor: S.card }]}>
            <Text style={[styles.ticketCap, { color: S.cap, textAlign: TA, fontFamily: 'Inter_700Bold' }]}>{t.available}</Text>
            <View style={[styles.balanceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.balanceAmount, { color: S.ink }]}>{balanceData.balance.toFixed(2)}</Text>
              <Text style={[styles.balanceCurrency, { color: S.cap }]}>{t.egp}</Text>
            </View>

            {/* Perforated divider with punch-out notches on both edges —
                notches are colored to match the page background (S.bg), not
                the card, so they read as a cut-out rather than a dot. */}
            <View style={styles.perfRow}>
              <View style={[styles.perfLine, { borderTopColor: S.hair }]} />
              <View style={[styles.notch, styles.notchLeft, { backgroundColor: S.bg, borderColor: S.hair }]} />
              <View style={[styles.notch, styles.notchRight, { backgroundColor: S.bg, borderColor: S.hair }]} />
            </View>

            <View style={[styles.ticketStatRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.ticketStatValue, { color: S.teal }]}>{balanceData.totalPaid.toFixed(2)} {t.egp}</Text>
              <Text style={[styles.ticketStatLabel, { color: S.cap }]}>{t.status_paid_out}</Text>
            </View>
          </View>

          <View style={[styles.actionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Pressable onPress={() => router.push('/wallet-withdraw')} style={({ pressed }) => [styles.primaryAction, { backgroundColor: S.ink, opacity: pressed ? 0.9 : 1 }]}>
              <ArrowDownLeft size={16} color={S.bg} strokeWidth={2} />
              <Text style={[styles.primaryActionText, { color: S.bg, fontFamily: 'Inter_800ExtraBold' }]}>{t.cash_out}</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/wallet-deposit')} style={({ pressed }) => [styles.secondaryAction, { backgroundColor: S.card, borderColor: S.hair, opacity: pressed ? 0.8 : 1 }]}>
              <ArrowUpRight size={16} color={S.ink} strokeWidth={2} />
              <Text style={[styles.secondaryActionText, { color: S.ink, fontFamily: 'Inter_800ExtraBold' }]}>{t.deposit_label}</Text>
            </Pressable>
          </View>
        </View>

        {/* Body */}
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
                  <View key={w.week_start} style={[styles.txItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }, i > 0 && styles.txItemBorder]}>
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
                    <Text style={[styles.txAmount, { color: S.ink }]}>
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
              <SummaryRow label={t.status_confirmed} value={`+${parseFloat(summary?.summary?.totalConfirmed ?? '0').toFixed(2)} ${t.egp}`} color={S.teal} S={S} isRTL={isRTL} />
              <SummaryRow label={t.status_paid_out} value={`${parseFloat(summary?.summary?.totalPaid ?? '0').toFixed(2)} ${t.egp}`} color={S.ink} S={S} isRTL={isRTL} />
              <SummaryRow label={t.net_earnings} value={`${parseFloat(summary?.summary?.totalEarnings ?? '0').toFixed(2)} ${t.egp}`} color={S.ink} bold S={S} last isRTL={isRTL} />
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
                  <View key={item.id} style={[styles.txItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }, i > 0 && styles.txItemBorder]}>
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
                      <Text style={[styles.txAmount, { color: S.ink }]}>
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
                  <View key={tx.id} style={[styles.txItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }, i > 0 && styles.txItemBorder]}>
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
                    <Text style={[styles.txAmount, { color: txColor }]}>
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

function SummaryRow({ label, value, color, bold, last, S, isRTL }: {
  label: string; value: string; color: string; bold?: boolean; last?: boolean; S: SplitColors; isRTL: boolean;
}) {
  return (
    <View style={[styles2.summaryRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }, !last && { borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: S.hair }]}>
      <Text style={[styles2.summaryLabel, { color: S.cap, fontFamily: 'Inter_400Regular' }]}>{label}</Text>
      <Text style={[styles2.summaryValue, { color, fontWeight: bold ? '800' : '700' }]}>{value}</Text>
    </View>
  );
}

const styles2 = StyleSheet.create({
  summaryRow: { alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13.5, fontFamily: MONO },
});

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
  container: { flex: 1 },
  // Ticket-stub balance card — sits on the page's normal background (no
  // full-bleed colored hero block), bordered and sharper-cornered than the
  // app's usual 16-20px cards to read as a receipt/boarding-pass.
  ticketCard: { borderWidth: 1, borderRadius: 10, padding: 20 },
  ticketCap: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase' },
  balanceRow: { alignItems: 'flex-end', gap: 8, marginTop: 4 },
  balanceAmount: { fontSize: 40, lineHeight: 44, fontFamily: MONO, fontWeight: '700' },
  balanceCurrency: { fontSize: 15, fontWeight: '700', marginBottom: 4, fontFamily: MONO },
  // Perforation: a dashed line with a punch-out circle on each edge, colored
  // to match the page background so they read as a cut-out, not a dot.
  perfRow: { height: 1, marginVertical: 18, position: 'relative' },
  perfLine: { flex: 1, borderTopWidth: 1, borderStyle: 'dashed' },
  notch: { position: 'absolute', top: -9, width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
  notchLeft: { left: -29 },
  notchRight: { right: -29 },
  ticketStatRow: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  ticketStatValue: { fontSize: 15, fontWeight: '700', fontFamily: MONO },
  ticketStatLabel: { fontSize: 11.5, fontWeight: '600' },
  actionRow: { gap: 10, marginTop: 14 },
  primaryAction: { flex: 1, height: 50, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { fontSize: 13, letterSpacing: 0.3, textTransform: 'uppercase' },
  secondaryAction: { flex: 1, height: 50, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryActionText: { fontSize: 13, letterSpacing: 0.3, textTransform: 'uppercase' },
  sectionTitle: { fontSize: 12.5, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.md },
  emptyCard: { padding: Spacing.xl, borderRadius: 10, backgroundColor: S.card, borderWidth: 1, borderColor: S.hair },
  listCard: { backgroundColor: S.card, borderRadius: 10, borderWidth: 1, borderColor: S.hair, overflow: 'hidden' },
  txItem: { alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  txItemBorder: { borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: S.hair },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: S.hair },
  txTitle: { fontSize: 13.5 },
  txSub: { fontSize: 11.5, marginTop: 2 },
  txAmount: { fontSize: 13.5, fontFamily: MONO, fontWeight: '700' },
  statusText: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  comingSoonIcon: { width: 88, height: 88, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  comingSoonTitle: { fontSize: 22 },
  comingSoonBadge: { paddingHorizontal: Spacing.lg, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  comingSoonBadgeText: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  comingSoonSub: { fontSize: 14, lineHeight: 22 },
  });
}
