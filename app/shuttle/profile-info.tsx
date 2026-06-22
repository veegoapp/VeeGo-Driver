import { router } from 'expo-router';
import {
  ArrowLeft,
  ChevronRight,
  Lock,
  Mail,
  Phone,
  User,
  KeyRound,
  Check,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

type DriverMe = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

const BORDER_COLOR = 'rgba(0,0,0,0.08)';

export default function ShuttleProfileInfoScreen() {
  const colors = useColors();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const queryClient = useQueryClient();

  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  const [email, setEmail] = useState('');
  const [emailEditing, setEmailEditing] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);

  const { data: driver, isLoading } = useQuery<DriverMe>({
    queryKey: ['driver'],
    queryFn: endpoints.driver.me as () => Promise<DriverMe>,
  });

  useEffect(() => {
    if (driver?.email) setEmail(driver.email);
  }, [driver?.email]);

  const updateMutation = useMutation({
    mutationFn: (data: { email: string }) =>
      endpoints.driver.updateMe(data) as Promise<DriverMe>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver'] });
      setEmailEditing(false);
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 2500);
    },
    onError: () => {
      Alert.alert('', t.email_save_error);
    },
  });

  const handleSaveEmail = () => {
    if (!email.trim() || email.trim() === driver?.email) {
      setEmailEditing(false);
      return;
    }
    updateMutation.mutate({ email: email.trim() });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: topPad + 8,
            paddingBottom: 40,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
              {t.profile_info_title}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {isLoading ? (
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <>
              {/* ── Locked Fields ─────────────────────────────── */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                {t.personal_info}
              </Text>
              <View style={[styles.card, { borderColor: BORDER_COLOR }]}>
                {/* Name — locked */}
                <View style={[styles.fieldRow, { flexDirection: R }]}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
                    <User size={17} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                      {t.field_full_name}
                    </Text>
                    <Text style={[styles.fieldValue, { color: colors.foreground, textAlign: TA }]}>
                      {driver?.name ?? '—'}
                    </Text>
                  </View>
                  <Lock size={14} color={colors.mutedForeground} strokeWidth={2} />
                </View>

                <View style={[styles.divider, { backgroundColor: BORDER_COLOR }]} />

                {/* Phone — locked */}
                <View style={[styles.fieldRow, { flexDirection: R }]}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
                    <Phone size={17} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                      {t.field_phone}
                    </Text>
                    <Text style={[styles.fieldValue, { color: colors.foreground, textAlign: TA }]}>
                      {driver?.phone ?? '—'}
                    </Text>
                  </View>
                  <Lock size={14} color={colors.mutedForeground} strokeWidth={2} />
                </View>
              </View>

              <Text style={[styles.lockedHint, { color: colors.mutedForeground, textAlign: TA }]}>
                {t.locked_field_hint}
              </Text>

              {/* ── Email — editable ──────────────────────────── */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, textAlign: TA, marginTop: 24 }]}>
                {t.field_email}
              </Text>
              <View style={[styles.card, { borderColor: BORDER_COLOR }]}>
                <View style={[styles.fieldRow, { flexDirection: R }]}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
                    <Mail size={17} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                      {t.field_email}
                    </Text>
                    {emailEditing ? (
                      <TextInput
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
                        style={[
                          styles.emailInput,
                          {
                            color: colors.foreground,
                            borderBottomColor: colors.primary,
                            textAlign: TA,
                          },
                        ]}
                        placeholderTextColor={colors.mutedForeground}
                        placeholder={t.field_email}
                      />
                    ) : (
                      <Text style={[styles.fieldValue, { color: colors.foreground, textAlign: TA }]}>
                        {email || '—'}
                      </Text>
                    )}
                  </View>

                  {emailEditing ? (
                    <Pressable
                      onPress={handleSaveEmail}
                      disabled={updateMutation.isPending}
                      style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                    >
                      {updateMutation.isPending
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Check size={15} color="#fff" strokeWidth={2.5} />
                      }
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => setEmailEditing(true)}
                      style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
                    >
                      <Text style={[styles.editBtnText, { color: colors.primary }]}>
                        {t.edit}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {emailSaved && (
                <Text style={[styles.savedMsg, { color: '#16a34a', textAlign: TA }]}>
                  ✓ {t.email_save_success}
                </Text>
              )}

              {/* ── Change Password ───────────────────────────── */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, textAlign: TA, marginTop: 24 }]}>
                {t.change_password}
              </Text>
              <Pressable
                onPress={() => router.push('/forgot-password' as never)}
                style={({ pressed }) => [
                  styles.card,
                  styles.fieldRow,
                  {
                    flexDirection: R,
                    borderColor: BORDER_COLOR,
                    backgroundColor: pressed ? colors.secondary : colors.card ?? '#fff',
                  },
                ]}
              >
                <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
                  <KeyRound size={17} color={colors.mutedForeground} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldValue, { color: colors.foreground, textAlign: TA }]}>
                    {t.change_password}
                  </Text>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                    {t.change_password_sub}
                  </Text>
                </View>
                <ChevronRight
                  size={18}
                  color={colors.mutedForeground}
                  strokeWidth={2}
                  style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
                />
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pageTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fieldRow: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  emailInput: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    paddingVertical: 3,
    borderBottomWidth: 1.5,
  },
  divider: { height: 1, marginHorizontal: 16 },
  lockedHint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    paddingHorizontal: 4,
    lineHeight: 17,
  },
  actionBtn: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  editBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  savedMsg: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    marginTop: 8,
    paddingHorizontal: 4,
  },
});
