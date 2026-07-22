import { router } from 'expo-router';
import {
  ArrowLeft,
  ChevronRight,
  Lock,
  Mail,
  Phone,
  User,
  KeyRound,
} from 'lucide-react-native';
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { BORDER_COLOR } from '@/constants/uiConstants';

type DriverMe = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export default function ShuttleProfileInfoScreen() {
  const colors = useColors();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  const { data: driver, isLoading } = useQuery<DriverMe>({
    queryKey: ['driver'],
    queryFn: endpoints.driver.me as () => Promise<DriverMe>,
  });

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
              <AppLoader />
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

                <View style={[styles.divider, { backgroundColor: BORDER_COLOR }]} />

                {/* Email — locked */}
                <View style={[styles.fieldRow, { flexDirection: R }]}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
                    <Mail size={17} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                      {t.field_email}
                    </Text>
                    <Text style={[styles.fieldValue, { color: colors.foreground, textAlign: TA }]}>
                      {driver?.email ?? '—'}
                    </Text>
                  </View>
                  <Lock size={14} color={colors.mutedForeground} strokeWidth={2} />
                </View>
              </View>

              <Text style={[styles.lockedHint, { color: colors.mutedForeground, textAlign: TA }]}>
                {t.locked_field_hint}
              </Text>

              {/* ── Change Password ───────────────────────────── */}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, textAlign: TA, marginTop: Spacing.xl }]}>
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
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pageTitle: { fontSize: Typography.size.xl, fontFamily: 'Inter_700Bold' },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fieldRow: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
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
  divider: { height: 1, marginHorizontal: Spacing.lg },
  lockedHint: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    paddingHorizontal: Spacing.xs,
    lineHeight: 17,
  },
});
