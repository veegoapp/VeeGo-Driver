import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDownLeft, ArrowUpRight, Briefcase, FileText, Plus, Trash2, Wallet, X } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, LayoutChangeEvent, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints, api } from '@/lib/api';
import type { ServiceControl } from '@/lib/serviceControlContext';

type WalletBalance = { balance: number };
type Transaction = { id: string; title: string; sub: string; amount: number; incoming: boolean };
type WeekDay = { day: string; amount: string | number };
type EarningsSummary = {
  summary: {
    totalEarnings: string;
    totalPaid: string;
    totalPending: string;
    totalConfirmed: string;
  };
  recentEarnings: { amount: string }[];
};
type PayoutMethod = { id: string; name?: string; last4?: string; bankName?: string; type?: string; isDefault?: boolean; accountNumber?: string; accountName?: string; phoneNumber?: string };
type MethodType = 'bank_transfer' | 'vodafone_cash' | 'instapay';

const TAB_BAR_HEIGHT = 96;

export default function ShuttleWalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  const queryClient = useQueryClient();

  const [payoutVisible, setPayoutVisible] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [isPayingOut, setIsPayingOut] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [txSectionY, setTxSectionY] = useState(0);

  const [addMethodVisible, setAddMethodVisible] = useState(false);
  const [methodType, setMethodType] = useState<MethodType>('bank_transfer');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isAddingMethod, setIsAddingMethod] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleHistoryPress = () => {
    scrollRef.current?.scrollTo({ y: txSectionY, animated: true });
  };

  const { data: serviceControlRaw } = useQuery({
    queryKey: ['services-control'],
    queryFn: () => api.get<unknown>('/services/control'),
    staleTime: 60_000,
  });

  const walletControl: ServiceControl | undefined = (() => {
    const raw = serviceControlRaw as { services?: ServiceControl[]; data?: ServiceControl[]; serviceControls?: ServiceControl[] } | ServiceControl[] | undefined;
    const list: ServiceControl[] = Array.isArray(raw) ? raw : (raw?.services ?? raw?.data ?? raw?.serviceControls ?? []);
    return list.find(s => s.serviceType.toLowerCase() === 'wallet');
  })();

  const walletComingSoon = walletControl
    ? (!walletControl.isEnabled || walletControl.displayMode === 'coming_soon')
    : false;

  const { data: balanceRaw, isLoading: balanceLoading, isError: balanceError } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: endpoints.wallet.balance,
    enabled: !walletComingSoon,
  });
  const { data: txRaw, isLoading: txLoading, isError: txError } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: endpoints.wallet.transactions,
    enabled: !walletComingSoon,
  });
  const { data: weeklyRaw, isLoading: weeklyLoading } = useQuery({
    queryKey: ['earnings-weekly'],
    queryFn: () => endpoints.earnings.weekly(),
    enabled: !walletComingSoon,
  });
  const { data: summaryRaw, isLoading: summaryLoading } = useQuery({
    queryKey: ['earnings-summary'],
    queryFn: () => endpoints.earnings.summary(),
    enabled: !walletComingSoon,
  });
  const { data: payoutMethodsRaw, isLoading: methodsLoading } = useQuery({
    queryKey: ['payout-methods'],
    queryFn: endpoints.wallet.payoutMethods,
    enabled: !walletComingSoon,
  });

  const _balRaw = balanceRaw as WalletBalance | { balance?: number; wallet?: { balance?: number } } | undefined;
  const balanceData: WalletBalance = {
    balance: (typeof (_balRaw as WalletBalance)?.balance === 'number'
      ? (_balRaw as WalletBalance).balance
      : parseFloat(String((_balRaw as { wallet?: { balance?: number } })?.wallet?.balance ?? (_balRaw as { balance?: unknown })?.balance ?? 0))),
  };
  const _txRaw = txRaw as Transaction[] | { transactions?: Transaction[]; data?: Transaction[] } | undefined;
  const txs: Transaction[] = Array.isArray(_txRaw) ? _txRaw : ((_txRaw as { transactions?: Transaction[] })?.transactions ?? ((_txRaw as { data?: Transaction[] })?.data ?? []));

  const weekEarnings: WeekDay[] = ((weeklyRaw as { weeklyBreakdown?: WeekDay[] } | undefined)?.weeklyBreakdown ?? []);
  const maxEarning = weekEarnings.length ? Math.max(...weekEarnings.map(d => parseFloat(String(d.amount)))) : 1;
  const summary = summaryRaw as EarningsSummary | undefined;
  const weekTotal = weekEarnings.reduce((s, d) => s + parseFloat(String(d.amount)), 0);
  const todayAmount = parseFloat(String(summary?.recentEarnings?.[0]?.amount ?? 0));

  const payoutMethods: PayoutMethod[] = Array.isArray(payoutMethodsRaw)
    ? (payoutMethodsRaw as PayoutMethod[])
    : ((payoutMethodsRaw as { data?: PayoutMethod[]; methods?: PayoutMethod[] })?.data
      ?? (payoutMethodsRaw as { methods?: PayoutMethod[] })?.methods
      ?? []);

  const isLoading = balanceLoading || txLoading || weeklyLoading || summaryLoading || methodsLoading;
  const isError = balanceError || txError;

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

  const handlePayoutOpen = () => {
    setPayoutAmount(String(balanceData?.balance ?? ''));
    setPayoutVisible(true);
  };

  const handlePayoutConfirm = async () => {
    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount greater than 0.');
      return;
    }
    setIsPayingOut(true);
    try {
      await endpoints.wallet.payout(amount);
      await queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      setPayoutVisible(false);
      setPayoutAmount('');
      Alert.alert('Success', `${amount.toFixed(2)} ${t.egp} payout initiated.`);
    } catch {
      Alert.alert('Error', 'Payout failed. Please try again.');
    } finally {
      setIsPayingOut(false);
    }
  };

  const resetAddForm = () => {
    setMethodType('bank_transfer');
    setAccountNumber('');
    setAccountName('');
    setBankName('');
    setPhoneNumber('');
  };

  const handleAddMethod = async () => {
    if (!accountNumber.trim() || !accountName.trim()) return;
    if (methodType === 'bank_transfer' && !bankName.trim()) return;
    if ((methodType === 'vodafone_cash' || methodType === 'instapay') && !phoneNumber.trim()) return;
    setIsAddingMethod(true);
    try {
      await endpoints.wallet.addPayoutMethod({
        type: methodType,
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
        ...(methodType === 'bank_transfer' ? { bankName: bankName.trim() } : {}),
        ...(methodType !== 'bank_transfer' ? { phoneNumber: phoneNumber.trim() } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['payout-methods'] });
      setAddMethodVisible(false);
      resetAddForm();
    } catch {
      Alert.alert(t.error, t.add_method_error);
    } finally {
      setIsAddingMethod(false);
    }
  };

  const handleRemoveMethod = (id: string, displayName: string) => {
    Alert.alert(t.remove_method_confirm, displayName, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.remove_method,
        style: 'destructive',
        onPress: async () => {
          setRemovingId(id);
          try {
            await endpoints.wallet.removePayoutMethod(id);
            await queryClient.invalidateQueries({ queryKey: ['payout-methods'] });
          } catch {
            Alert.alert(t.error, t.remove_method_error);
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  };

  if (walletComingSoon) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
          <View style={[styles.comingSoonIcon, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Wallet size={36} color={colors.mutedForeground} strokeWidth={1.5} />
          </View>
          <Text style={[styles.comingSoonTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>
            {t.wallet_title}
          </Text>
          <View style={[styles.comingSoonBadge, { backgroundColor: '#1e1e2812', borderColor: '#1e1e2830' }]}>
            <Text style={[styles.comingSoonBadgeText, { color: '#2d2d42', fontFamily: 'Inter_700Bold' }]}>
              Coming Soon
            </Text>
          </View>
          <Text style={[styles.comingSoonSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
            {walletControl?.message ?? 'Digital wallet & payout features are coming in a future update.'}
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
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>Failed to load wallet. Please try again.</Text>
      </View>
    );
  }

  const METHOD_TYPES: { key: MethodType; label: string }[] = [
    { key: 'bank_transfer', label: t.bank_transfer },
    { key: 'vodafone_cash', label: t.vodafone_cash },
    { key: 'instapay', label: t.instapay },
  ];

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

        <Animated.View style={[{ marginTop: 20, opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <View style={[styles.balanceCard, { backgroundColor: colors.secondary, borderColor: '#1e1e2833' }]}>
            <View style={[styles.balanceBlob, { backgroundColor: '#1e1e2820' }]} />
            <Text style={[styles.availableLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.available}</Text>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceAmount, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{(balanceData?.balance ?? 0).toFixed(2)}</Text>
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
                <Text style={[styles.earningsMiniValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{weekEarnings.length} days</Text>
              </View>
            </View>

            {payoutVisible ? (
              <View style={styles.payoutInput}>
                <View style={[styles.payoutRow, { borderColor: colors.border }]}>
                  <TextInput
                    value={payoutAmount}
                    onChangeText={setPayoutAmount}
                    keyboardType="decimal-pad"
                    placeholder="Amount"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.payoutTextInput, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}
                    autoFocus
                  />
                  <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>{t.egp}</Text>
                </View>
                <View style={styles.actionRow}>
                  <Pressable onPress={() => setPayoutVisible(false)} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.8 : 1 }]}>
                    <GlassView strong style={styles.secondaryAction} borderRadius={16}>
                      <X size={16} color={colors.foreground} strokeWidth={2} />
                      <Text style={[styles.actionText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Cancel</Text>
                    </GlassView>
                  </Pressable>
                  <Pressable onPress={handlePayoutConfirm} disabled={isPayingOut} style={({ pressed }) => [styles.primaryAction, { opacity: pressed || isPayingOut ? 0.8 : 1 }]}>
                    <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionGrad}>
                      {isPayingOut
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <ArrowDownLeft size={16} color="#fff" strokeWidth={2} />
                      }
                      <Text style={[styles.actionText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>Confirm</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.actionRow}>
                <Pressable onPress={handlePayoutOpen} style={({ pressed }) => [styles.primaryAction, { opacity: pressed ? 0.9 : 1 }]}>
                  <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionGrad}>
                    <ArrowDownLeft size={16} color="#fff" strokeWidth={2} />
                    <Text style={[styles.actionText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{t.cash_out}</Text>
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={handleHistoryPress} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.9 : 1 }]}>
                  <GlassView strong style={styles.secondaryAction} borderRadius={16}>
                    <FileText size={16} color={colors.foreground} strokeWidth={2} />
                    <Text style={[styles.actionText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.history}</Text>
                  </GlassView>
                </Pressable>
              </View>
            )}
          </View>
        </Animated.View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: 24, marginBottom: 16, textAlign: TA }]}>
          {t.this_week}
        </Text>
        <GlassView strong style={styles.chartCard} borderRadius={20}>
          <View style={styles.chartBars}>
            {weekEarnings.length > 0 ? weekEarnings.slice(0, 7).map((d, i) => (
              <View key={`${d.day}-${i}`} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <Animated.View style={[styles.barFill, {
                    height: barAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                    backgroundColor: i === weekEarnings.length - 1 ? '#1e1e28' : colors.secondary,
                  }]}>
                    {i === weekEarnings.length - 1 && (
                      <LinearGradient colors={['#2d2d42', '#1e1e28']} style={StyleSheet.absoluteFill} />
                    )}
                  </Animated.View>
                </View>
                <Text style={[styles.barDay, { color: i === weekEarnings.length - 1 ? '#2d2d42' : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{String(d.day)}</Text>
              </View>
            )) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>No data yet</Text>
              </View>
            )}
          </View>
        </GlassView>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: 24, marginBottom: 12, textAlign: TA }]}>{t.net_earnings}</Text>
        <GlassView borderRadius={16} style={{ padding: 4 }}>
          <SummaryRow label={t.status_confirmed} value={`+${parseFloat(String(summary?.summary?.totalConfirmed ?? 0)).toFixed(2)} ${t.egp}`} positive colors={colors} isRTL={isRTL} />
          <SummaryRow label={t.status_pending} value={`+${parseFloat(String(summary?.summary?.totalPending ?? 0)).toFixed(2)} ${t.egp}`} positive colors={colors} isRTL={isRTL} />
          <SummaryRow label={t.status_paid_out} value={`${parseFloat(String(summary?.summary?.totalPaid ?? 0)).toFixed(2)} ${t.egp}`} colors={colors} isRTL={isRTL} />
          <SummaryRow label={t.net_earnings} value={`${parseFloat(String(summary?.summary?.totalEarnings ?? 0)).toFixed(2)} ${t.egp}`} highlight colors={colors} isRTL={isRTL} last />
        </GlassView>

        <View style={[styles.sectionHeader, { flexDirection: R }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.payout_methods}</Text>
        </View>
        <View style={{ gap: 8 }}>
          {payoutMethods.length === 0 ? (
            <GlassView style={[styles.methodCard, { justifyContent: 'center' }]} borderRadius={16}>
              <Text style={[styles.methodSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
                {t.no_payout_methods}
              </Text>
            </GlassView>
          ) : (
            payoutMethods.map((m) => {
              const displayName = m.bankName ?? m.name ?? m.accountName ?? 'Bank account';
              const last4 = m.last4 ? ` — ****${m.last4}` : '';
              return (
                <GlassView key={m.id} style={[styles.methodCard, { flexDirection: R }]} borderRadius={16}>
                  <View style={[styles.methodIcon, { backgroundColor: '#1e1e2820' }]}>
                    <Briefcase size={20} color="#2d2d42" strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.methodName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{displayName}{last4}</Text>
                    <Text style={[styles.methodSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                      {m.isDefault ? `${t.default_card} · ` : ''}1-2 business days
                    </Text>
                  </View>
                  {m.isDefault && (
                    <Text style={[styles.defaultBadge, { color: '#2d2d42', fontFamily: 'Inter_700Bold' }]}>{t.default_card}</Text>
                  )}
                  <Pressable
                    onPress={() => handleRemoveMethod(m.id, displayName)}
                    disabled={removingId === m.id}
                    style={({ pressed }) => [styles.trashBtn, { opacity: pressed || removingId === m.id ? 0.5 : 1 }]}
                    hitSlop={8}
                  >
                    {removingId === m.id
                      ? <ActivityIndicator size="small" color={colors.destructive} />
                      : <Trash2 size={16} color={colors.destructive} strokeWidth={2} />
                    }
                  </Pressable>
                </GlassView>
              );
            })
          )}
        </View>
        <Pressable
          onPress={() => setAddMethodVisible(true)}
          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, marginTop: 10 }]}
        >
          <GlassView strong style={[styles.addMethodBtn, { flexDirection: R }]} borderRadius={14}>
            <Plus size={16} color={colors.foreground} strokeWidth={2} />
            <Text style={[styles.addMethodText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.add_payout_method}</Text>
          </GlassView>
        </Pressable>

        <Text
          onLayout={(e: LayoutChangeEvent) => setTxSectionY(e.nativeEvent.layout.y)}
          style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: 24, marginBottom: 12, textAlign: TA }]}
        >
          {t.transactions_label}
        </Text>
        <GlassView borderRadius={16}>
          {txs.map((tx, i) => (
            <View key={tx.id} style={[styles.txItem, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={[styles.txIcon, { backgroundColor: tx.incoming ? '#1e1e2820' : colors.secondary }]}>
                {tx.incoming
                  ? <ArrowDownLeft size={16} color="#2d2d42" strokeWidth={2} />
                  : <ArrowUpRight size={16} color={colors.mutedForeground} strokeWidth={2} />
                }
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.txTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{tx.title}</Text>
                <Text style={[styles.txSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{tx.sub}</Text>
              </View>
              <Text style={[styles.txAmount, { color: tx.incoming ? '#2d2d42' : colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {tx.incoming ? '+' : '−'}{tx.amount.toFixed(2)} {t.egp}
              </Text>
            </View>
          ))}
        </GlassView>
      </ScrollView>

      <Modal
        visible={addMethodVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setAddMethodVisible(false); resetAddForm(); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setAddMethodVisible(false); resetAddForm(); }} />
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { flexDirection: R }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.add_payout_method}</Text>
              <Pressable onPress={() => { setAddMethodVisible(false); resetAddForm(); }} hitSlop={8}>
                <X size={20} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.payout_method_type}</Text>
            <View style={[styles.typeRow, { flexDirection: R }]}>
              {METHOD_TYPES.map(({ key, label }) => (
                <Pressable
                  key={key}
                  onPress={() => setMethodType(key)}
                  style={[styles.typeChip, {
                    backgroundColor: methodType === key ? '#1e1e2820' : colors.secondary,
                    borderColor: methodType === key ? '#1e1e2866' : 'transparent',
                    flex: 1,
                  }]}
                >
                  <Text style={[styles.typeChipText, {
                    color: methodType === key ? '#2d2d42' : colors.mutedForeground,
                    fontFamily: methodType === key ? 'Inter_700Bold' : 'Inter_400Regular',
                    textAlign: 'center',
                  }]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.account_number}</Text>
            <TextInput
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType="numeric"
              placeholder="000000000000"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular', textAlign: TA }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.account_name}</Text>
            <TextInput
              value={accountName}
              onChangeText={setAccountName}
              placeholder={t.account_name}
              placeholderTextColor={colors.mutedForeground}
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular', textAlign: TA }]}
            />

            {methodType === 'bank_transfer' && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.bank_name}</Text>
                <TextInput
                  value={bankName}
                  onChangeText={setBankName}
                  placeholder={t.bank_name}
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular', textAlign: TA }]}
                />
              </>
            )}

            {(methodType === 'vodafone_cash' || methodType === 'instapay') && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.phone}</Text>
                <TextInput
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  placeholder={t.phone_placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, fontFamily: 'Inter_400Regular', textAlign: TA }]}
                />
              </>
            )}

            <Pressable
              onPress={handleAddMethod}
              disabled={isAddingMethod}
              style={({ pressed }) => [styles.submitBtn, { opacity: pressed || isAddingMethod ? 0.8 : 1 }]}
            >
              <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                {isAddingMethod
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }}>{t.confirm}</Text>
                }
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function SummaryRow({ label, value, positive, highlight, last, colors, isRTL }: { label: string; value: string; positive?: boolean; highlight?: boolean; last?: boolean; colors: ReturnType<typeof useColors>; isRTL: boolean }) {
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
  payoutInput: { marginTop: 16, gap: 10 },
  payoutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  payoutTextInput: { flex: 1, fontSize: 20, height: 36 },
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
  sectionHeader: { alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  addBtn: { fontSize: 12 },
  methodCard: { alignItems: 'center', gap: 12, padding: 12 },
  methodIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  methodName: { fontSize: 14 },
  methodSub: { fontSize: 12, marginTop: 2 },
  defaultBadge: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  trashBtn: { padding: 6 },
  addMethodBtn: { height: 44, alignItems: 'center', justifyContent: 'center', gap: 8 },
  addMethodText: { fontSize: 13 },
  txItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 14 },
  txSub: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 14 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 0, elevation: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.2, shadowRadius: 16 },
  modalHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 16 },
  fieldLabel: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 2 },
  typeRow: { gap: 6, marginBottom: 4 },
  typeChip: { paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1 },
  typeChipText: { fontSize: 12 },
  submitBtn: { height: 48, borderRadius: 16, overflow: 'hidden', marginTop: 20, elevation: 6, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 },
  submitGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
