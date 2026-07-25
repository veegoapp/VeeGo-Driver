import { router } from 'expo-router';
import { ArrowLeft, Mail, Phone, User } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
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
};

type Field = {
  key: keyof Omit<DriverMe, 'id'>;
  label: string;
  icon: React.ReactNode;
};

export default function PersonalInfoScreen() {
  const colors = useColors();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

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

  const TA = isRTL ? 'right' as const : 'left' as const;

  const FIELDS: Field[] = [
    { key: 'name',   label: t.field_full_name, icon: <User size={18} color={colors.mutedForeground} strokeWidth={2} /> },
    { key: 'email',  label: t.field_email,     icon: <Mail size={18} color={colors.mutedForeground} strokeWidth={2} /> },
    { key: 'phone',  label: t.field_phone,     icon: <Phone size={18} color={colors.mutedForeground} strokeWidth={2} /> },
    { key: 'gender', label: t.field_gender,    icon: <User size={18} color={colors.mutedForeground} strokeWidth={2} /> },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 60, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
          >
            <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} style={rtlIconStyle(isRTL)} />
          </Pressable>
          <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {t.personal_info}
          </Text>
          {/* Spacer keeps title centred */}
          <View style={styles.headerSpacer} />
        </View>

        {/* Fields */}
        {isLoading ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <AppLoader />
          </View>
        ) : (
          <GlassView style={{ marginTop: Spacing.xl }} borderRadius={20}>
            {FIELDS.map((field, i) => {
              const value = raw?.[field.key] ?? '';
              const display =
                field.key === 'gender'
                  ? value === 'male'
                    ? t.gender_male
                    : value === 'female'
                      ? t.gender_female
                      : '—'
                  : (value || '—');
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
                    <Text
                      style={[styles.fieldValue, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}
                      numberOfLines={1}
                    >
                      {display}
                    </Text>
                  </View>
                </View>
              );
            })}
          </GlassView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  headerRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  backBtn:       { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerSpacer:  { width: 40 },
  pageTitle:     { fontSize: Typography.size.xl, flex: 1 },
  fieldRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: 14 },
  fieldIcon:     { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  fieldLabel:    { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue:    { fontSize: 15, marginTop: 2 },
});
