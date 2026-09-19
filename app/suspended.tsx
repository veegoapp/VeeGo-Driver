import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AlertOctagon, HeadphonesIcon, Star, Ban } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Shadows } from '@/constants/shadows';

// Rating-triggered suspensions (driver.suspensionReason === 'low_rating_threshold',
// set by driver-rating-suspension.ts on the backend) get their own title/body
// with the actual rating value — everything else (admin/no-show) falls back to
// the generic "contact support" copy this screen always showed.
const LOW_RATING_REASON = 'low_rating_threshold';
const LOW_RATING_BAN_THRESHOLD = '4.0';
const EXCESSIVE_CANCELLATIONS_REASON = 'excessive_cancellations';

export default function SuspendedScreen() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const botPad = insets.bottom;
  const { t } = useI18n();

  const { data: me } = useQuery<any>({
    queryKey: ['driver', 'me'],
    queryFn: endpoints.driver.me,
    retry: 1,
  });

  const isLowRating = me?.suspensionReason === LOW_RATING_REASON;
  const isExcessiveCancellations = me?.suspensionReason === EXCESSIVE_CANCELLATIONS_REASON;
  const title = isLowRating
    ? t.low_rating_suspended_title
    : isExcessiveCancellations
      ? t.driver_excessive_cancellations_title
      : t.account_suspended_title;
  const body = isLowRating
    ? t.low_rating_suspended_body
        .replace('{rating}', typeof me?.rating === 'number' ? me.rating.toFixed(2) : '—')
        .replace('{threshold}', LOW_RATING_BAN_THRESHOLD)
    : isExcessiveCancellations
      ? t.driver_excessive_cancellations_body
      : t.account_suspended_body;

  return (
    <View style={[s.root, { paddingTop: topPad, paddingBottom: botPad + 24 }]}>
      <View style={s.iconWrap}>
        {isLowRating
          ? <Star size={64} color="#ef4444" strokeWidth={1.5} />
          : isExcessiveCancellations
            ? <Ban size={64} color="#ef4444" strokeWidth={1.5} />
            : <AlertOctagon size={64} color="#ef4444" strokeWidth={1.5} />}
      </View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>{body}</Text>
      <Pressable
        style={s.btn}
        onPress={() => router.push({
          pathname: '/support',
          params: { category: 'suspension_appeal', prefill: t.suspension_appeal_prefill.replace('{title}', title) },
        })}
        accessibilityRole="button"
      >
        <HeadphonesIcon size={18} color="#fff" strokeWidth={2} />
        <Text style={s.btnText}>{t.help_support}</Text>
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
    backgroundColor: '#ef4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xxl,
    shadowColor: '#ef4444',
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
});
