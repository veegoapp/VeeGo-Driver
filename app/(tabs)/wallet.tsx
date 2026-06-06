import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Briefcase, CreditCard, Plus, X } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Platform, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

type WalletBalance = { balance: number };
type Transaction = { id: string; title: string; sub: string; amount: number; incoming: boolean };

const TAB_BAR_HEIGHT = 96;

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const queryClient = useQueryClient();

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const [payoutVisible, setPayoutVisible] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [isPayingOut, setIsPayingOut] = useState(false);

  const { data: balanceRaw, isLoading: balanceLoading, isError: balanceError } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: endpoints.wallet.balance,
  });
  const { data: txRaw, isLoading: txLoading, isError: txError } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: endpoints.wallet.transactions,
  });

  const _balRaw = balanceRaw as WalletBalance | { balance?: number; wallet?: { balance?: number } } | undefined;
  const balanceData: WalletBalance = {
    balance: (typeof (_balRaw as WalletBalance)?.balance === 'number'
      ? (_balRaw as WalletBalance).balance
      : parseFloat(String((_balRaw as { wallet?: { balance?: number } })?.wallet?.balance ?? (_balRaw as { balance?: unknown })?.balance ?? 0))),
  };
  const _txRaw = txRaw as Transaction[] | { transactions?: Transaction[]; data?: Transaction[] } | undefined;
  const txs: Transaction[] = Array.isArray(_txRaw) ? _txRaw : ((_txRaw as { transactions?: Transaction[] })?.transactions ?? ((_txRaw as { data?: Transaction[] })?.data ?? []));

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
      Alert.alert('Success', `${amount.toFixed(2)} DT payout initiated.`);
    } catch {
      Alert.alert('Error', 'Payout failed. Please try again.');
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
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>Failed to load wallet. Please try again.</Text>
      </View>
    );
  }

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
              <Text style={[styles.balanceCurrency, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>DT</Text>
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
                  <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>DT</Text>
                </View>
                <View style={[styles.actionRow, { flexDirection: R }]}>
                  <Pressable onPress={() => setPayoutVisible(false)} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.8 : 1 }]}>
                    <GlassView strong style={[styles.secondaryAction, { flexDirection: R }]} borderRadius={16}>
                      <X size={16} color={colors.foreground} strokeWidth={2} />
                      <Text style={[styles.actionText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Cancel</Text>
                    </GlassView>
                  </Pressable>
                  <Pressable onPress={handlePayoutConfirm} disabled={isPayingOut} style={({ pressed }) => [styles.primaryAction, { opacity: pressed || isPayingOut ? 0.8 : 1 }]}>
                    <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.actionGrad, { flexDirection: R }]}>
                      {isPayingOut
                        ? <ActivityIndicator color={colors.primaryForeground} size="small" />
                        : <ArrowDownLeft size={16} color={colors.primaryForeground} strokeWidth={2} />
                      }
                      <Text style={[styles.actionText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>Confirm</Text>
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
                <Pressable onPress={() => router.push('/support')} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.9 : 1 }]}>
                  <GlassView strong style={[styles.secondaryAction, { flexDirection: R }]} borderRadius={16}>
                    <Plus size={16} color={colors.foreground} strokeWidth={2} />
                    <Text style={[styles.actionText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.top_up}</Text>
                  </GlassView>
                </Pressable>
              </View>
            )}
          </View>
        </Animated.View>

        <View style={[styles.sectionHeader, { flexDirection: R }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{t.payout_methods}</Text>
          <Pressable onPress={() => Alert.alert('Coming soon')}><Text style={[styles.addBtn, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{t.add}</Text></Pressable>
        </View>
        <View style={{ gap: 8 }}>
          <GlassView style={[styles.methodCard, { flexDirection: R }]} borderRadius={16}>
            <View style={[styles.methodIcon, { backgroundColor: colors.primary + '26' }]}>
              <Briefcase size={20} color={colors.primary} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.methodName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>BIAT — ****4521</Text>
              <Text style={[styles.methodSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>Default · 1-2 business days</Text>
            </View>
            <Text style={[styles.defaultBadge, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>Default</Text>
          </GlassView>
          <GlassView style={[styles.methodCard, { flexDirection: R }]} borderRadius={16}>
            <View style={[styles.methodIcon, { backgroundColor: colors.secondary }]}>
              <CreditCard size={20} color={colors.mutedForeground} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.methodName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>Visa — ****1133</Text>
              <Text style={[styles.methodSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>Instant · 1% fee</Text>
            </View>
          </GlassView>
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
                {tx.incoming ? '+' : '−'}{tx.amount.toFixed(2)} DT
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
  txItem: { alignItems: 'center', gap: 12, padding: 16 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 14 },
  txSub: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 14 },
});
