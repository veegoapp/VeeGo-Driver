import { AlertTriangle, Clock, RefreshCw } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { type ShuttleBooking } from '@/lib/shuttleContext';
import { useI18n } from '@/lib/i18nContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { formatCountdown, formatWeekRange, COUNTDOWN_EXPIRED } from '@/app/(shuttle)/bookings';

// Extracted verbatim from app/(shuttle)/bookings.tsx — pure presentational
// Wednesday renewal banner, no behavior change.
export function RenewalBanner({
  booking,
  confirmPending,
  declinePending,
  onConfirm,
  onDecline,
}: {
  booking: ShuttleBooking;
  confirmPending: boolean;
  declinePending: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const { t, isRTL } = useI18n();
  const locale = isRTL ? 'ar-EG' : 'en-GB';
  // countdown is display-only — never drives UI state
  const [countdown, setCountdown] = useState(() =>
    formatCountdown(booking.renewalDeadline)
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown(formatCountdown(booking.renewalDeadline));
    }, 1000);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [booking.renewalDeadline]);

  const countdownExpired = countdown === COUNTDOWN_EXPIRED || countdown === '--';

  return (
    <View style={styles.renewalBanner}>
      {/* Header row */}
      <View style={styles.renewalHeaderRow}>
        <AlertTriangle size={16} color="#D97706" strokeWidth={2.5} />
        <Text style={styles.renewalTitle}>{t.weekly_renewal_title}</Text>
        {!countdownExpired && (
          <View style={styles.countdownPill}>
            <Clock size={10} color="#92400E" strokeWidth={2.5} />
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        )}
      </View>

      {/* Route info */}
      <Text style={styles.renewalRouteName} numberOfLines={1}>
        {booking.routeName}
      </Text>
      <Text style={styles.renewalRouteMeta}>
        {booking.departureTime}
        {booking.weekStart ? `  ·  ${formatWeekRange(booking.weekStart, booking.weekEnd, locale)}` : ''}
      </Text>

      <Text style={styles.renewalBody}>
        {t.weekly_renewal_body}
      </Text>

      {/* Actions — always rendered; visibility driven by booking.status === 'pending_renewal' */}
      <View style={styles.renewalActions}>
        <Pressable
          onPress={onConfirm}
          disabled={confirmPending || declinePending}
          style={({ pressed }) => [
            styles.renewalConfirmBtn,
            { opacity: pressed || confirmPending ? 0.8 : 1 },
          ]}
        >
          {confirmPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <RefreshCw size={14} color="#fff" strokeWidth={2.5} />
              <Text style={styles.renewalConfirmLabel}>{t.confirm_renewal_title}</Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={onDecline}
          disabled={confirmPending || declinePending}
          style={({ pressed }) => [
            styles.renewalDeclineBtn,
            { opacity: pressed || declinePending ? 0.8 : 1 },
          ]}
        >
          {declinePending ? (
            <ActivityIndicator size="small" color="#92400E" />
          ) : (
            <Text style={styles.renewalDeclineLabel}>{t.decline_renewal_label}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  renewalBanner: {
    marginTop: Spacing.lg,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D88',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  renewalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  renewalTitle: {
    flex: 1,
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_700Bold',
    color: '#92400E',
    textAlign: 'right',
  },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#FEF3C7',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  countdownText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#92400E',
    fontVariant: ['tabular-nums'],
  },
  renewalRouteName: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#1e1e28',
    textAlign: 'right',
  },
  renewalRouteMeta: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_400Regular',
    color: '#92400E',
    textAlign: 'right',
  },
  renewalBody: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#78350F',
    textAlign: 'right',
    lineHeight: 20,
  },
  renewalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  renewalConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e1e28',
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
  },
  renewalConfirmLabel: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  renewalDeclineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: '#FCD34D88',
  },
  renewalDeclineLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#92400E',
  },
});
