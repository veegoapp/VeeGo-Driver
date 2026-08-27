import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ArrowRight, X, AlertCircle } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

// "C" split-panel palette — matches the ride/shuttle screens.
const C_BG = '#EEF0F2';
const C_INK = '#14151A';
const C_CAP = '#9AA0A6';

type Params = {
  // The specific trip being cancelled or referred — both paths act on this
  // one trip only, not the driver's whole week.
  tripId: string;
  routeName: string;
  departureTime: string;
  fromStation: string;
  toStation: string;
};

export default function TripCancelScreen() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  const { tripId, routeName, departureTime, fromStation, toStation } = useLocalSearchParams<Params>();

  const { data: previewData, isLoading: previewLoading, isError: previewError, refetch: refetchPreview } = useQuery({
    queryKey: ['trip-cancel-preview', tripId],
    queryFn: () => endpoints.trips.cancelPreview(tripId!),
    enabled: !!tripId,
    retry: 1,
    staleTime: 60_000,
  });

  const hasPenalty = previewData != null && (previewData.penaltyAmount ?? 0) > 0;

  const handleRefer = () => {
    router.push({
      pathname: '/shuttle/referral-request' as any,
      params: { tripId, routeName, departureTime, fromStation, toStation },
    });
  };

  const handleDirectCancel = () => {
    router.push({
      pathname: '/shuttle/direct-cancel' as any,
      params: { tripId, routeName, departureTime },
    });
  };

  return (
    <View style={styles.container}>
      {/* Dark hero: back button + trip identity */}
      <View style={[styles.heroC, { paddingTop: topPad + 8 }]}>
        <View style={{ flexDirection: R, alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()} style={styles.backBtnC} hitSlop={8}>
            <ChevronLeft size={22} color="#ffffff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </Pressable>
          <Text style={styles.heroCapC}>{t.cancel_trip_action}</Text>
          <View style={{ width: 36 }} />
        </View>
        <Text style={[styles.heroTitleC, { textAlign: TA }]}>{routeName ?? '—'}</Text>
        <Text style={[styles.heroSubC, { textAlign: TA }]}>
          {departureTime ?? '—'} · {fromStation ?? '—'} → {toStation ?? '—'}
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        {/* Penalty preview failed — the driver must not be able to confirm a
            cancellation with zero indication a wallet deduction is coming,
            so Direct Cancel below is blocked until this succeeds. */}
        {previewError && (
          <Pressable onPress={() => refetchPreview()}>
            <View style={[styles.penaltyBannerC, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
              <AlertCircle size={16} color="#DC2626" strokeWidth={2} />
              <Text style={[styles.penaltyBannerTextC, { color: '#DC2626', textAlign: TA }]}>
                {t.cancel_penalty_check_failed}
              </Text>
            </View>
          </Pressable>
        )}

        {/* Penalty preview banner */}
        {(previewLoading || previewData != null) && (
          <View style={[
            styles.penaltyBannerC,
            { backgroundColor: hasPenalty ? '#FEF2F2' : '#F0FDF4', borderColor: hasPenalty ? '#FCA5A5' : '#86efac' },
          ]}>
            {previewLoading ? (
              <ActivityIndicator size="small" color={C_CAP} />
            ) : (
              <>
                <AlertCircle size={16} color={hasPenalty ? '#DC2626' : '#16a34a'} strokeWidth={2} />
                <Text style={[styles.penaltyBannerTextC, { color: hasPenalty ? '#DC2626' : '#15803d', textAlign: TA }]}>
                  {hasPenalty
                    ? t.cancel_penalty_preview.replace('{n}', String(previewData!.penaltyAmount))
                    : t.no_penalty_line}
                </Text>
                {previewData?.minutesUntilDeparture != null && (
                  <Text style={{ fontSize: 11, color: hasPenalty ? '#991B1B' : '#166534', fontFamily: 'Inter_400Regular' }}>
                    {previewData.minutesUntilDeparture}m left
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {/* Choice title */}
        <Text style={[styles.choiceTitleC, { textAlign: TA, marginTop: 20 }]}>{t.cancel_options_title}</Text>

        <View style={{ gap: Spacing.md, marginTop: Spacing.lg }}>
          {/* Option A: Refer to another driver */}
          <Pressable
            onPress={handleRefer}
            style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
          >
            <View style={[styles.optionCardC, { flexDirection: R }]}>
              <View style={styles.optionIconC}>
                <Text style={{ fontSize: 24 }}>🔄</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitleC, { textAlign: TA }]}>{t.refer_to_driver}</Text>
                <Text style={[styles.optionSubC, { textAlign: TA }]}>{t.refer_to_driver_sub}</Text>
                {/* No penalty for referral */}
                {previewData != null && (
                  <Text style={[{ fontSize: 11, color: '#15803d', fontFamily: 'Inter_700Bold', marginTop: 5, textAlign: TA }]}>
                    {t.no_penalty_referral}
                  </Text>
                )}
              </View>
              <ArrowRight size={18} color={C_CAP} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </View>
          </Pressable>

          {/* Option B: Direct cancellation — blocked while the penalty
              preview hasn't succeeded, so a wallet deduction can never be a
              surprise. */}
          <Pressable
            onPress={previewError ? undefined : handleDirectCancel}
            disabled={previewError}
            style={({ pressed }) => [{ opacity: previewError ? 0.5 : pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
          >
            <View style={[styles.optionCardC, { flexDirection: R, borderColor: '#FCA5A580', borderWidth: 1 }]}>
              <View style={[styles.optionIconC, { backgroundColor: '#FEF2F2' }]}>
                <X size={22} color="#DC2626" strokeWidth={2.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitleC, { color: '#DC2626', textAlign: TA }]}>{t.direct_cancel}</Text>
                <Text style={[styles.optionSubC, { textAlign: TA }]}>{t.direct_cancel_sub}</Text>
                {/* Penalty amount sourced from backend */}
                {previewLoading && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                    <ActivityIndicator size="small" color="#DC2626" />
                    <Text style={{ fontSize: 11, color: C_CAP, fontFamily: 'Inter_400Regular' }}>
                      {t.checking_penalty}
                    </Text>
                  </View>
                )}
                {!previewLoading && hasPenalty && (
                  <View style={[styles.penaltyTagC, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={{ fontSize: Typography.size.xs, color: '#DC2626', fontFamily: 'Inter_700Bold' }}>
                      {previewData!.penaltyAmount} {t.egp} {t.penalty_label}
                    </Text>
                  </View>
                )}
                {!previewLoading && previewData != null && !hasPenalty && (
                  <Text style={[{ fontSize: 11, color: '#15803d', fontFamily: 'Inter_700Bold', marginTop: 5, textAlign: TA }]}>
                    {t.no_penalty_preview}
                  </Text>
                )}
              </View>
              <ArrowRight size={18} color="#DC2626" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C_BG },
  heroC: {
    backgroundColor: C_INK,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  backBtnC: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  heroCapC: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  heroTitleC: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#ffffff', marginTop: 16 },
  heroSubC: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#B7BBC2', marginTop: 4 },
  penaltyBannerC: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    minHeight: 40,
  },
  penaltyBannerTextC: { fontSize: 13, fontFamily: 'Inter_700Bold', flex: 1 },
  choiceTitleC: { fontSize: Typography.size.lg, fontFamily: 'Inter_700Bold', color: C_INK },
  optionCardC: {
    alignItems: 'center',
    gap: 14,
    padding: 18,
    backgroundColor: '#ffffff',
    borderRadius: 20,
  },
  optionIconC: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F2F3',
  },
  optionTitleC: { fontSize: Typography.size.md, fontFamily: 'Inter_700Bold', color: C_INK },
  optionSubC: { fontSize: 13, fontFamily: 'Inter_400Regular', color: C_CAP, marginTop: 3, lineHeight: 18 },
  penaltyTagC: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
    marginTop: 6,
  },
});
