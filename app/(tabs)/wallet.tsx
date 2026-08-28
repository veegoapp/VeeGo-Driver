import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import {
  payoutStatusBadge, normalizeWalletBalance, extractList,
  normalizeSettledTransactions, type PayoutHistoryItem, type RawSettledTransaction,
} from '@/lib/walletHelpers';
import { Spacing } from '@/constants/spacing';
import { TAB_BAR_HEIGHT_BASE } from '@/constants/tabBar';
import { useSplitColors, type SplitColors } from '@/lib/splitTheme';

const C_MINT = '#3DDC97';
const C_AMBER = '#F5A623';

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const S = useSplitColors();
  const styles = useMemo(() => makeStyles(S), [S]);
  const topPad = insets.top;
  const tabBarHeight = TAB_BAR_HEIGHT_BASE + insets.bottom;
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
        <Pressable onPress={() => { refetchBalance(); refetchTx(); }} style={{ paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: S.ink }}>
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
        {/* Dark hero — balance, paid/pending stats, cash-out & deposit all embedded */}
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
            <View style={styles.heroDivider} />
            <View style={styles.heroStatCell}>
              <Text style={[styles.heroStatValue, { fontFamily: 'Inter_800ExtraBold' }]}>{balanceData.totalPending.toFixed(0)}</Text>
              <Text style={[styles.heroStatCap, { fontFamily: 'Inter_700Bold' }]}>{t.status_pending}</Text>
            </View>
          </View>

          <View style={[styles.actionRow, { flexDirection: 'row' }]}>
            <Pressable onPress={() => router.push('/wallet-withdraw')} style={({ pressed }) => [styles.primaryAction, { opacity: pressed ? 0.9 : 1 }]}>
              <ArrowDownLeft size={16} color={S.ink} strokeWidth={2} />
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
                        {new Date(item.createdAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-EG')}
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

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
  container: { flex: 1 },
  hero: { backgroundColor: S.ink, paddingHorizontal: 22, paddingBottom: 22, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  heroCap: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: S.capOnDark },
  balanceRow: { alignItems: 'flex-end', gap: 8, marginTop: 2 },
  balanceAmount: { fontSize: 44, lineHeight: 48, color: '#fff' },
  balanceCurrency: { fontSize: 18, color: S.capOnDark, marginBottom: 4 },
  heroStatsRow: { flexDirection: 'row', marginTop: 18 },
  heroStatCell: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 15, color: '#fff' },
  heroStatCap: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: S.capOnDark, marginTop: 2 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,.12)' },
  actionRow: { gap: 10, marginTop: 20 },
  primaryAction: { flex: 1, height: 48, borderRadius: 14, backgroundColor: S.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { fontSize: 13.5, color: S.ink },
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
  });
}
