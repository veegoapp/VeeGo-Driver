import { router } from 'expo-router';
import { ArrowLeft, Check, Edit3, Mail, Phone, CreditCard, FileText, User } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { AppLoader } from '@/components/ui/AppLoader';
import { endpoints } from '@/lib/api';
import { useI18n } from '@/lib/i18nContext';
import { rtlIconStyle } from '@/lib/rtlUtils';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

type DriverMe = {
  id: string;
  name: string;
  email: string;
  phone: string;
  gender?: 'male' | 'female' | null;
  licenseNumber?: string;
  nationalId?: string;
  rating?: number;
  trips?: number;
};

type Field = { key: keyof Omit<DriverMe, 'id' | 'rating' | 'trips'>; label: string; icon: React.ReactNode; keyboard: 'default' | 'email-address' | 'phone-pad'; editable?: boolean };

export default function PersonalInfoScreen() {
  const colors = useColors();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<DriverMe>>({});

  const [refreshing, setRefreshing] = useState(false);
  const { data: raw, isLoading, refetch } = useQuery<DriverMe>({
    queryKey: ['driver'],
    queryFn: endpoints.driver.me as () => Promise<DriverMe>,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  useEffect(() => {
    if (raw) {
      setForm({
        name: raw.name ?? '',
        email: raw.email ?? '',
        phone: raw.phone ?? '',
        gender: raw.gender ?? null,
        licenseNumber: raw.licenseNumber ?? '',
        nationalId: raw.nationalId ?? '',
      });
    }
  }, [raw]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<DriverMe>) => endpoints.driver.updateMe(data) as Promise<DriverMe>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver'] });
      setEditing(false);
    },
    onError: () => {
      Alert.alert(t.error, t.personal_info_save_err);
    },
  });

  const handleSave = () => {
    const payload: Partial<DriverMe> = {};
    if (form.name && form.name !== raw?.name) payload.name = form.name.trim();
    if (Object.keys(payload).length === 0) { setEditing(false); return; }
    updateMutation.mutate(payload);
  };

  const FIELDS: Field[] = [
    { key: 'name', label: t.field_full_name, icon: <User size={18} color={colors.mutedForeground} strokeWidth={2} />, keyboard: 'default' },
    { key: 'email', label: t.field_email, icon: <Mail size={18} color={colors.mutedForeground} strokeWidth={2} />, keyboard: 'email-address', editable: false },
    { key: 'phone', label: t.field_phone, icon: <Phone size={18} color={colors.mutedForeground} strokeWidth={2} />, keyboard: 'phone-pad', editable: false },
    { key: 'gender', label: t.field_gender, icon: <User size={18} color={colors.mutedForeground} strokeWidth={2} />, keyboard: 'default', editable: false },
    { key: 'licenseNumber', label: t.field_license_number, icon: <CreditCard size={18} color={colors.mutedForeground} strokeWidth={2} />, keyboard: 'default', editable: false },
    { key: 'nationalId', label: t.field_national_id, icon: <FileText size={18} color={colors.mutedForeground} strokeWidth={2} />, keyboard: 'default', editable: false },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 60, paddingHorizontal: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => { if (editing) { setEditing(false); if (raw) setForm({ name: raw.name, email: raw.email, phone: raw.phone, gender: raw.gender ?? null, licenseNumber: raw.licenseNumber, nationalId: raw.nationalId }); } else { router.back(); } }}
              style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
            >
              <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} style={rtlIconStyle(isRTL)} />
            </Pressable>
            <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.personal_info}</Text>
            {!isLoading && (
              <Pressable
                onPress={() => editing ? handleSave() : setEditing(true)}
                disabled={updateMutation.isPending}
                style={[styles.editBtn, { backgroundColor: editing ? colors.primary : colors.glass, borderColor: editing ? colors.primary : colors.border }]}
              >
                {updateMutation.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : editing
                  ? <Check size={18} color="#fff" strokeWidth={2.5} />
                  : <Edit3 size={18} color={colors.foreground} strokeWidth={2} />
                }
              </Pressable>
            )}
          </View>

          {isLoading ? (
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <AppLoader />
            </View>
          ) : (
            <GlassView style={{ marginTop: Spacing.xl }} borderRadius={20}>
              {FIELDS.map((field, i) => {
                const isEditable = editing && field.editable !== false;
                const value = form[field.key] ?? '';
                return (
                  <View
                    key={field.key}
                    style={[
                      styles.fieldRow,
                      i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    ]}
                  >
                    <View style={[styles.fieldIcon, { backgroundColor: colors.secondary + 'B3' }]}>
                      {field.icon}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        {field.label}
                      </Text>
                      {isEditable ? (
                        <TextInput
                          value={value}
                          onChangeText={v => setForm(prev => ({ ...prev, [field.key]: v }))}
                          keyboardType={field.keyboard}
                          autoCapitalize={field.keyboard === 'email-address' ? 'none' : 'words'}
                          style={[
                            styles.fieldInput,
                            {
                              color: colors.foreground,
                              fontFamily: 'Inter_600SemiBold',
                              borderBottomColor: colors.primary,
                            },
                          ]}
                          placeholderTextColor={colors.mutedForeground}
                        />
                      ) : (
                        <Text
                          style={[
                            styles.fieldValue,
                            {
                              color: field.editable === false && editing ? colors.mutedForeground : colors.foreground,
                              fontFamily: 'Inter_600SemiBold',
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {field.key === 'gender'
                            ? (value === 'male' ? t.gender_male : value === 'female' ? t.gender_female : '—')
                            : (value || '—')}
                        </Text>
                      )}
                    </View>
                    {field.editable === false && editing && (
                      <View style={[styles.lockedBadge, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.lockedText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{t.locked_badge}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </GlassView>
          )}

          {editing && (
            <Text style={[styles.editHint, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {t.personal_info_edit_hint}
            </Text>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageTitle: { fontSize: Typography.size.xl, flex: 1 },
  editBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: 14 },
  fieldIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue: { fontSize: 15, marginTop: 2 },
  fieldInput: { fontSize: 15, marginTop: 2, paddingVertical: Spacing.xs, borderBottomWidth: 1.5 },
  lockedBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm },
  lockedText: { fontSize: 10 },
  editHint: { fontSize: Typography.size.xs, textAlign: 'center', marginTop: Spacing.lg, lineHeight: 18 },
});
