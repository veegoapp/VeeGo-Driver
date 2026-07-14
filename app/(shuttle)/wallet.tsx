import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDownLeft, ArrowUpRight, FileText, Wallet, Wrench, X, Zap, Phone, CreditCard } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, KeyboardAvoidingView,
  LayoutChangeEvent, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { useSocket } from '@/lib/socketContext';
import { payoutStatusBadge, type PayoutAccount, type PayoutHistoryItem } from '@/lib/walletHelpers';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';

// ── Types ─────────────────────────────────────────────────────────────────────

type WalletFeature = {
  isEnabled: boolean;
  displayMode: 'live' | 'coming_soon' | 'maintenance' | 'unavailable';
  unavailableMessage?: string | null;
};

type WalletBalance = { balance: number; totalPaid?: number; totalPending?: number };
type WeekDay = { day: string; amount: string | number };
type EarningsSummary = {
  summary: { totalEarnings: string; totalPaid: string; totalPending: string; totalConfirmed: string };
  recentEarnings: { amount: string }[];
};
type Transaction = {
  id: string | number;
  amount: number;
  status?: string;
  date?: string;
  title?: string;
  sub?: string;
  incoming?: boolean;
  description?: string;
};

const TAB_BAR_HEIGHT = 96;

// Maps a payout account's methodKey to a lucide icon. Falls back to a
// generic card icon for any future method key (e.g. bank accounts).
function MethodIcon({ methodKey, color }: { methodKey: string; color: string }) {
  const size = 20;
  const sw = 2;
  switch (methodKey) {
    case 'vodafone_cash': return <Phone size={size} color={color} strokeWidth={sw} />;
    case 'instapay': return <Zap size={size} color={color} strokeWidth={sw} />;
    default: return <CreditCard size={size} color={color} strokeWidth={sw} />;
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ShuttleWalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL, language } = useI18n();
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  // Payout modal state
  const [payoutVisible, setPayoutVisible] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<PayoutAccount | null>(null);
  const [isPayingOut, setIsPayingOut] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const [txSectionY, setTxSectionY] = useState(0);

  // ── Wallet feature flag ────────────────────────────────────────────────────
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

  // ── Queries (only when wallet is live) ────────────────────────────────────
  const { data: balanceRaw, isLoading: balanceLoading, isError: balanceError } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: endpoints.wallet.balance,
    enabled: walletLive,
  });
  const { data: txRaw, isLoading: txLoading, isError: txError } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: () => endpoints.wallet.transactions(1, 20),
    enabled: walletLive,
  });
  const { data: weeklyRaw, isLoading: weeklyLoading } = useQuery({
    queryKey: ['earnings-weekly'],
    queryFn: () => endpoints.earnings.weekly(),
    enabled: walletLive,
  });
  const { data: summaryRaw, isLoading: summaryLoading } = useQuery({
    queryKey: ['earnings-summary'],
    queryFn: () => endpoints.earnings.summary(),
    enabled: walletLive,
  });
  const { data: payoutAccountsRaw, isLoading: accountsLoading } = useQuery({
    queryKey: ['payout-accounts'],
    queryFn: endpoints.wallet.getPayoutAccounts,
    enabled: walletLive,
  });
  const { data: payoutHistoryRaw, isLoading: historyLoading, isError: historyError } = useQuery({
    queryKey: ['payout-history'],
    queryFn: endpoints.wallet.getPayoutHistory,
    enabled: walletLive,
    retry: false,
  });

  // ── Data extraction ────────────────────────────────────────────────────────
  const _balRaw = balanceRaw as WalletBalance | { wallet?: { balance?: number } } | undefined;
  const balanceData: WalletBalance = {
    balance: parseFloat(String(
      ((_balRaw as WalletBalance)?.balance) ??
      ((_balRaw as { wallet?: { balance?: number } })?.wallet?.balance) ?? 0
    )),
    totalPaid: parseFloat(String((_balRaw as WalletBalance)?.totalPaid ?? 0)),
    totalPending: parseFloat(String((_balRaw as WalletBalance)?.totalPending ?? 0)),
  };

  const _txRaw = txRaw as Transaction[] | { data?: Transaction[] } | undefined;
  const txs: Transaction[] = Array.isArray(_txRaw) ? _txRaw : ((_txRaw as { data?: Transaction[] })?.data ?? []);

  const weekEarnings: WeekDay[] = ((weeklyRaw as { weeklyBreakdown?: WeekDay[] } | undefined)?.weeklyBreakdown ?? []);
  const maxEarning = weekEarnings.length ? Math.max(...weekEarnings.map(d => parseFloat(String(d.amount)))) : 1;
  const summary = summaryRaw as EarningsSummary | undefined;
  const weekTotal = weekEarnings.reduce((s, d) => s + parseFloat(String(d.amount)), 0);
  const todayAmount = parseFloat(String(summary?.recentEarnings?.[0]?.amount ?? 0));

  const _paRaw = payoutAccountsRaw as PayoutAccount[] | { data?: PayoutAccount[] } | undefined;
  const payoutAccounts: PayoutAccount[] = (
    Array.isArray(_paRaw) ? _paRaw : ((_paRaw as { data?: PayoutAccount[] })?.data ?? [])
  ).filter(a => a.isActive);

  const _phRaw = payoutHistoryRaw as PayoutHistoryItem[] | { data?: PayoutHistoryItem[] } | undefined;
  const payoutHistory: PayoutHistoryItem[] = Array.isArray(_phRaw) ? _phRaw : ((_phRaw as { data?: PayoutHistoryItem[] })?.data ?? []);

  const isLoading = balanceLoading || txLoading || weeklyLoading || summaryLoading || accountsLoading;
  const isError = balanceError || txError;

  // ── Animations ─────────────────────────────────────────────────────────────
  const heroAnim = useRef(new Animated.Value(0)).current;
  const barAnims = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (balanceLoading || weeklyLoading) return;
    Animated.parallel([
      Animated.spring(heroAnim, { toValue: 1, stiffness: 200, damping: 20, useNativeDriver: true }),
      Animated.stagger(60, weekEarnings.slice(0, 7).map((d, i) =>
        Animated.timing(barAnims[i], {
          toValue: maxEarning > 0 ? parseFloat(String(d.amount)) / maxEarning : 0,
          duration: 400,
          useNativeDriver: false,
        })
      )),
    ]).start();
  }, [balanceLoading, weeklyLoading, weekEarnings.length]);

  // ── Payout flow ────────────────────────────────────────────────────────────
  // Accounts are created upfront in Profile > Payment Information, so the
  // payout modal only needs an amount + a saved account — no per-payout
  // account-detail entry step anymore.
  const openPayout = () => {
    setPayoutAmount(String(balanceData.balance.toFixed(2)));
    setSelectedAccount(payoutAccounts.find(a => a.isDefault) ?? payoutAccounts[0] ?? null);
    setPayoutVisible(true);
  };

  const handlePayoutSubmit = async () => {
    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0) {
      Alert.alert(t.invalid_amount_title, t.invalid_amount_msg);
      return;
    }
    if (!selectedAccount) {
      Alert.alert(t.select_method_title, t.select_method_msg);
      return;
    }
    setIsPayingOut(true);
    try {
      const res = await endpoints.wallet.payout(amount, selectedAccount.id) as { ok?: boolean; message?: string; error?: string; available?: number } | undefined;
      if (res && res.error) {
        const note = res.available != null ? ` (${t.available}: ${res.available.toFixed(2)} ${t.egp})` : '';
        Alert.alert(t.error, `${res.error}${note}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      setPayoutVisible(false);
      // Payout request is pending admin confirmation — not yet paid.
      Alert.alert('✓', res?.message ?? t.payout_pending_msg);
    } catch {
      Alert.alert(t.error, t.payout_failed_msg);
    } finally {
      setIsPayingOut(false);
    }
  };

  // ── Not-live screen ────────────────────────────────────────────────────────
  if (!walletLive) {
    const isMaintenance = walletFeature.displayMode === 'maintenance';
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xxl, gap: Spacing.lg }}>
          <View style={[styles.comingSoonIcon, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            {isMaintenance
              ? <Wrench size={36} color={colors.mutedForeground} strokeWidth={1.5} />
              : <Wallet size={36} color={colors.mutedForeground} strokeWidth={1.5} />
            }
          </View>
          <Text style={[styles.comingSoonTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>
            {t.wallet_title}
          </Text>
          <View style={[styles.comingSoonBadge, { backgroundColor: '#1e1e2812', borderColor: '#1e1e2830' }]}>
            <Text style={[styles.comingSoonBadgeText, { color: '#2d2d42', fontFamily: 'Inter_700Bold' }]}>
              {isMaintenance ? t.under_maintenance : t.coming_soon_badge}
            </Text>
          </View>
          <Text style={[styles.comingSoonSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
            {walletFeature.unavailableMessage ?? (isMaintenance ? t.maintenance_wallet_msg : t.coming_soon_wallet_msg)}
          </Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <AppLoader />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: Typography.size.sm }}>
          {t.wallet_load_err}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: TAB_BAR_HEIGHT + 24, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.wallet_title}</Text>
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.shuttle_service} · {t.earnings}</Text>

        {/* Balance card */}
        <Animated.View style={[{ marginTop: 20, opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <View style={[styles.balanceCard, { backgroundColor: colors.secondary, borderColor: '#1e1e2833' }]}>
            <View style={[styles.balanceBlob, { backgroundColor: '#1e1e2820' }]} />
            <Text style={[styles.availableLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.available}</Text>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceAmount, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{balanceData.balance.toFixed(2)}</Text>
              <Text style={[styles.balanceCurrency, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.egp}</Text>
            </View>
            <View style={styles.earningsMini}>
              <View style={styles.earningsMiniItem}>
                <Text style={[styles.earningsMiniLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.today}</Text>
                <Text style={[styles.earningsMiniValue, { color: '#2d2d42', fontFamily: 'Inter_700Bold' }]}>+{todayAmount.toFixed(2)} {t.egp}</Text>
              </View>
              <View style={[styles.earningsMiniDiv, { backgroundColor: colors.border }]} />
              <View style={styles.earningsMiniItem}>
                <Text style={[styles.earningsMiniLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.this_week}</Text>
                <Text style={[styles.earningsMiniValue, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>+{weekTotal.toFixed(2)} {t.egp}</Text>
              </View>
              <View style={[styles.earningsMiniDiv, { backgroundColor: colors.border }]} />
              <View style={styles.earningsMiniItem}>
                <Text style={[styles.earningsMiniLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.routes}</Text>
                <Text style={[styles.earningsMiniValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{weekEarnings.length} {t.days_label}</Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              <Pressable onPress={openPayout} style={({ pressed }) => [styles.primaryAction, { opacity: pressed ? 0.9 : 1 }]}>
                <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionGrad}>
                  <ArrowDownLeft size={16} color="#fff" strokeWidth={2} />
                  <Text style={[styles.actionText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{t.cash_out}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={() => scrollRef.current?.scrollTo({ y: txSectionY, animated: true })} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.9 : 1 }]}>
                <GlassView strong style={styles.secondaryAction} borderRadius={16}>
                  <FileText size={16} color={colors.foreground} strokeWidth={2} />
                  <Text style={[styles.actionText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.history}</Text>
                </GlassView>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* Weekly chart */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: Spacing.xl, marginBottom: Spacing.lg, textAlign: TA }]}>
          {t.this_week}
        </Text>
        <GlassView strong style={styles.chartCard} borderRadius={20}>
          <View style={styles.chartBars}>
            {weekEarnings.length > 0 ? weekEarnings.slice(0, 7).map((d, i) => (
              <View key={`${d.day}-${i}`} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <Animated.View style={[styles.barFill, {
                    height: barAnims[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                    backgroundColor: i === weekEarnings.length - 1 ? '#1e1e28' : colors.secondary,
                  }]}>
                    {i === weekEarnings.length - 1 && (
                      <LinearGradient colors={['#2d2d42', '#1e1e28']} style={StyleSheet.absoluteFill} />
                    )}
                  </Animated.View>
                </View>
                <Text style={[styles.barDay, { color: i === weekEarnings.length - 1 ? '#2d2d42' : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                  {String(d.day)}
                </Text>
              </View>
            )) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: Typography.size.xs }}>{t.no_data_yet}</Text>
              </View>
            )}
          </View>
        </GlassView>

        {/* Earnings summary */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: Spacing.xl, marginBottom: Spacing.md, textAlign: TA }]}>{t.net_earnings}</Text>
        <GlassView borderRadius={16} style={{ padding: Spacing.xs }}>
          <SummaryRow label={t.status_confirmed} value={`+${parseFloat(String(summary?.summary?.totalConfirmed ?? 0)).toFixed(2)} ${t.egp}`} positive colors={colors} isRTL={isRTL} />
          <SummaryRow label={t.status_pending} value={`+${parseFloat(String(summary?.summary?.totalPending ?? 0)).toFixed(2)} ${t.egp}`} positive colors={colors} isRTL={isRTL} />
          <SummaryRow label={t.status_paid_out} value={`${parseFloat(String(summary?.summary?.totalPaid ?? 0)).toFixed(2)} ${t.egp}`} colors={colors} isRTL={isRTL} />
          <SummaryRow label={t.net_earnings} value={`${parseFloat(String(summary?.summary?.totalEarnings ?? 0)).toFixed(2)} ${t.egp}`} highlight colors={colors} isRTL={isRTL} last />
        </GlassView>

        {/* Payout history */}
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
                <View key={item.id} style={[styles.txItem, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <View style={[styles.txIcon, { backgroundColor: colors.secondary }]}>
                    <ArrowUpRight size={16} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.txTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                      {item.accountName ?? item.method}{item.maskedAccountNumber ? ` — ${item.maskedAccountNumber}` : ''}
                    </Text>
                    <Text style={[styles.txSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: Spacing.xs }}>
                    <Text style={[styles.txAmount, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                      {item.amount.toFixed(2)} {t.egp}
                    </Text>
                    <Text style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: badge.color, fontFamily: 'Inter_700Bold' }}>{badge.label}</Text>
                  </View>
                </View>
              );
            })}
          </GlassView>
        )}

        {/* Transactions */}
        <Text
          onLayout={(e: LayoutChangeEvent) => setTxSectionY(e.nativeEvent.layout.y)}
          style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: Spacing.xl, marginBottom: Spacing.md, textAlign: TA }]}
        >
          {t.transactions_label}
        </Text>
        <GlassView borderRadius={16}>
          {txs.length === 0 ? (
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{t.no_transactions_yet}</Text>
            </View>
          ) : txs.map((tx, i) => {
            const isIncoming = tx.incoming ?? (tx.status === 'confirmed');
            const txAmount = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount));
            const txTitle = tx.title ?? (isIncoming ? t.trip_earnings_label : t.cash_out);
            const txSub = tx.sub ?? tx.description ?? tx.date ?? '';
            return (
              <View key={String(tx.id)} style={[styles.txItem, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={[styles.txIcon, { backgroundColor: isIncoming ? '#1e1e2820' : colors.secondary }]}>
                  {isIncoming
                    ? <ArrowDownLeft size={16} color="#2d2d42" strokeWidth={2} />
                    : <ArrowUpRight size={16} color={colors.mutedForeground} strokeWidth={2} />
                  }
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.txTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{txTitle}</Text>
                  <Text style={[styles.txSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{txSub}</Text>
                </View>
                <Text style={[styles.txAmount, { color: isIncoming ? '#2d2d42' : colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                  {isIncoming ? '+' : '−'}{txAmount.toFixed(2)} {t.egp}
                </Text>
              </View>
            );
          })}
        </GlassView>
      </ScrollView>

      {/* ── Payout modal ── */}
      <Modal
        visible={payoutVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPayoutVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPayoutVisible(false)} />
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { flexDirection: R }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                {t.cash_out}
              </Text>
              <Pressable onPress={() => setPayoutVisible(false)} hitSlop={8}>
                <X size={20} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
            </View>

            {/* Amount input */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.amount_label}</Text>
            <View style={[styles.amountRow, { borderColor: colors.border }]}>
              <TextInput
                value={payoutAmount}
                onChangeText={setPayoutAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.amountInput, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}
                autoFocus
              />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: Typography.size.sm }}>{t.egp}</Text>
            </View>
            <Text style={[{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginBottom: Spacing.lg, textAlign: TA }]}>
              {t.available}: {balanceData.balance.toFixed(2)} {t.egp}
            </Text>

            {/* Payout account selector */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.payout_methods}</Text>
            {accountsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: Spacing.md }} />
            ) : payoutAccounts.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: Spacing.lg }}>
                {t.no_payout_methods_avail}
              </Text>
            ) : (
              <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
                {payoutAccounts.map(a => {
                  const isSelected = selectedAccount?.id === a.id;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => setSelectedAccount(a)}
                      style={[styles.methodOption, {
                        backgroundColor: isSelected ? '#1e1e2812' : colors.secondary,
                        borderColor: isSelected ? '#1e1e2866' : colors.border,
                        flexDirection: R,
                      }]}
                    >
                      <View style={[styles.methodOptionIcon, { backgroundColor: isSelected ? '#1e1e2820' : colors.background }]}>
                        <MethodIcon methodKey={a.methodKey} color={isSelected ? '#2d2d42' : colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[{ fontSize: Typography.size.sm, color: isSelected ? '#1e1e28' : colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{a.accountName}</Text>
                        <Text style={[{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{a.accountNumber}</Text>
                      </View>
                      <View style={[styles.radioOuter, { borderColor: isSelected ? '#1e1e28' : colors.border }]}>
                        {isSelected && <View style={[styles.radioInner, { backgroundColor: '#1e1e28' }]} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Pressable
              onPress={handlePayoutSubmit}
              disabled={isPayingOut || payoutAccounts.length === 0}
              style={({ pressed }) => [styles.submitBtn, { opacity: pressed || isPayingOut || payoutAccounts.length === 0 ? 0.6 : 1 }]}
            >
              <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                {isPayingOut
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: Typography.size.sm }}>{t.confirm}</Text>
                }
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryRow({ label, value, positive, highlight, last, colors, isRTL }: {
  label: string; value: string; positive?: boolean; highlight?: boolean; last?: boolean;
  colors: ReturnType<typeof useColors>; isRTL: boolean;
}) {
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  return (
    <View style={[styles.summaryRow, { flexDirection: R }, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{label}</Text>
      <Text style={[styles.summaryValue, {
        color: highlight ? '#2d2d42' : positive ? colors.primary : colors.foreground,
        fontFamily: 'Inter_700Bold',
      }]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  comingSoonIcon: { width: 88, height: 88, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  comingSoonTitle: { fontSize: Typography.size.xl },
  comingSoonBadge: { paddingHorizontal: Spacing.lg, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  comingSoonBadgeText: { fontSize: Typography.size.xs, letterSpacing: 1.5, textTransform: 'uppercase' },
  comingSoonSub: { fontSize: Typography.size.sm, lineHeight: 22 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  pageTitle: { fontSize: 24, marginTop: 2 },
  balanceCard: { borderRadius: Radius.xl, padding: 20, borderWidth: 1, overflow: 'hidden', elevation: Shadows.large.elevation, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
  balanceBlob: { position: 'absolute', top: -24, right: -24, width: 128, height: 128, borderRadius: 64 },
  availableLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, marginTop: Spacing.xs },
  balanceAmount: { fontSize: 48, lineHeight: 52 },
  balanceCurrency: { fontSize: 20, marginBottom: Spacing.xs },
  earningsMini: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.lg, paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  earningsMiniItem: { flex: 1, alignItems: 'center' },
  earningsMiniDiv: { width: 1, height: 28 },
  earningsMiniLabel: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  earningsMiniValue: { fontSize: 13, marginTop: Spacing.xs },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 20 },
  primaryAction: { flex: 1, height: 48, borderRadius: Radius.lg, overflow: 'hidden', elevation: 6, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 },
  actionGrad: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  secondaryAction: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  actionText: { fontSize: Typography.size.sm },
  chartCard: { padding: Spacing.lg },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 100 },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barTrack: { flex: 1, width: '100%', borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: 'rgba(255,255,255,0.04)' },
  barFill: { width: '100%', borderRadius: 6, overflow: 'hidden' },
  barDay: { fontSize: 9, letterSpacing: 0.5 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13 },
  sectionTitle: { fontSize: Typography.size.xs, letterSpacing: 2, textTransform: 'uppercase' },
  txItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  txIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: Typography.size.sm },
  txSub: { fontSize: Typography.size.xs, marginTop: 2 },
  txAmount: { fontSize: Typography.size.sm },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: 40, elevation: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.2, shadowRadius: 16 },
  modalHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: Typography.size.md },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6 },
  amountInput: { flex: 1, fontSize: 24, height: 36 },
  fieldLabel: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 2 },
  methodOption: { padding: Spacing.md, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 10 },
  methodOptionIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  submitBtn: { height: 48, borderRadius: Radius.lg, overflow: 'hidden', elevation: 6, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 },
  submitGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
