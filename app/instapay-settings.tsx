import { showAlert } from '@/lib/alert';
import { router } from 'expo-router';
import { ArrowLeft, Clock, QrCode } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import { rtlIconStyle } from '@/lib/rtlUtils';
import { endpoints } from '@/lib/api';
import type { InstapayStatus } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

const BORDER_COLOR = 'rgba(0,0,0,0.08)';

export default function InstapaySettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = 'row' as const;
  const queryClient = useQueryClient();

  const [linkInput, setLinkInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [changeFormOpen, setChangeFormOpen] = useState(false);
  const [newLinkInput, setNewLinkInput] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);

  const {
    data: statusRaw,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['instapay-status'],
    queryFn: endpoints.driver.getInstapayStatus,
  });

  const status: InstapayStatus | undefined = (statusRaw as { data?: InstapayStatus } | undefined)?.data;

  const handleSave = async () => {
    const link = linkInput.trim();
    if (!link) return;
    setIsSaving(true);
    try {
      await endpoints.driver.setupInstapay(link);
      await queryClient.invalidateQueries({ queryKey: ['instapay-status'] });
      setLinkInput('');
    } catch {
      showAlert(t.error, t.instapay_setup_error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitChangeRequest = async () => {
    const newLink = newLinkInput.trim();
    if (!newLink) return;
    setIsRequesting(true);
    try {
      await endpoints.driver.requestInstapayChange(newLink);
      await queryClient.invalidateQueries({ queryKey: ['instapay-status'] });
      setChangeFormOpen(false);
      setNewLinkInput('');
    } catch {
      showAlert(t.error, t.instapay_change_request_error);
    } finally {
      setIsRequesting(false);
    }
  };

  const hasPendingRequest = !!status?.pendingRequest;

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
            <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} style={rtlIconStyle(isRTL)} />
          </Pressable>
          <Text style={[styles.pageTitle, { color: colors.foreground, textAlign: TA, flex: 1 }]}>
            {t.instapay_settings_label}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <AppLoader />
          </View>
        ) : !status ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.secondary, borderColor: BORDER_COLOR }]}>
            <QrCode size={36} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t.instapay_load_error}</Text>
          </View>
        ) : !status.hasSetup ? (
          /* ── No setup yet ── */
          <GlassView style={styles.card} borderRadius={20}>
            <Text style={[styles.cardTitle, { color: colors.foreground, textAlign: TA }]}>{t.instapay_setup_title}</Text>
            <Text style={[styles.cardDesc, { color: colors.mutedForeground, textAlign: TA }]}>{t.instapay_setup_desc}</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>{t.instapay_link_label}</Text>
            <TextInput
              value={linkInput}
              onChangeText={setLinkInput}
              placeholder={t.instapay_link_placeholder}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, textAlign: TA }]}
            />

            <Pressable
              onPress={handleSave}
              disabled={isSaving || !linkInput.trim()}
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: colors.primary, opacity: pressed || isSaving || !linkInput.trim() ? 0.8 : 1 },
              ]}
            >
              {isSaving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitText}>{t.instapay_save_btn}</Text>
              }
            </Pressable>
          </GlassView>
        ) : (
          /* ── Active setup — with or without a pending change request ── */
          <>
            <GlassView style={styles.card} borderRadius={20}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>{t.instapay_active_link_label}</Text>
              <Text
                selectable
                style={[styles.linkText, { color: colors.foreground, textAlign: TA }]}
              >
                {status.activeLink ?? '—'}
              </Text>

              {status.qrDataUrl && (
                <View style={styles.qrWrap}>
                  <Image source={{ uri: status.qrDataUrl }} style={styles.qrImage} resizeMode="contain" />
                </View>
              )}

              {!hasPendingRequest && (
                changeFormOpen ? (
                  <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA, marginTop: Spacing.lg }]}>
                      {t.instapay_new_link_label}
                    </Text>
                    <TextInput
                      value={newLinkInput}
                      onChangeText={setNewLinkInput}
                      placeholder={t.instapay_link_placeholder}
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, textAlign: TA }]}
                    />
                    <View style={[styles.inlineRow, { flexDirection: R }]}>
                      <Pressable
                        onPress={() => { setChangeFormOpen(false); setNewLinkInput(''); }}
                        disabled={isRequesting}
                        style={[styles.secondaryBtn, { borderColor: colors.border, flex: 1 }]}
                      >
                        <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>{t.cancel}</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleSubmitChangeRequest}
                        disabled={isRequesting || !newLinkInput.trim()}
                        style={[
                          styles.submitBtn,
                          { backgroundColor: colors.primary, flex: 1, marginTop: 0, opacity: isRequesting || !newLinkInput.trim() ? 0.8 : 1 },
                        ]}
                      >
                        {isRequesting
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.submitText}>{t.instapay_submit_request_btn}</Text>
                        }
                      </Pressable>
                    </View>
                  </KeyboardAvoidingView>
                ) : (
                  <Pressable
                    onPress={() => setChangeFormOpen(true)}
                    style={[styles.secondaryBtn, { borderColor: colors.border, marginTop: Spacing.lg, alignSelf: 'flex-start' }]}
                  >
                    <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>{t.instapay_request_change_btn}</Text>
                  </Pressable>
                )
              )}
            </GlassView>

            {hasPendingRequest && status.pendingRequest && (
              <GlassView style={[styles.card, styles.pendingCard, { marginTop: Spacing.md, borderColor: colors.primary + '55' }]} borderRadius={20}>
                <View style={[styles.pendingHeaderRow, { flexDirection: R }]}>
                  <Clock size={16} color={colors.primary} strokeWidth={2} />
                  <Text style={[styles.pendingTitle, { color: colors.primary, textAlign: TA }]}>{t.instapay_pending_banner_title}</Text>
                </View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA, marginTop: Spacing.sm }]}>
                  {t.instapay_pending_requested_label}
                </Text>
                <Text selectable style={[styles.linkText, { color: colors.foreground, textAlign: TA }]}>
                  {status.pendingRequest.newLink}
                </Text>
                <Text style={[styles.pendingDate, { color: colors.mutedForeground, textAlign: TA }]}>
                  {t.instapay_pending_requested_date}: {new Date(status.pendingRequest.createdAt).toLocaleDateString()}
                </Text>
              </GlassView>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xl },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  pageTitle: { fontSize: Typography.size.xl, fontFamily: 'Inter_700Bold' },
  center: { alignItems: 'center', paddingVertical: 60 },
  emptyBox: {
    alignItems: 'center', justifyContent: 'center', gap: Spacing.md,
    borderRadius: 20, borderWidth: 1, paddingVertical: 48,
  },
  emptyText: { fontSize: Typography.size.sm, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 24 },
  card: { padding: Spacing.lg },
  cardTitle: { fontSize: Typography.size.md, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  cardDesc: { fontSize: Typography.size.sm, fontFamily: 'Inter_400Regular', marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: 'Inter_400Regular', marginBottom: 2 },
  linkText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  qrWrap: { alignItems: 'center', marginTop: Spacing.lg },
  qrImage: { width: 200, height: 200, borderRadius: Radius.md },
  inlineRow: { gap: Spacing.sm, marginTop: 14 },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },
  submitBtn: { height: 48, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  submitText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: Typography.size.sm },
  pendingCard: { borderWidth: 1 },
  pendingHeaderRow: { alignItems: 'center', gap: Spacing.sm },
  pendingTitle: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },
  pendingDate: { fontSize: Typography.size.xs, fontFamily: 'Inter_400Regular', marginTop: 8 },
});
