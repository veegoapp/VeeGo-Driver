import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDownLeft, ArrowUpRight, FileText, Wallet, Wrench, X, Zap, Building2, Phone, ShoppingBag, CreditCard } from 'lucide-react-native';
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
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';

// ── Types ─────────────────────────────────────────────────────────────────────

type WalletFeature = {
  isEnabled: boolean;
  displayMode: 'live' | 'coming_soon' | 'maintenance' | 'unavailable';
  unavailableMessage?: string | null;
};

type AccountField = {
  key: string;
  label: string;
  labelAr: string;
  type: 'text' | 'tel' | 'number' | 'email';
  required: boolean;
  placeholder?: string;
};

type PayoutMethod = {
  id: string;
  key: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  icon?: string;
  processingTime?: string;
  processingTimeAr?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  requiresAccountDetails: boolean;
  accountFields?: AccountField[];
  isAvailable: boolean;
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

// Maps icon string from backend to lucide component
function MethodIcon({ icon, color }: { icon?: string; color: string }) {
  const size = 20;
  const sw = 2;
  switch (icon) {
    case 'zap': return <Zap size={size} color={color} strokeWidth={sw} />;
    case 'phone': return <Phone size={size} color={color} strokeWidth={sw} />;
    case 'building': return <Building2 size={size} color={color} strokeWidth={sw} />;
    case 'shopping-bag': return <ShoppingBag size={size} color={color} strokeWidth={sw} />;
    default: return <CreditCard size={size} color={color} strokeWidth={sw} />;
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ShuttleWalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL, language } = useI18n();
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  // Payout modal state
  const [payoutVisible, setPayoutVisible] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<PayoutMethod | null>(null);
  const [accountDetails, setAccountDetails] = useState<Record<string, string>>({});
  const [isPayingOut, setIsPayingOut] = useState(false);
  const [payoutStep, setPayoutStep] = useState<'amount' | 'details'>('amount');

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
  const { data: payoutMethodsRaw, isLoading: methodsLoading } = useQuery({
    queryKey: ['payout-methods'],
    queryFn: endpoints.wallet.payoutMethods,
    enabled: walletLive,
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

  const _pmRaw = payoutMethodsRaw as PayoutMethod[] | { data?: PayoutMethod[] } | undefined;
  const payoutMethods: PayoutMethod[] = (
    Array.isArray(_pmRaw) ? _pmRaw : ((_pmRaw as { data?: PayoutMethod[] })?.data ?? [])
  ).filter(m => m.isAvailable);

  const isLoading = balanceLoading || txLoading || weeklyLoading || summaryLoading || methodsLoading;
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
  const openPayout = () => {
    setPayoutAmount(String(balanceData.balance.toFixed(2)));
    setSelectedMethod(payoutMethods[0] ?? null);
    setAccountDetails({});
    setPayoutStep('amount');
    setPayoutVisible(true);
  };

  const handlePayoutNext = () => {
    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0) {
      Alert.alert(t.invalid_amount_title, t.invalid_amount_msg);
      return;
    }
    if (!selectedMethod) {
      Alert.alert(t.select_method_title, t.select_method_msg);
      return;
    }
    if (selectedMethod.requiresAccountDetails) {
      setPayoutStep('details');
    } else {
      handlePayoutSubmit(amount, selectedMethod, {});
    }
  };

  const handlePayoutSubmit = async (amount: number, method: PayoutMethod, details: Record<string, string>) => {
    // Validate required fields
    if (method.requiresAccountDetails && method.accountFields) {
      for (const f of method.accountFields) {
        if (f.required && !details[f.key]?.trim()) {
          Alert.alert(t.required_field_title, `${isRTL ? f.labelAr : f.label} is required.`);
          return;
        }
      }
    }
    setIsPayingOut(true);
    try {
      const res = await endpoints.wallet.payout(amount, method.key) as { ok?: boolean; message?: string; error?: string; available?: number } | undefined;
      if (res && res.error) {
        const note = res.available != null ? ` (${t.available}: ${res.available.toFixed(2)} ${t.egp})` : '';
        Alert.alert(t.error, `${res.error}${note}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      setPayoutVisible(false);
      Alert.alert('✓', res?.message ?? `${amount.toFixed(2)} ${t.egp} payout submitted.`);
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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>
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
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: 24, marginBottom: 16, textAlign: TA }]}>
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
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>{t.no_data_yet}</Text>
              </View>
            )}
          </View>
        </GlassView>

        {/* Earnings summary */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: 24, marginBottom: 12, textAlign: TA }]}>{t.net_earnings}</Text>
        <GlassView borderRadius={16} style={{ padding: 4 }}>
          <SummaryRow label={t.status_confirmed} value={`+${parseFloat(String(summary?.summary?.totalConfirmed ?? 0)).toFixed(2)} ${t.egp}`} positive colors={colors} isRTL={isRTL} />
          <SummaryRow label={t.status_pending} value={`+${parseFloat(String(summary?.summary?.totalPending ?? 0)).toFixed(2)} ${t.egp}`} positive colors={colors} isRTL={isRTL} />
          <SummaryRow label={t.status_paid_out} value={`${parseFloat(String(summary?.summary?.totalPaid ?? 0)).toFixed(2)} ${t.egp}`} colors={colors} isRTL={isRTL} />
          <SummaryRow label={t.net_earnings} value={`${parseFloat(String(summary?.summary?.totalEarnings ?? 0)).toFixed(2)} ${t.egp}`} highlight colors={colors} isRTL={isRTL} last />
        </GlassView>

        {/* Transactions */}
        <Text
          onLayout={(e: LayoutChangeEvent) => setTxSectionY(e.nativeEvent.layout.y)}
          style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: 24, marginBottom: 12, textAlign: TA }]}
        >
          {t.transactions_label}
        </Text>
        <GlassView borderRadius={16}>
          {txs.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
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
                {payoutStep === 'amount' ? t.cash_out : (isRTL ? selectedMethod?.nameAr : selectedMethod?.name) ?? t.cash_out}
              </Text>
              <Pressable onPress={() => {
                if (payoutStep === 'details') { setPayoutStep('amount'); } else { setPayoutVisible(false); }
              }} hitSlop={8}>
                <X size={20} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
            </View>

            {payoutStep === 'amount' ? (
              <>
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
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>{t.egp}</Text>
                </View>
                <Text style={[{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginBottom: 16, textAlign: TA }]}>
                  {t.available}: {balanceData.balance.toFixed(2)} {t.egp}
                </Text>

                {/* Method selector */}
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.payout_methods}</Text>
                {methodsLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
                ) : payoutMethods.length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 16 }}>
                    {t.no_payout_methods_avail}
                  </Text>
                ) : (
                  <View style={{ gap: 8, marginBottom: 16 }}>
                    {payoutMethods.map(m => {
                      const isSelected = selectedMethod?.id === m.id;
                      const label = isRTL ? (m.nameAr ?? m.name) : m.name;
                      const timing = isRTL ? (m.processingTimeAr ?? m.processingTime) : m.processingTime;
                      return (
                        <Pressable
                          key={m.id}
                          onPress={() => setSelectedMethod(m)}
                          style={[styles.methodOption, {
                            backgroundColor: isSelected ? '#1e1e2812' : colors.secondary,
                            borderColor: isSelected ? '#1e1e2866' : colors.border,
                            flexDirection: R,
                          }]}
                        >
                          <View style={[styles.methodOptionIcon, { backgroundColor: isSelected ? '#1e1e2820' : colors.background }]}>
                            <MethodIcon icon={m.icon} color={isSelected ? '#2d2d42' : colors.mutedForeground} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[{ fontSize: 14, color: isSelected ? '#1e1e28' : colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{label}</Text>
                            {timing && <Text style={[{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{timing}</Text>}
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
                  onPress={handlePayoutNext}
                  style={({ pressed }) => [styles.submitBtn, { opacity: pressed ? 0.85 : 1 }]}
                >
                  <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                    <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }}>
                      {selectedMethod?.requiresAccountDetails ? t.payout_next_btn : t.confirm}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </>
            ) : (
              <>
                {/* Dynamic account details form */}
                {selectedMethod?.accountFields?.map(field => (
                  <View key={field.key}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                      {isRTL ? field.labelAr : field.label}{field.required ? ' *' : ''}
                    </Text>
                    <TextInput
                      value={accountDetails[field.key] ?? ''}
                      onChangeText={v => setAccountDetails(prev => ({ ...prev, [field.key]: v }))}
                      keyboardType={field.type === 'tel' || field.type === 'number' ? 'phone-pad' : field.type === 'email' ? 'email-address' : 'default'}
                      placeholder={field.placeholder ?? ''}
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular', textAlign: TA }]}
                    />
                  </View>
                ))}

                <Pressable
                  onPress={() => {
                    const amount = parseFloat(payoutAmount);
                    if (selectedMethod) handlePayoutSubmit(amount, selectedMethod, accountDetails);
                  }}
                  disabled={isPayingOut}
                  style={({ pressed }) => [styles.submitBtn, { opacity: pressed || isPayingOut ? 0.8 : 1, marginTop: 20 }]}
                >
                  <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                    {isPayingOut
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }}>{t.confirm}</Text>
                    }
                  </LinearGradient>
                </Pressable>
              </>
            )}
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
  comingSoonIcon: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  comingSoonTitle: { fontSize: 22 },
  comingSoonBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  comingSoonBadgeText: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  comingSoonSub: { fontSize: 14, lineHeight: 22 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  pageTitle: { fontSize: 24, marginTop: 2 },
  balanceCard: { borderRadius: 24, padding: 20, borderWidth: 1, overflow: 'hidden', elevation: 8, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
  balanceBlob: { position: 'absolute', top: -24, right: -24, width: 128, height: 128, borderRadius: 64 },
  availableLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  balanceAmount: { fontSize: 48, lineHeight: 52 },
  balanceCurrency: { fontSize: 20, marginBottom: 4 },
  earningsMini: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  earningsMiniItem: { flex: 1, alignItems: 'center' },
  earningsMiniDiv: { width: 1, height: 28 },
  earningsMiniLabel: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  earningsMiniValue: { fontSize: 13, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 20 },
  primaryAction: { flex: 1, height: 48, borderRadius: 16, overflow: 'hidden', elevation: 6, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 },
  actionGrad: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryAction: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontSize: 14 },
  chartCard: { padding: 16 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 100 },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barTrack: { flex: 1, width: '100%', borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: 'rgba(255,255,255,0.04)' },
  barFill: { width: '100%', borderRadius: 6, overflow: 'hidden' },
  barDay: { fontSize: 9, letterSpacing: 0.5 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13 },
  sectionTitle: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  txItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 14 },
  txSub: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 14 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, elevation: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.2, shadowRadius: 16 },
  modalHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 16 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6 },
  amountInput: { flex: 1, fontSize: 24, height: 36 },
  fieldLabel: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 2 },
  methodOption: { padding: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 10 },
  methodOptionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  submitBtn: { height: 48, borderRadius: 16, overflow: 'hidden', elevation: 6, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 },
  submitGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
