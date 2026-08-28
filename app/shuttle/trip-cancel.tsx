import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, RefreshCw, X, AlertCircle } from 'lucide-react-native';
import React, { useMemo } from 'react';
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
import { useSplitColors, type SplitColors } from '@/lib/splitTheme';

// "C" split-panel palette — matches the ride/shuttle screens.

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
  const S = useSplitColors();
  const styles = useMemo(() => makeStyles(S), [S]);
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = 'row' as const;

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
      {/* Dark hero: back button + cancel headline + penalty readout */}
      <View style={[styles.heroC, { paddingTop: topPad + 8 }]}>
        <View style={{ flexDirection: R, alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()} style={styles.backBtnC} hitSlop={8}>
            <ChevronLeft size={22} color="#ffffff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </Pressable>
          <Text style={styles.heroCapC}>
            {routeName ?? '—'} · {departureTime ?? '—'}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <Text style={[styles.heroTitleC, { textAlign: TA }]}>{t.cancel_trip_action}?</Text>
        <Text style={[styles.heroSubC, { textAlign: TA }]}>{fromStation ?? '—'} → {toStation ?? '—'}</Text>

        {/* Penalty readout — receipt style, right in the hero */}
        {previewError ? (
          <Pressable onPress={() => refetchPreview()} style={styles.heroReadoutC}>
            <View style={{ flexDirection: R, alignItems: 'center', gap: 10 }}>
              <AlertCircle size={16} color="#F3C6C2" strokeWidth={2} />
              <Text style={[styles.heroReadoutTextC, { textAlign: TA, flex: 1 }]}>{t.cancel_penalty_check_failed}</Text>
            </View>
          </Pressable>
        ) : previewLoading ? (
          <View style={[styles.heroReadoutC, { flexDirection: R, alignItems: 'center', gap: 10 }]}>
            <ActivityIndicator size="small" color="#B7BBC2" />
            <Text style={styles.heroReadoutTextC}>{t.checking_penalty}</Text>
          </View>
        ) : previewData != null && (
          <View style={[
            styles.heroReadoutC,
            { flexDirection: R, alignItems: 'center', justifyContent: 'space-between', backgroundColor: hasPenalty ? 'rgba(217,45,32,.16)' : 'rgba(61,220,151,.12)', borderColor: hasPenalty ? 'rgba(217,45,32,.35)' : 'rgba(61,220,151,.35)' },
          ]}>
            <View>
              <Text style={[styles.heroReadoutCapC, { color: hasPenalty ? '#F3C6C2' : '#3DDC97', textAlign: TA }]}>
                {t.cancellation_penalty_label}
              </Text>
              {previewData.minutesUntilDeparture != null && (
                <Text style={[styles.heroReadoutSubC, { textAlign: TA }]}>{previewData.minutesUntilDeparture}m left</Text>
              )}
            </View>
            <Text style={[styles.heroReadoutValC, { color: hasPenalty ? '#F3C6C2' : '#3DDC97' }]}>
              {hasPenalty ? previewData.penaltyAmount : 0} {t.egp}
            </Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 22 }}>
        <Text style={[styles.choiceTitleC, { textAlign: TA, marginBottom: 10 }]}>{t.cancel_options_title}</Text>

        <View style={{ gap: Spacing.md }}>
          {/* Option A: Refer to another driver — the recommended path */}
          <Pressable
            onPress={handleRefer}
            style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
          >
            <View style={[styles.optionCardC, { flexDirection: R }]}>
              <View style={styles.optionIconC}>
                <RefreshCw size={22} color={S.ink} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: R, alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.optionTitleC, { textAlign: TA }]}>{t.refer_to_driver}</Text>
                  <View style={styles.recommendedTagC}>
                    <Text style={styles.recommendedTagTextC}>{t.recommended_label}</Text>
                  </View>
                </View>
                <Text style={[styles.optionSubC, { textAlign: TA }]}>{t.refer_to_driver_sub}</Text>
              </View>
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
            <View style={[styles.optionCardC, { flexDirection: R }]}>
              <View style={[styles.optionIconC, { backgroundColor: '#FEF2F2' }]}>
                <X size={22} color="#DC2626" strokeWidth={2.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitleC, { color: '#DC2626', textAlign: TA }]}>{t.direct_cancel}</Text>
                <Text style={[styles.optionSubC, { textAlign: TA }]}>{t.direct_cancel_sub}</Text>
              </View>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: S.bg },
  heroC: {
    backgroundColor: S.ink,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 22,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtnC: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  heroCapC: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  heroTitleC: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#ffffff', marginTop: 22 },
  heroSubC: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#B7BBC2', marginTop: 4 },
  heroReadoutC: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'transparent',
  },
  heroReadoutCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, textTransform: 'uppercase' },
  heroReadoutSubC: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#B7BBC2', marginTop: 2 },
  heroReadoutValC: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  heroReadoutTextC: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#F3C6C2' },
  choiceTitleC: { fontSize: Typography.size.lg, fontFamily: 'Inter_700Bold', color: S.ink },
  optionCardC: {
    alignItems: 'center',
    gap: 14,
    padding: 18,
    backgroundColor: S.card,
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
  optionTitleC: { fontSize: Typography.size.md, fontFamily: 'Inter_700Bold', color: S.ink },
  optionSubC: { fontSize: 13, fontFamily: 'Inter_400Regular', color: S.cap, marginTop: 5, lineHeight: 18 },
  recommendedTagC: { backgroundColor: '#DDF4EB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  recommendedTagTextC: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#0E9F8E' },
  });
}
