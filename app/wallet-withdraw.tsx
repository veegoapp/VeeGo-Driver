import { showAlert } from '@/lib/alert';
import { router } from 'expo-router';
import { ArrowLeft, Check, Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { AppLoader } from '@/components/ui/AppLoader';
import { PayoutMethodIcon } from '@/components/PayoutMethodIcon';
import { useI18n } from '@/lib/i18nContext';
import { rtlIconStyle } from '@/lib/rtlUtils';
import { endpoints } from '@/lib/api';
import {
  normalizeWalletBalance, normalizeActivePayoutAccounts, pickDefaultPayoutAccount,
  parsePayoutAmount, submitPayoutRequest, type PayoutAccount,
} from '@/lib/walletHelpers';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

// Dedicated withdraw page — separated out from the wallet screen's old inline
// expand-in-place flow so the driver can actually SEE and pick which saved
// payout account (Vodafone Cash / InstaPay / bank) a request goes to, instead
// of it always silently going to whichever account happened to be default.
export default function WalletWithdrawScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = 'row' as const;
  const queryClient = useQueryClient();

  const { data: balanceRaw, isLoading: balanceLoading } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: endpoints.wallet.balance,
  });
  const { data: accountsRaw, isLoading: accountsLoading } = useQuery({
    queryKey: ['payout-accounts'],
    queryFn: endpoints.wallet.getPayoutAccounts,
  });

  const balanceData = normalizeWalletBalance(balanceRaw);
  const accounts = normalizeActivePayoutAccounts(accountsRaw as Parameters<typeof normalizeActivePayoutAccounts>[0]);

  const [amount, setAmount] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedAccount: PayoutAccount | null = useMemo(() => {
    if (selectedId != null) return accounts.find(a => a.id === selectedId) ?? null;
    return pickDefaultPayoutAccount(accounts);
  }, [accounts, selectedId]);

  const parsedAmount = parsePayoutAmount(amount);
  const exceedsBalance = parsedAmount != null && parsedAmount > balanceData.balance;
  const canSubmit = !!parsedAmount && !exceedsBalance && !!selectedAccount && !submitting;

  const isLoading = balanceLoading || accountsLoading;

  const handleSubmit = async () => {
    if (!parsedAmount || !selectedAccount) return;
    setSubmitting(true);
    try {
      const result = await submitPayoutRequest(parsedAmount, selectedAccount.id, queryClient);
      if (!result.ok) {
        const note = result.available != null ? ` (${t.available}: ${result.available.toFixed(2)} ${t.egp})` : '';
        showAlert(t.error, `${result.error ?? t.payout_fail_msg}${note}`);
        return;
      }
      showAlert(t.payout_success_title, t.payout_pending_msg, [{ text: t.ok, onPress: () => router.back() }]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.headerRow, { flexDirection: R }]}>
            <Pressable
              onPress={() => router.back()}
              style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
            >
              <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} style={rtlIconStyle(isRTL)} />
            </Pressable>
            <Text style={[styles.pageTitle, { color: colors.foreground, textAlign: TA, flex: 1 }]}>
              {t.cash_out}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {isLoading ? (
            <View style={styles.center}><AppLoader /></View>
          ) : (
            <>
              <Text style={[styles.availableLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                {t.available}: {balanceData.balance.toFixed(2)} {t.egp}
              </Text>

              {/* Amount */}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>{t.withdraw_amount_label}</Text>
              <View style={[styles.amountRow, { borderColor: colors.border, backgroundColor: colors.secondary, flexDirection: R }]}>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder={t.amount_placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.amountInput, { color: colors.foreground, textAlign: TA }]}
                  autoFocus
                />
                <Text style={[styles.amountCurrency, { color: colors.mutedForeground }]}>{t.egp}</Text>
              </View>
              {exceedsBalance && (
                <Text style={[styles.warningText, { color: colors.destructive, textAlign: TA }]}>
                  {t.available}: {balanceData.balance.toFixed(2)} {t.egp}
                </Text>
              )}

              {/* Method picker */}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA, marginTop: Spacing.lg }]}>
                {t.withdraw_method_label}
              </Text>
              {accounts.length === 0 ? (
                <Pressable onPress={() => router.push('/payout-accounts')} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}>
                  <GlassView strong style={[styles.addAccountBtn, { flexDirection: R }]} borderRadius={16}>
                    <Plus size={18} color={colors.foreground} strokeWidth={2} />
                    <Text style={[styles.addAccountText, { color: colors.foreground }]}>{t.add_payout_method}</Text>
                  </GlassView>
                </Pressable>
              ) : (
                <View style={{ gap: Spacing.sm }}>
                  {accounts.map((account) => {
                    const selected = selectedAccount?.id === account.id;
                    return (
                      <Pressable key={account.id} onPress={() => setSelectedId(account.id)}>
                        <GlassView
                          style={[
                            styles.accountCard,
                            { flexDirection: R, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primary : 'transparent' },
                          ]}
                          borderRadius={16}
                        >
                          <View style={[styles.methodIcon, { backgroundColor: selected ? colors.primary + '26' : colors.secondary }]}>
                            <PayoutMethodIcon methodKey={account.methodKey} color={selected ? colors.primary : colors.mutedForeground} instapayIcon="briefcase" />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.accountName, { color: colors.foreground, textAlign: TA }]} numberOfLines={1}>
                              {account.accountName}
                            </Text>
                            <Text style={[styles.accountSub, { color: colors.mutedForeground, textAlign: TA }]} numberOfLines={1}>
                              {account.accountNumber}
                            </Text>
                          </View>
                          {selected && (
                            <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                              <Check size={14} color={colors.primaryForeground} strokeWidth={3} />
                            </View>
                          )}
                        </GlassView>
                      </Pressable>
                    );
                  })}
                  <Pressable onPress={() => router.push('/payout-accounts')} hitSlop={8}>
                    <Text style={[styles.manageLink, { color: colors.primary, textAlign: TA }]}>{t.manage_payout_methods}</Text>
                  </Pressable>
                </View>
              )}

              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit}
                style={({ pressed }) => [styles.submitBtn, { backgroundColor: colors.primary, opacity: pressed || !canSubmit ? 0.6 : 1 }]}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.submitText}>{t.confirm}</Text>
                }
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xl },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageTitle: { fontSize: Typography.size.xl, fontFamily: 'Inter_700Bold' },
  center: { alignItems: 'center', paddingVertical: 60 },
  availableLabel: { fontSize: Typography.size.sm, fontFamily: 'Inter_600SemiBold', marginBottom: Spacing.lg },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  amountRow: { alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  amountInput: { flex: 1, fontSize: 20, fontFamily: 'Inter_700Bold' },
  amountCurrency: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },
  warningText: { fontSize: 11, marginTop: 6, fontFamily: 'Inter_400Regular' },
  accountCard: { alignItems: 'center', gap: Spacing.md, padding: 14 },
  methodIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  accountName: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },
  accountSub: { fontSize: Typography.size.xs, fontFamily: 'Inter_400Regular', marginTop: 2 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  addAccountBtn: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg },
  addAccountText: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },
  manageLink: { fontSize: Typography.size.xs, fontFamily: 'Inter_600SemiBold', paddingVertical: Spacing.sm },
  submitBtn: { height: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xl },
  submitText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: Typography.size.sm },
});
