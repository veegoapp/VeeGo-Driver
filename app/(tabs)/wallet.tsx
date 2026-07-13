import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Briefcase, CreditCard, Phone, Plus, X } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';

type WalletBalance = { balance: number };
type Transaction = { id: string; title: string; sub: string; amount: number; incoming: boolean };
// A driver's own saved payout destination (see /driver/payout-accounts).
// Only instapay / vodafone_cash are supported today; methodKey is a plain
// string so future methods (e.g. bank accounts) don't need a shape change.
type PayoutAccount = {
  id: number;
  methodKey: string;
  accountName: string;
  accountNumber: string;
  isDefault: boolean;
  isVerified: boolean;
  isActive: boolean;
};
// One row from GET /driver/wallet/payouts — the driver's own payout requests.
type PayoutHistoryItem = {
  id: number;
  amount: number;
  status: 'pending' | 'processing' | 'paid' | 'cancelled';
  method: string | null;
  accountName: string | null;
  maskedAccountNumber: string | null;
  createdAt: string;
  paidAt: string | null;
};

const TAB_BAR_HEIGHT = 96;

// Maps a payout request's status to a badge color + label, reusing existing
// status_pending / status_paid_out / status_cancelled translation keys.
function payoutStatusBadge(status: PayoutHistoryItem['status'], colors: ReturnType<typeof useColors>, t: ReturnType<typeof useI18n>['t']) {
  switch (status) {
    case 'paid':
      return { label: t.status_paid_out, color: colors.primary };
    case 'cancelled':
      return { label: t.status_cancelled, color: colors.destructive };
    default:
      return { label: t.status_pending, color: colors.mutedForeground };
  }
}

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const topPad = insets.top;
  const queryClient = useQueryClient();

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const [payoutVisible, setPayoutVisible] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [isPayingOut, setIsPayingOut] = useState(false);

  const { data: balanceRaw, isLoading: balanceLoading, isError: balanceError, refetch: refetchBalance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: endpoints.wallet.balance,
  });
  const { data: txRaw, isLoading: txLoading, isError: txError, refetch: refetchTx } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: endpoints.wallet.transactions,
  });
  const { data: payoutAccountsRaw } = useQuery({
    queryKey: ['payout-accounts'],
    queryFn: endpoints.wallet.getPayoutAccounts,
    retry: false,
  });
  const { data: payoutHistoryRaw, isLoading: historyLoading, isError: historyError } = useQuery({
    queryKey: ['payout-history'],
    queryFn: endpoints.wallet.getPayoutHistory,
    retry: false,
  });

  const _balRaw = balanceRaw as WalletBalance | { balance?: number; wallet?: { balance?: number } } | undefined;
  const balanceData: WalletBalance = {
    balance: (typeof (_balRaw as WalletBalance)?.balance === 'number'
      ? (_balRaw as WalletBalance).balance
      : parseFloat(String((_balRaw as { wallet?: { balance?: number } })?.wallet?.balance ?? (_balRaw as { balance?: unknown })?.balance ?? 0))),
  };
  const _txRaw = txRaw as Transaction[] | { transactions?: Transaction[]; data?: Transaction[] } | undefined;
  const txs: Transaction[] = Array.isArray(_txRaw) ? _txRaw : ((_txRaw as { transactions?: Transaction[] })?.transactions ?? ((_txRaw as { data?: Transaction[] })?.data ?? []));
  const _paRaw = payoutAccountsRaw as PayoutAccount[] | { data?: PayoutAccount[] } | undefined;
  const payoutAccounts: PayoutAccount[] = (
    Array.isArray(_paRaw) ? _paRaw : ((_paRaw as { data?: PayoutAccount[] })?.data ?? [])
  ).filter(a => a.isActive);
  const _phRaw = payoutHistoryRaw as PayoutHistoryItem[] | { data?: PayoutHistoryItem[] } | undefined;
  const payoutHistory: PayoutHistoryItem[] = Array.isArray(_phRaw) ? _phRaw : ((_phRaw as { data?: PayoutHistoryItem[] })?.data ?? []);

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

  const handlePayoutOpen = () => {
    if (payoutAccounts.length === 0) {
      Alert.alert(t.error, (t as any).no_payout_methods ?? 'Please add a payout account first.');
      router.push('/payout-accounts' as any);
      return;
    }
    setPayoutAmount(String(balanceData?.balance ?? ''));
    setPayoutVisible(true);
  };

  const handlePayoutConfirm = async () => {
    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0) {
      Alert.alert(t.invalid_amount_title, t.invalid_amount_msg);
      return;
    }
    // Prefer the driver's default account, falling back to the first active one.
    const selectedAccount = payoutAccounts.find(a => a.isDefault) ?? payoutAccounts[0] ?? null;
    if (!selectedAccount) {
      Alert.alert(t.error, (t as any).no_payout_methods ?? 'Please add a payout account first.');
      return;
    }
    setIsPayingOut(true);
    try {
      await endpoints.wallet.payout(amount, selectedAccount.id);
      await queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      setPayoutVisible(false);
      setPayoutAmount('');
      // Payout request is pending admin confirmation — not yet paid.
      Alert.alert(t.payout_success_title, t.payout_pending_msg);
    } catch {
      Alert.alert(t.error, t.payout_fail_msg);
    } finally {
      setIsPayingOut(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: Typography.size.sm }}>{t.wallet_load_fail}</Text>
        <Pressable onPress={() => { refetchBalance(); refetchTx(); }} style={{ paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.secondary }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: Typography.size.sm }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: TAB_BAR_HEIGHT + 24, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.wallet}</Text>
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.your_balance}</Text>

        <Animated.View style={[{ marginTop: 20, opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <View style={[styles.balanceCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <View style={[styles.balanceBlob, { backgroundColor: colors.primary + '33' }]} />
            <Text style={[styles.availableLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.available}</Text>
            <View style={[styles.balanceRow, { flexDirection: R }]}>
              <Text style={[styles.balanceAmount, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{(balanceData?.balance ?? 0).toFixed(2)}</Text>
              <Text style={[styles.balanceCurrency, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.egp}</Text>
            </View>

            {payoutVisible ? (
              <View style={styles.payoutInput}>
                <View style={[styles.payoutRow, { borderColor: colors.border }]}>
                  <TextInput
                    value={payoutAmount}
                    onChangeText={setPayoutAmount}
                    keyboardType="decimal-pad"
                    placeholder={t.amount_placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.payoutTextInput, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}
                    autoFocus
                  />
                  <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: Typography.size.sm }]}>{t.egp}</Text>
                </View>
                <View style={[styles.actionRow, { flexDirection: R }]}>
                  <Pressable onPress={() => setPayoutVisible(false)} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.8 : 1 }]}>
                    <GlassView strong style={[styles.secondaryAction, { flexDirection: R }]} borderRadius={16}>
                      <X size={16} color={colors.foreground} strokeWidth={2} />
                      <Text style={[styles.actionText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.cancel}</Text>
                    </GlassView>
                  </Pressable>
                  <Pressable onPress={handlePayoutConfirm} disabled={isPayingOut} style={({ pressed }) => [styles.primaryAction, { opacity: pressed || isPayingOut ? 0.8 : 1 }]}>
                    <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.actionGrad, { flexDirection: R }]}>
                      {isPayingOut
                        ? <ActivityIndicator color={colors.primaryForeground} size="small" />
                        : <ArrowDownLeft size={16} color={colors.primaryForeground} strokeWidth={2} />
                      }
                      <Text style={[styles.actionText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.confirm}</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={[styles.actionRow, { flexDirection: R }]}>
                <Pressable onPress={handlePayoutOpen} style={({ pressed }) => [styles.primaryAction, { opacity: pressed ? 0.9 : 1 }]}>
                  <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.actionGrad, { flexDirection: R }]}>
                    <ArrowDownLeft size={16} color={colors.primaryForeground} strokeWidth={2} />
                    <Text style={[styles.actionText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{t.cash_out}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            )}
          </View>
        </Animated.View>

        <View style={[styles.sectionHeader, { flexDirection: R }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.payout_methods}</Text>
          <Pressable onPress={() => router.push('/payout-accounts' as any)} hitSlop={8}>
            <Text style={[styles.addBtn, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{t.manage}</Text>
          </Pressable>
        </View>
        <View style={{ gap: Spacing.sm }}>
          {payoutAccounts.length > 0 ? payoutAccounts.map((account) => (
            <GlassView key={account.id} style={[styles.methodCard, { flexDirection: R }]} borderRadius={16}>
              <View style={[styles.methodIcon, { backgroundColor: account.isDefault ? colors.primary + '26' : colors.secondary }]}>
                {account.methodKey === 'vodafone_cash' ? (
                  <Phone size={20} color={account.isDefault ? colors.primary : colors.mutedForeground} strokeWidth={2} />
                ) : account.methodKey === 'instapay' ? (
                  <Briefcase size={20} color={account.isDefault ? colors.primary : colors.mutedForeground} strokeWidth={2} />
                ) : (
                  <CreditCard size={20} color={account.isDefault ? colors.primary : colors.mutedForeground} strokeWidth={2} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.methodName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                  {account.accountName} — {account.accountNumber}
                </Text>
                <Text style={[styles.methodSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                  {account.isVerified ? t.default_card : t.pending_verification}
                </Text>
              </View>
              {account.isDefault && (
                <Text style={[styles.defaultBadge, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{t.default_card}</Text>
              )}
            </GlassView>
          )) : (
            <Pressable onPress={() => router.push('/payout-accounts' as any)}>
              <GlassView style={[styles.methodCard, { flexDirection: R }]} borderRadius={16}>
                <View style={[styles.methodIcon, { backgroundColor: colors.secondary }]}>
                  <Plus size={20} color={colors.mutedForeground} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.methodName, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{t.no_payout_methods}</Text>
                </View>
              </GlassView>
            </Pressable>
          )}
        </View>

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
                <View key={item.id} style={[styles.txItem, { flexDirection: R }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <View style={[styles.txIcon, { backgroundColor: colors.secondary }]}>
                    <ArrowUpRight size={16} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.txTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]} numberOfLines={1}>
                      {item.accountName ?? item.method}{item.maskedAccountNumber ? ` — ${item.maskedAccountNumber}` : ''}
                    </Text>
                    <Text style={[styles.txSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={1}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end', gap: Spacing.xs }}>
                    <Text style={[styles.txAmount, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                      {item.amount.toFixed(2)} {t.egp}
                    </Text>
                    <Text style={[styles.defaultBadge, { color: badge.color, fontFamily: 'Inter_700Bold' }]}>{badge.label}</Text>
                  </View>
                </View>
              );
            })}
          </GlassView>
        )}

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: Spacing.xl, marginBottom: Spacing.md, textAlign: TA }]}>{t.transactions_label}</Text>
        <GlassView borderRadius={16}>
          {txs.map((tx, i) => (
            <View key={tx.id} style={[styles.txItem, { flexDirection: R }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={[styles.txIcon, { backgroundColor: tx.incoming ? colors.primary + '26' : colors.secondary }]}>
                {tx.incoming
                  ? <ArrowDownLeft size={16} color={colors.primary} strokeWidth={2} />
                  : <ArrowUpRight size={16} color={colors.mutedForeground} strokeWidth={2} />
                }
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.txTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]} numberOfLines={1}>{tx.title}</Text>
                <Text style={[styles.txSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={1}>{tx.sub}</Text>
              </View>
              <Text style={[styles.txAmount, { color: tx.incoming ? colors.primary : colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {tx.incoming ? '+' : '−'}{tx.amount.toFixed(2)} {t.egp}
              </Text>
            </View>
          ))}
        </GlassView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  pageTitle: { fontSize: 24, marginTop: 2 },
  balanceCard: { borderRadius: Radius.xl, padding: 20, borderWidth: 1, overflow: 'hidden', elevation: Shadows.large.elevation, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 16 },
  balanceBlob: { position: 'absolute', top: -24, right: -24, width: 128, height: 128, borderRadius: 64 },
  availableLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  balanceRow: { alignItems: 'flex-end', gap: Spacing.sm, marginTop: Spacing.xs },
  balanceAmount: { fontSize: 48, lineHeight: 52 },
  balanceCurrency: { fontSize: 20, marginBottom: Spacing.xs },
  payoutInput: { marginTop: Spacing.lg, gap: 10 },
  payoutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  payoutTextInput: { flex: 1, fontSize: 20, height: 36 },
  actionRow: { gap: Spacing.sm, marginTop: 20 },
  primaryAction: { flex: 1, height: 48, borderRadius: Radius.lg, overflow: 'hidden', elevation: Shadows.large.elevation, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 8 },
  actionGrad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  secondaryAction: { height: 48, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  actionText: { fontSize: Typography.size.sm },
  sectionHeader: { alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xl, marginBottom: Spacing.md },
  sectionTitle: { fontSize: Typography.size.xs, letterSpacing: 2, textTransform: 'uppercase' },
  addBtn: { fontSize: Typography.size.xs },
  methodCard: { alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  methodIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  methodName: { fontSize: Typography.size.sm },
  methodSub: { fontSize: Typography.size.xs, marginTop: 2 },
  defaultBadge: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  trashBtn: { padding: 6 },
  txItem: { alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  txIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: Typography.size.sm },
  txSub: { fontSize: Typography.size.xs, marginTop: 2 },
  txAmount: { fontSize: Typography.size.sm },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: 40, elevation: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.2, shadowRadius: 16 },
  modalHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: Typography.size.md },
  fieldLabel: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 2 },
  typeRow: { gap: 6, marginBottom: Spacing.xs },
  typeChip: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs, borderRadius: 10, borderWidth: 1 },
  typeChipText: { fontSize: Typography.size.xs },
  submitBtn: { height: 48, borderRadius: Radius.lg, overflow: 'hidden', marginTop: 20, elevation: 6, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 },
  submitGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
