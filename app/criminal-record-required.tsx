import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { HeadphonesIcon, ShieldAlert, UploadCloud } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import type { DriverProfileEnriched } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Shadows } from '@/constants/shadows';

// Shown when the driver's account is suspended specifically for a missing/
// unapproved criminal record certificate (driver.suspensionReason ===
// 'criminal_record_required') — distinct from the generic /suspended screen
// (which is for admin/no-show suspensions and only offers "contact support").
// This screen instead routes the driver straight to the fix: upload the
// document. The driver is NOT locked out of the rest of the app from here —
// only going online is blocked server-side until the document is approved —
// so unlike /suspended this screen doesn't need to be a dead end.
export default function CriminalRecordRequiredScreen() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const botPad = insets.bottom;
  const { t } = useI18n();

  const { data: profile } = useQuery<DriverProfileEnriched>({
    queryKey: ['driver', 'profile'],
    queryFn: endpoints.driver.profile,
    retry: 1,
  });
  const trips = profile?.trips ?? 0;

  return (
    <View style={[s.root, { paddingTop: topPad, paddingBottom: botPad + 24 }]}>
      <View style={s.iconWrap}>
        <ShieldAlert size={64} color="#dc2626" strokeWidth={1.5} />
      </View>
      <Text style={s.title}>{t.criminal_record_required_title}</Text>
      <Text style={s.body}>{t.criminal_record_required_body.replace('{trips}', String(trips))}</Text>
      <Pressable
        style={s.btn}
        onPress={() => router.push('/documents')}
        accessibilityRole="button"
      >
        <UploadCloud size={18} color="#fff" strokeWidth={2} />
        <Text style={s.btnText}>{t.criminal_record_required_upload_btn}</Text>
      </Pressable>
      <Pressable
        style={s.secondaryBtn}
        onPress={() => router.push('/support')}
        accessibilityRole="button"
      >
        <HeadphonesIcon size={16} color="#5e5e72" strokeWidth={2} />
        <Text style={s.secondaryBtnText}>{t.help_support}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff5f5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.lg,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: Typography.weight.bold,
    color: '#1e1e28',
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#5e5e72',
    lineHeight: 24,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  btn: {
    marginTop: Spacing.lg,
    height: 56,
    borderRadius: 20,
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xxl,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: Shadows.large.elevation,
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: Typography.weight.bold,
    fontFamily: 'Inter_700Bold',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  secondaryBtnText: {
    color: '#5e5e72',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
});
