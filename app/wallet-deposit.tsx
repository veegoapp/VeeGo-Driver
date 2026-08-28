import { showAlert } from '@/lib/alert';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { ArrowLeft, Camera, Check, Image as ImageIcon, UploadCloud } from 'lucide-react-native';
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
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import { rtlIconStyle } from '@/lib/rtlUtils';
import { endpoints } from '@/lib/api';
import { extractList, parseDepositAmount, type DepositMethod } from '@/lib/walletHelpers';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

// JPG-only at the point of picking — the backend's multer filter and
// compressImage re-encode both enforce this too (defense in depth), but
// rejecting here gives the driver an immediate, specific reason instead of a
// failed upload after they've already filled in the amount.
function isJpeg(asset: ImagePicker.ImagePickerAsset): boolean {
  if (asset.mimeType) return asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/jpg';
  return /\.(jpe?g)$/i.test(asset.uri);
}

export default function WalletDepositScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = 'row' as const;
  const queryClient = useQueryClient();

  const { data: methodsRaw, isLoading: methodsLoading } = useQuery({
    queryKey: ['deposit-methods'],
    queryFn: endpoints.wallet.getDepositMethods,
  });
  const methods: DepositMethod[] = extractList(methodsRaw as DepositMethod[] | { data?: DepositMethod[] } | undefined);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedMethod = useMemo(
    () => methods.find(m => m.key === selectedKey) ?? methods[0] ?? null,
    [methods, selectedKey],
  );

  const parsedAmount = parseDepositAmount(amount);
  const canSubmit = !!parsedAmount && !!selectedMethod && !!proofUri && !submitting;

  const pickProof = async (source: 'camera' | 'gallery') => {
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { showAlert(t.doc_permission_title, t.doc_permission_msg); return; }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { showAlert(t.doc_permission_title, t.doc_permission_msg); return; }
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    }
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!isJpeg(asset)) {
      showAlert(t.deposit_jpg_only_title, t.deposit_jpg_only_msg);
      return;
    }
    setProofUri(asset.uri);
  };

  const handleAttachPress = () => {
    showAlert(t.doc_upload_btn, undefined, [
      { text: t.doc_take_photo, onPress: () => pickProof('camera') },
      { text: t.doc_choose_gallery, onPress: () => pickProof('gallery') },
      { text: t.cancel, style: 'cancel' },
    ]);
  };

  const handleSubmit = async () => {
    if (!parsedAmount || !selectedMethod || !proofUri) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('amount', String(parsedAmount));
      formData.append('methodKey', selectedMethod.key);
      formData.append('proof', {
        uri: proofUri,
        name: 'deposit-proof.jpg',
        type: 'image/jpeg',
      } as unknown as Blob);

      await endpoints.wallet.submitDeposit(formData);
      await queryClient.invalidateQueries({ queryKey: ['deposit-history'] });
      showAlert(t.deposit_submitted_title, t.deposit_submitted_msg, [{ text: t.ok, onPress: () => router.back() }]);
    } catch {
      showAlert(t.error, t.deposit_submit_error);
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
              {t.deposit_label}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {methodsLoading ? (
            <View style={styles.center}><AppLoader /></View>
          ) : methods.length === 0 ? (
            <GlassView borderRadius={16} style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center' }}>
                {t.deposit_no_methods}
              </Text>
            </GlassView>
          ) : (
            <>
              {/* Method picker */}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>{t.deposit_method_label}</Text>
              <View style={{ gap: Spacing.sm }}>
                {methods.map((m) => {
                  const selected = selectedMethod?.key === m.key;
                  return (
                    <Pressable key={m.key} onPress={() => setSelectedKey(m.key)}>
                      <GlassView
                        style={[
                          styles.methodCard,
                          { borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primary : 'transparent' },
                        ]}
                        borderRadius={16}
                      >
                        <View style={[styles.methodTopRow, { flexDirection: R }]}>
                          <Text style={[styles.methodName, { color: colors.foreground, textAlign: TA, flex: 1 }]}>
                            {isRTL && m.nameAr ? m.nameAr : m.name}
                          </Text>
                          {selected && (
                            <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                              <Check size={14} color={colors.primaryForeground} strokeWidth={3} />
                            </View>
                          )}
                        </View>
                        {(isRTL ? m.instructionsAr ?? m.instructions : m.instructions) && (
                          <Text style={[styles.methodInstructions, { color: colors.mutedForeground, textAlign: TA }]}>
                            {isRTL ? m.instructionsAr ?? m.instructions : m.instructions}
                          </Text>
                        )}
                      </GlassView>
                    </Pressable>
                  );
                })}
              </View>

              {/* Amount */}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA, marginTop: Spacing.lg }]}>
                {t.deposit_amount_label}
              </Text>
              <View style={[styles.amountRow, { borderColor: colors.border, backgroundColor: colors.secondary, flexDirection: R }]}>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder={t.amount_placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.amountInput, { color: colors.foreground, textAlign: TA }]}
                />
                <Text style={[styles.amountCurrency, { color: colors.mutedForeground }]}>{t.egp}</Text>
              </View>

              {/* Attach proof */}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA, marginTop: Spacing.lg }]}>
                {t.deposit_proof_label}
              </Text>
              {proofUri ? (
                <Pressable onPress={handleAttachPress}>
                  <View style={styles.proofPreviewWrap}>
                    <Image source={{ uri: proofUri }} style={styles.proofPreview} contentFit="cover" />
                    <View style={[styles.proofChangeBadge, { backgroundColor: colors.primary }]}>
                      <Camera size={12} color={colors.primaryForeground} strokeWidth={2} />
                      <Text style={[styles.proofChangeText, { color: colors.primaryForeground }]}>{t.doc_update_btn}</Text>
                    </View>
                  </View>
                </Pressable>
              ) : (
                <Pressable onPress={handleAttachPress} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}>
                  <GlassView strong style={[styles.attachBtn, { flexDirection: R }]} borderRadius={16}>
                    <UploadCloud size={18} color={colors.foreground} strokeWidth={2} />
                    <Text style={[styles.attachText, { color: colors.foreground }]}>{t.deposit_attach_btn}</Text>
                  </GlassView>
                </Pressable>
              )}
              <View style={[styles.hintRow, { flexDirection: R }]}>
                <ImageIcon size={12} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[styles.hintText, { color: colors.mutedForeground, textAlign: TA }]}>{t.deposit_jpg_hint}</Text>
              </View>

              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit}
                style={({ pressed }) => [styles.submitBtn, { backgroundColor: colors.primary, opacity: pressed || !canSubmit ? 0.6 : 1 }]}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.submitText}>{t.deposit_submit_btn}</Text>
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
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  methodCard: { padding: 14, gap: 6 },
  methodTopRow: { alignItems: 'center' },
  methodName: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },
  methodInstructions: { fontSize: Typography.size.xs, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  amountRow: { alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  amountInput: { flex: 1, fontSize: 20, fontFamily: 'Inter_700Bold' },
  amountCurrency: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },
  attachBtn: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg },
  attachText: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },
  proofPreviewWrap: { borderRadius: Radius.lg, overflow: 'hidden', height: 180 },
  proofPreview: { width: '100%', height: '100%' },
  proofChangeBadge: {
    position: 'absolute', bottom: 10, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  proofChangeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  hintRow: { alignItems: 'center', gap: 6, marginTop: 8 },
  hintText: { fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1 },
  submitBtn: { height: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xl },
  submitText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: Typography.size.sm },
});
