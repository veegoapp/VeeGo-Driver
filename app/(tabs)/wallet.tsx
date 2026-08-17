import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import {
  payoutStatusBadge, normalizeWalletBalance, extractList,
  normalizeSettledTransactions, type PayoutHistoryItem, type RawSettledTransaction,
} from '@/lib/walletHelpers';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';
import { TAB_BAR_HEIGHT_BASE } from '@/constants/tabBar';

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const topPad = insets.top;
  const tabBarHeight = TAB_BAR_HEIGHT_BASE + insets.bottom;

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { data: balanceRaw, isLoading: balanceLoading, isError: balanceError, refetch: refetchBalance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: endpoints.wallet.balance,
  });
  const { data: txRaw, isLoading: txLoading, isError: txError, refetch: refetchTx } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: () => endpoints.wallet.transactions(),
  });
  const { data: payoutHistoryRaw, isLoading: historyLoading, isError: historyError } = useQuery({
    queryKey: ['payout-history'],
    queryFn: endpoints.wallet.getPayoutHistory,
    retry: false,
  });

  const balanceData = normalizeWalletBalance(balanceRaw);
  const txs = useMemo(
    () => normalizeSettledTransactions(txRaw as RawSettledTransaction[] | { data?: RawSettledTransaction[] } | undefined, t, isRTL),
    [txRaw, t, isRTL],
  );
  const payoutHistory = extractList<PayoutHistoryItem>(payoutHistoryRaw as PayoutHistoryItem[] | { data?: PayoutHistoryItem[] } | undefined);

  const isLoading = balanceLoading || txLoading;
  const isError = balanceError || txError;
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([refetchBalance(), refetchTx()]);
    setRefreshing(false);
  };

  const heroAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!balanceLoading) {
      Animated.spring(heroAnim, { toValue: 1, useNativeDriver: true, stiffness: 200, damping: 20 }).start();
    }
  }, [balanceLoading]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <AppLoader />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: Typography.size.sm }}>{t.wallet_load_fail}</Text>
        <Pressable onPress={() => { refetchBalance(); refetchTx(); }} style={{ paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.secondary }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: Typography.size.sm }}>{t.retry_label}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: tabBarHeight + 24, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.wallet}</Text>
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.your_balance}</Text>

        {/* Hero balance card — same gradient identity as the Earnings hero */}
        <Animated.View style={[{ marginTop: 20, opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <LinearGradient colors={colors.gradientEarnings} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
            <View style={styles.balanceBlob} />
            <Text style={[styles.availableLabel, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.available}</Text>
            <View style={[styles.balanceRow, { flexDirection: R }]}>
              <Text style={[styles.balanceAmount, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{balanceData.balance.toFixed(2)}</Text>
              <Text style={[styles.balanceCurrency, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_700Bold' }]}>{t.egp}</Text>
            </View>

            {/* Balance status — paid out vs still pending, from the same balance response */}
            <View style={[styles.balanceStatusRow, { flexDirection: R }]}>
              <Text style={[styles.balanceStatusText, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_600SemiBold' }]}>
                {t.status_paid_out}: {balanceData.totalPaid.toFixed(2)} {t.egp}
              </Text>
              <View style={[styles.balanceStatusDot, { backgroundColor: colors.primaryForeground + '66' }]} />
              <Text style={[styles.balanceStatusText, { color: colors.primaryForeground + 'CC', fontFamily: 'Inter_600SemiBold' }]}>
                {t.status_pending}: {balanceData.totalPending.toFixed(2)} {t.egp}
              </Text>
            </View>

            <View style={[styles.actionRow, { flexDirection: R }]}>
              <Pressable onPress={() => router.push('/wallet-withdraw')} style={({ pressed }) => [styles.primaryAction, { opacity: pressed ? 0.9 : 1 }]}>
                <View style={[styles.actionGrad, { flexDirection: R, backgroundColor: colors.background }]}>
                  <ArrowDownLeft size={16} color={colors.foreground} strokeWidth={2} />
                  <Text style={[styles.actionText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.cash_out}</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => router.push('/wallet-deposit')} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.8 : 1 }]}>
                <View style={[styles.secondaryAction, { flexDirection: R, backgroundColor: colors.primaryForeground + '1F', borderColor: colors.primaryForeground + '33' }]}>
                  <ArrowUpRight size={16} color={colors.primaryForeground} strokeWidth={2} />
                  <Text style={[styles.actionText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.deposit_label}</Text>
                </View>
              </Pressable>
            </View>
          </LinearGradient>
        </Animated.View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: Spacing.xl, marginBottom: Spacing.md, textAlign: TA }]}>{t.payout_history_label}</Text>
        {historyLoading ? (
          <GlassView borderRadius={16} style={{ padding: Spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </GlassView>
        ) : historyError ? (
          <GlassView borderRadius={16} style={{ padding: Spacing.xl, alignItems: 'center' }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{t.payout_history_load_err}</Text>
          </GlassView>
        ) : payoutHistory.length === 0 ? (
          <GlassView borderRadius={16} style={{ padding: Spacing.xl, alignItems: 'center' }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{t.payout_history_empty}</Text>
          </GlassView>
        ) : (
          <GlassView borderRadius={16}>
            {payoutHistory.map((item, i) => {
              const badge = payoutStatusBadge(item.status, colors, t);
              return (
                <View key={item.id} style={[styles.txItem, { flexDirection: R }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
                  <View style={[styles.txIcon, { backgroundColor: colors.secondary }]}>
                    <ArrowUpRight size={16} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.txTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]} numberOfLines={1}>
                      {item.accountName ?? item.method}{item.maskedAccountNumber ? ` — ${item.maskedAccountNumber}` : ''}
                    </Text>
                    <Text style={[styles.txSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={1}>
                      {new Date(item.createdAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-EG')}
                    </Text>
                  </View>
                  <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end', gap: Spacing.xs }}>
                    <Text style={[styles.txAmount, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                      {item.amount.toFixed(2)} {t.egp}
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: badge.color + '1A' }]}>
                      <Text style={[styles.statusPillText, { color: badge.color, fontFamily: 'Inter_700Bold' }]}>{badge.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </GlassView>
        )}

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: Spacing.xl, marginBottom: Spacing.md, textAlign: TA }]}>{t.transactions_label}</Text>
        {txs.length === 0 ? (
          <GlassView borderRadius={16} style={{ padding: Spacing.xl, alignItems: 'center' }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{t.no_transactions_yet}</Text>
          </GlassView>
        ) : (
          <GlassView borderRadius={16}>
            {txs.map((tx, i) => {
              // Debits (payouts/commission) use warning (amber), not destructive
              // (red) — they're routine outflows, not error states.
              const txColor = tx.isCredit ? colors.success : colors.warning;
              return (
                <View key={tx.id} style={[styles.txItem, { flexDirection: R }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
                  <View style={[styles.txIcon, { backgroundColor: txColor + '1A' }]}>
                    {tx.isCredit
                      ? <ArrowDownLeft size={16} color={txColor} strokeWidth={2} />
                      : <ArrowUpRight size={16} color={txColor} strokeWidth={2} />
                    }
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.txTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]} numberOfLines={1}>{tx.title}</Text>
                    <Text style={[styles.txSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={1}>{tx.subtitle}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: txColor, fontFamily: 'Inter_700Bold' }]}>
                    {tx.isCredit ? '+' : '−'}{tx.amount.toFixed(2)} {t.egp}
                  </Text>
                </View>
              );
            })}
          </GlassView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  pageTitle: { fontSize: 24, marginTop: 2 },
  balanceCard: { borderRadius: Radius.xl, padding: 20, overflow: 'hidden', elevation: Shadows.large.elevation, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20 },
  balanceBlob: { position: 'absolute', top: -24, right: -24, width: 128, height: 128, borderRadius: 64, backgroundColor: 'rgba(255,255,255,0.12)' },
  availableLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  balanceRow: { alignItems: 'flex-end', gap: Spacing.sm, marginTop: Spacing.xs },
  balanceAmount: { fontSize: 48, lineHeight: 52 },
  balanceCurrency: { fontSize: 20, marginBottom: Spacing.xs },
  balanceStatusRow: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  balanceStatusText: { fontSize: 11 },
  balanceStatusDot: { width: 3, height: 3, borderRadius: 1.5 },
  actionRow: { gap: Spacing.sm, marginTop: 20 },
  primaryAction: { flex: 1, height: 48, borderRadius: Radius.lg, overflow: 'hidden' },
  actionGrad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  secondaryAction: { height: 48, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  actionText: { fontSize: Typography.size.sm },
  sectionTitle: { fontSize: Typography.size.xs, letterSpacing: 2, textTransform: 'uppercase' },
  statusPill: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: 999 },
  statusPillText: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  txItem: { alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  txIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: Typography.size.sm },
  txSub: { fontSize: Typography.size.xs, marginTop: 2 },
  txAmount: { fontSize: Typography.size.sm },
});
