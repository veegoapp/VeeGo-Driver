import { router } from 'expo-router';
import { ArrowLeft, Briefcase, CreditCard, Phone, Plus, Star, Trash2, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
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
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

// A driver's own saved payout destination (see /driver/payout-accounts).
// Only instapay / vodafone_cash are supported today; the type picker below
// is a small local list so adding a future method (e.g. bank accounts) is
// just one more entry, not a shape change.
type PayoutAccount = {
  id: number;
  methodKey: string;
  accountName: string;
  accountNumber: string;
  isDefault: boolean;
  isVerified: boolean;
  isActive: boolean;
};

type MethodType = 'vodafone_cash' | 'instapay';

const BORDER_COLOR = 'rgba(0,0,0,0.08)';

function MethodIcon({ methodKey, color }: { methodKey: string; color: string }) {
  if (methodKey === 'vodafone_cash') return <Phone size={20} color={color} strokeWidth={2} />;
  if (methodKey === 'instapay') return <Briefcase size={20} color={color} strokeWidth={2} />;
  return <CreditCard size={20} color={color} strokeWidth={2} />;
}

export default function PayoutAccountsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const queryClient = useQueryClient();

  const [addVisible, setAddVisible] = useState(false);
  const [methodType, setMethodType] = useState<MethodType>('vodafone_cash');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const {
    data: accountsRaw,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['payout-accounts'],
    queryFn: endpoints.wallet.getPayoutAccounts,
  });

  const _raw = accountsRaw as PayoutAccount[] | { data?: PayoutAccount[] } | undefined;
  const accounts: PayoutAccount[] = (Array.isArray(_raw) ? _raw : (_raw?.data ?? [])).filter(a => a.isActive);

  const METHOD_TYPES: { key: MethodType; label: string }[] = [
    { key: 'vodafone_cash', label: t.vodafone_cash },
    { key: 'instapay', label: t.instapay },
  ];

  const resetForm = () => {
    setMethodType('vodafone_cash');
    setAccountName('');
    setAccountNumber('');
  };

  const handleAdd = async () => {
    if (!accountName.trim() || !accountNumber.trim()) return;
    setIsAdding(true);
    try {
      await endpoints.wallet.addPayoutAccount({
        methodKey: methodType,
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['payout-accounts'] });
      setAddVisible(false);
      resetForm();
    } catch {
      Alert.alert(t.error, t.add_method_error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleSetDefault = async (id: number) => {
    setBusyId(id);
    try {
      await endpoints.wallet.setDefaultPayoutAccount(id);
      await queryClient.invalidateQueries({ queryKey: ['payout-accounts'] });
    } catch {
      Alert.alert(t.error, t.error);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (account: PayoutAccount) => {
    Alert.alert(t.remove_method_confirm, account.accountName, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.remove_method,
        style: 'destructive',
        onPress: async () => {
          setBusyId(account.id);
          try {
            await endpoints.wallet.deletePayoutAccount(account.id);
            await queryClient.invalidateQueries({ queryKey: ['payout-accounts'] });
          } catch {
            Alert.alert(t.error, t.remove_method_error);
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={[styles.headerRow, { flexDirection: R }]}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
          >
            <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.pageTitle, { color: colors.foreground, textAlign: TA, flex: 1 }]}>
            {t.payment_info_label}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            <View style={{ gap: 8 }}>
              {accounts.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: colors.secondary, borderColor: BORDER_COLOR }]}>
                  <CreditCard size={36} color={colors.mutedForeground} strokeWidth={1.5} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t.no_payout_methods}</Text>
                </View>
              ) : accounts.map((account) => (
                <GlassView key={account.id} style={[styles.accountCard, { flexDirection: R }]} borderRadius={16}>
                  <View style={[styles.methodIcon, { backgroundColor: account.isDefault ? colors.primary + '26' : colors.secondary }]}>
                    <MethodIcon methodKey={account.methodKey} color={account.isDefault ? colors.primary : colors.mutedForeground} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.accountName, { color: colors.foreground, textAlign: TA }]} numberOfLines={1}>
                      {account.accountName}
                    </Text>
                    <Text style={[styles.accountSub, { color: colors.mutedForeground, textAlign: TA }]} numberOfLines={1}>
                      {account.accountNumber} · {account.isVerified ? t.default_card : t.pending_verification}
                    </Text>
                  </View>
                  {busyId === account.id ? (
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                  ) : (
                    <View style={{ flexDirection: R, alignItems: 'center', gap: 4 }}>
                      {account.isDefault ? (
                        <Text style={[styles.defaultBadge, { color: colors.primary }]}>{t.default_card}</Text>
                      ) : (
                        <Pressable onPress={() => handleSetDefault(account.id)} hitSlop={8} style={styles.iconBtn}>
                          <Star size={16} color={colors.mutedForeground} strokeWidth={2} />
                        </Pressable>
                      )}
                      <Pressable onPress={() => handleDelete(account)} hitSlop={8} style={styles.iconBtn}>
                        <Trash2 size={16} color={colors.destructive} strokeWidth={2} />
                      </Pressable>
                    </View>
                  )}
                </GlassView>
              ))}
            </View>

            <Pressable onPress={() => setAddVisible(true)} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, marginTop: 16 }]}>
              <GlassView strong style={[styles.addAccountBtn, { flexDirection: R }]} borderRadius={16}>
                <Plus size={18} color={colors.foreground} strokeWidth={2} />
                <Text style={[styles.addAccountText, { color: colors.foreground }]}>{t.add_payout_method}</Text>
              </GlassView>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Add account modal */}
      <Modal
        visible={addVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setAddVisible(false); resetForm(); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setAddVisible(false); resetForm(); }} />
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { flexDirection: R }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, textAlign: TA }]}>{t.add_payout_method}</Text>
              <Pressable onPress={() => { setAddVisible(false); resetForm(); }} hitSlop={8}>
                <X size={20} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>{t.payout_method_type}</Text>
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
                    textAlign: 'center',
                  }]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>{t.account_name}</Text>
            <TextInput
              value={accountName}
              onChangeText={setAccountName}
              placeholder={t.account_name}
              placeholderTextColor={colors.mutedForeground}
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, textAlign: TA }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>
              {methodType === 'vodafone_cash' ? t.phone : t.account_number}
            </Text>
            <TextInput
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType={methodType === 'vodafone_cash' ? 'phone-pad' : 'numeric'}
              placeholder={methodType === 'vodafone_cash' ? t.phone_placeholder : t.account_number}
              placeholderTextColor={colors.mutedForeground}
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, textAlign: TA }]}
            />

            <Pressable
              onPress={handleAdd}
              disabled={isAdding}
              style={({ pressed }) => [styles.submitBtn, { backgroundColor: colors.primary, opacity: pressed || isAdding ? 0.8 : 1 }]}
            >
              {isAdding
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitText}>{t.confirm}</Text>
              }
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  pageTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  center: { alignItems: 'center', paddingVertical: 60 },
  emptyBox: {
    alignItems: 'center', justifyContent: 'center', gap: 12,
    borderRadius: 20, borderWidth: 1, paddingVertical: 48,
  },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  accountCard: { alignItems: 'center', gap: 12, padding: 14 },
  methodIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  accountName: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  accountSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  defaultBadge: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, textTransform: 'uppercase' },
  iconBtn: { padding: 6 },
  addAccountBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  addAccountText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40,
    elevation: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.2, shadowRadius: 16,
  },
  modalHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: 'Inter_400Regular', marginBottom: 2 },
  typeRow: { gap: 6, marginBottom: 4 },
  typeChip: { paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1 },
  typeChipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  submitBtn: { height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  submitText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
});
