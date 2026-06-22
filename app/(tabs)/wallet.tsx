import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDownLeft, ArrowUpRight, Briefcase, CreditCard, Plus, Trash2, X } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

type WalletBalance = { balance: number };
type Transaction = { id: string; title: string; sub: string; amount: number; incoming: boolean };
type PayoutMethod = { id: string; type?: string; label?: string; name?: string; last4?: string; isDefault?: boolean; accountName?: string; bankName?: string };
type MethodType = 'bank_transfer' | 'vodafone_cash' | 'instapay';

const TAB_BAR_HEIGHT = 96;

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

  const [addMethodVisible, setAddMethodVisible] = useState(false);
  const [methodType, setMethodType] = useState<MethodType>('bank_transfer');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isAddingMethod, setIsAddingMethod] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: balanceRaw, isLoading: balanceLoading, isError: balanceError } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: endpoints.wallet.balance,
  });
  const { data: txRaw, isLoading: txLoading, isError: txError } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: endpoints.wallet.transactions,
  });
  const { data: payoutMethodsRaw } = useQuery({
    queryKey: ['payout-methods'],
    queryFn: endpoints.wallet.payoutMethods,
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
  const _pmRaw = payoutMethodsRaw as PayoutMethod[] | { methods?: PayoutMethod[]; data?: PayoutMethod[] } | undefined;
  const payoutMethods: PayoutMethod[] = Array.isArray(_pmRaw)
    ? _pmRaw
    : ((_pmRaw as { methods?: PayoutMethod[] })?.methods ?? ((_pmRaw as { data?: PayoutMethod[] })?.data ?? []));

  const isLoading = balanceLoading || txLoading;
  const isError = balanceError || txError;

  const heroAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!balanceLoading) {
      Animated.spring(heroAnim, { toValue: 1, useNativeDriver: true, stiffness: 200, damping: 20 }).start();
    }
  }, [balanceLoading]);

  const handlePayoutOpen = () => {
    setPayoutAmount(String(balanceData?.balance ?? ''));
    setPayoutVisible(true);
  };

  const handlePayoutConfirm = async () => {
    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0) {
      Alert.alert(t.invalid_amount_title, t.invalid_amount_msg);
      return;
    }
    const selectedMethod = payoutMethods.find(m => m.isDefault) ?? payoutMethods[0] ?? null;
    if (!selectedMethod) {
      Alert.alert(t.error, (t as any).no_payout_methods ?? 'Please add a payout method first.');
      return;
    }
    setIsPayingOut(true);
    try {
      await endpoints.wallet.payout(amount, selectedMethod.id);
      await queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      setPayoutVisible(false);
      setPayoutAmount('');
      Alert.alert(t.payout_success_title, `${amount.toFixed(2)} ${t.egp} payout initiated.`);
    } catch {
      Alert.alert(t.error, t.payout_fail_msg);
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
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>{t.wallet_load_fail}</Text>
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
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: TAB_BAR_HEIGHT + 24, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
                  <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>{t.egp}</Text>
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
                <Pressable onPress={() => setAddMethodVisible(true)} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.9 : 1 }]}>
                  <GlassView strong style={[styles.secondaryAction, { flexDirection: R }]} borderRadius={16}>
                    <Plus size={16} color={colors.foreground} strokeWidth={2} />
                    <Text style={[styles.actionText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.add}</Text>
                  </GlassView>
                </Pressable>
              </View>
            )}
          </View>
        </Animated.View>

        <View style={[styles.sectionHeader, { flexDirection: R }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.payout_methods}</Text>
        </View>
        <View style={{ gap: 8 }}>
          {payoutMethods.length > 0 ? payoutMethods.map((method) => {
            const displayName = method.label ?? method.name ?? method.accountName ?? method.bankName ?? t.payment_method_fallback;
            return (
              <GlassView key={method.id} style={[styles.methodCard, { flexDirection: R }]} borderRadius={16}>
                <View style={[styles.methodIcon, { backgroundColor: method.isDefault ? colors.primary + '26' : colors.secondary }]}>
                  {method.type === 'bank' || method.type === 'bank_transfer' ? (
                    <Briefcase size={20} color={method.isDefault ? colors.primary : colors.mutedForeground} strokeWidth={2} />
                  ) : (
                    <CreditCard size={20} color={method.isDefault ? colors.primary : colors.mutedForeground} strokeWidth={2} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.methodName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                    {displayName}{method.last4 ? ` — ****${method.last4}` : ''}
                  </Text>
                  {method.isDefault && (
                    <Text style={[styles.methodSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{t.default_card}</Text>
                  )}
                </View>
                {method.isDefault && (
                  <Text style={[styles.defaultBadge, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{t.default_card}</Text>
                )}
                <Pressable
                  onPress={() => handleRemoveMethod(method.id, displayName)}
                  disabled={removingId === method.id}
                  style={({ pressed }) => [styles.trashBtn, { opacity: pressed || removingId === method.id ? 0.5 : 1 }]}
                  hitSlop={8}
                >
                  {removingId === method.id
                    ? <ActivityIndicator size="small" color={colors.destructive} />
                    : <Trash2 size={16} color={colors.destructive} strokeWidth={2} />
                  }
                </Pressable>
              </GlassView>
            );
          }) : (
            <GlassView style={[styles.methodCard, { flexDirection: R }]} borderRadius={16}>
              <View style={[styles.methodIcon, { backgroundColor: colors.secondary }]}>
                <Plus size={20} color={colors.mutedForeground} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.methodName, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{t.no_payout_methods}</Text>
              </View>
            </GlassView>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: 24, marginBottom: 12, textAlign: TA }]}>{t.transactions_label}</Text>
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
                    backgroundColor: methodType === key ? colors.primary + '1A' : colors.secondary,
                    borderColor: methodType === key ? colors.primary + '66' : 'transparent',
                    flex: 1,
                  }]}
                >
                  <Text style={[styles.typeChipText, {
                    color: methodType === key ? colors.primary : colors.mutedForeground,
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  pageTitle: { fontSize: 24, marginTop: 2 },
  balanceCard: { borderRadius: 24, padding: 20, borderWidth: 1, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 16 },
  balanceBlob: { position: 'absolute', top: -24, right: -24, width: 128, height: 128, borderRadius: 64 },
  availableLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  balanceRow: { alignItems: 'flex-end', gap: 8, marginTop: 4 },
  balanceAmount: { fontSize: 48, lineHeight: 52 },
  balanceCurrency: { fontSize: 20, marginBottom: 4 },
  payoutInput: { marginTop: 16, gap: 10 },
  payoutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  payoutTextInput: { flex: 1, fontSize: 20, height: 36 },
  actionRow: { gap: 8, marginTop: 20 },
  primaryAction: { flex: 1, height: 48, borderRadius: 16, overflow: 'hidden', elevation: 8, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 8 },
  actionGrad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryAction: { height: 48, alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontSize: 14 },
  sectionHeader: { alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  addBtn: { fontSize: 12 },
  methodCard: { alignItems: 'center', gap: 12, padding: 12 },
  methodIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  methodName: { fontSize: 14 },
  methodSub: { fontSize: 12, marginTop: 2 },
  defaultBadge: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  trashBtn: { padding: 6 },
  txItem: { alignItems: 'center', gap: 12, padding: 16 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 14 },
  txSub: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 14 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, elevation: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.2, shadowRadius: 16 },
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
