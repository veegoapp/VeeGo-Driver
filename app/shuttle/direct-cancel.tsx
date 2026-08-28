import { showAlert } from '@/lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, AlertTriangle, Check, CircleAlert } from 'lucide-react-native';
import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18nContext';
import { endpoints, ApiError } from '@/lib/api';
import { useShuttle } from '@/lib/shuttleContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { useSplitColors, type SplitColors } from '@/lib/splitTheme';

// "C" split-panel palette — matches the ride/shuttle screens.

type Params = {
  tripId: string;
  routeName: string;
  routeNameAr?: string;
  departureTime: string;
};

export default function DirectCancelScreen() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const S = useSplitColors();
  const styles = useMemo(() => makeStyles(S), [S]);
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = 'row' as const;
  const queryClient = useQueryClient();

  const { refetch } = useShuttle();
  const { tripId, routeName, routeNameAr, departureTime } = useLocalSearchParams<Params>();
  const displayRouteName = (isRTL && routeNameAr) ? routeNameAr : (routeName ?? '—');

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  // null  = field absent from response (unknown)
  // 0     = no penalty applied
  // n > 0 = penalty amount deducted from wallet
  const [penaltyAmount, setPenaltyAmount] = useState<number | null>(null);

  const { data: previewData, isError: previewError, refetch: refetchPreview } = useQuery({
    queryKey: ['trip-cancel-preview', tripId],
    queryFn: () => endpoints.trips.cancelPreview(tripId!),
    enabled: !!tripId,
    retry: 1,
  });

  const { data: cancelReasons = [] } = useQuery({
    queryKey: ['cancellation-reasons'],
    queryFn: endpoints.shuttle.cancellationReasons,
    staleTime: Infinity,
  });

  const cancelMutation = useMutation({
    mutationFn: () => endpoints.trips.cancel(tripId!, selectedReason!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-driver-trips'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      refetch();
      // Store penalty from backend response; keep null if field is absent.
      const raw = data as { penaltyAmount?: unknown } | null;
      const penalty = typeof raw?.penaltyAmount === 'number' ? raw.penaltyAmount : null;
      setPenaltyAmount(penalty);
      setCancelled(true);
    },
    onError: (err) => {
      const apiErr = err instanceof ApiError ? err : null;
      const body = apiErr?.body as Record<string, unknown> | null;
      const msg =
        (typeof body?.error === 'string' ? body.error : null) ??
        (typeof body?.message === 'string' ? body.message : null) ??
        t.cancel_trip_failed;
      showAlert('', msg);
    },
  });

  const handleConfirmCancel = () => {
    if (!selectedReason) {
      showAlert('', t.select_reason_first);
      return;
    }
    if (cancelMutation.isPending) return;

    showAlert(
      t.confirm_final_cancel_title,
      t.confirm_final_cancel_body,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.yes_cancel,
          style: 'destructive',
          onPress: () => cancelMutation.mutate(),
        },
      ]
    );
  };

  if (cancelled) {
    // Derive penalty display from backend response.
    // penaltyAmount === null  → field was absent → show generic success note
    // penaltyAmount === 0     → backend confirmed no penalty
    // penaltyAmount > 0       → real deduction; show exact amount
    const hasPenalty = penaltyAmount !== null && penaltyAmount > 0;
    const penaltyKnown = penaltyAmount !== null;

    const penaltyLine = hasPenalty
      ? t.cancel_penalty_line.replace('{n}', String(penaltyAmount))
      : penaltyKnown
        ? t.no_penalty_line
        : t.passengers_notified;

    return (
      <View style={[styles.container, styles.successWrap]}>
        <View style={[styles.successIconC, { backgroundColor: hasPenalty ? '#FEF2F2' : '#F0FDF4' }]}>
          <Check size={36} color={hasPenalty ? '#DC2626' : '#16a34a'} strokeWidth={2.5} />
        </View>
        <Text style={styles.successTitleC}>{t.trip_cancelled_title}</Text>
        {hasPenalty && (
          <View style={[styles.penaltyBadgeC, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
            <Text style={{ fontSize: Typography.size.lg, color: '#DC2626', fontFamily: 'Inter_700Bold', textAlign: 'center' }}>
              {penaltyAmount} {t.egp}
            </Text>
            <Text style={{ fontSize: Typography.size.xs, color: '#991B1B', fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 2 }}>
              {t.cancellation_penalty_label}
            </Text>
          </View>
        )}
        <Text style={styles.successBodyC}>{penaltyLine}</Text>
        <Pressable
          onPress={() => router.replace('/(shuttle)/home' as any)}
          style={styles.doneBtnC}
        >
          <Text style={styles.doneBtnTextC}>{t.return_home}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Dark hero: back button + the warning itself as the headline */}
      <View style={[styles.heroC, { paddingTop: topPad + 8 }]}>
        <View style={{ flexDirection: R, alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()} style={styles.backBtnC} hitSlop={8}>
            <ChevronLeft size={22} color="#ffffff" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </Pressable>
          <Text style={styles.heroCapC}>{displayRouteName} · {departureTime ?? '—'}</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ flexDirection: R, alignItems: 'center', gap: 12, marginTop: 20 }}>
          <View style={styles.warningIconWrapC}>
            <AlertTriangle size={22} color="#F3C6C2" strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitleC, { textAlign: TA }]}>{t.final_cancel_banner}</Text>
            <Text style={[styles.heroSubC, { textAlign: TA }]}>{t.passengers_admin_reassign}</Text>
          </View>
        </View>

        {/* Penalty readout — receipt style, in the hero */}
        {previewError ? (
          <Pressable onPress={() => refetchPreview()} style={styles.heroReadoutC}>
            <Text style={[styles.heroReadoutTextC, { textAlign: TA }]}>{t.cancel_penalty_check_failed}</Text>
          </Pressable>
        ) : (
          <View style={[styles.heroReadoutC, { flexDirection: R, alignItems: 'center', justifyContent: 'space-between' }]}>
            <Text style={[styles.heroReadoutCapC, { textAlign: TA }]}>{t.cancellation_penalty_label}</Text>
            <Text style={styles.heroReadoutValC}>
              {previewData != null ? Math.max(0, previewData.penaltyAmount ?? 0) : '—'} {t.egp}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Reasons — icon-led selectable chips */}
        <Text style={[styles.sectionTitleC, { textAlign: TA }]}>{t.cancel_reasons_title}</Text>
        <Text style={[styles.sectionSubC, { textAlign: TA, marginTop: Spacing.xs, marginBottom: 14 }]}>
          {t.choose_cancel_reason}
        </Text>

        {cancelReasons.map((reason) => {
          const isSelected = selectedReason === reason.key;
          const label = (isRTL && reason.labelAr) ? reason.labelAr : reason.label;
          return (
            <Pressable
              key={reason.key}
              onPress={() => setSelectedReason(reason.key)}
              style={({ pressed }) => [
                styles.reasonChipC,
                { flexDirection: R },
                isSelected && { borderColor: S.ink },
                { backgroundColor: pressed ? S.surfaceMuted : S.card },
              ]}
            >
              <View style={styles.reasonIconC}>
                <CircleAlert size={18} color={isSelected ? S.ink : S.cap} strokeWidth={2} />
              </View>
              <Text style={[styles.reasonTextC, { fontFamily: isSelected ? 'Inter_700Bold' : 'Inter_400Regular', textAlign: TA, flex: 1 }]}>
                {label}
              </Text>
              <View style={[styles.reasonCheckC, isSelected ? { backgroundColor: S.panel } : { borderWidth: 2, borderColor: '#D3D6DA' }]}>
                {isSelected && <Check size={12} color="#ffffff" strokeWidth={3} />}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Confirm cancel button */}
      <View style={[styles.bottomBarC, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Pressable
          onPress={handleConfirmCancel}
          disabled={cancelMutation.isPending || !selectedReason || previewError}
          style={({ pressed }) => [
            styles.confirmBtnC,
            {
              backgroundColor: selectedReason && !previewError ? '#DC2626' : '#F0F2F3',
              opacity: pressed ? 0.88 : cancelMutation.isPending ? 0.7 : 1,
            },
          ]}
        >
          {cancelMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.confirmBtnTextC, { color: selectedReason ? '#ffffff' : S.cap }]}>
              {t.confirm_cancel_btn}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: S.bg },
  heroC: {
    backgroundColor: S.panel,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 22,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtnC: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  heroCapC: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  heroTitleC: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  heroSubC: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#B7BBC2', marginTop: 2 },
  warningIconWrapC: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(217,45,32,.18)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  heroReadoutC: {
    borderRadius: 16,
    padding: 14,
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroReadoutCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, color: '#8A9096', textTransform: 'uppercase' },
  heroReadoutValC: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#ffffff' },
  heroReadoutTextC: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#F3C6C2' },
  sectionTitleC: { fontSize: Typography.size.md, fontFamily: 'Inter_700Bold', color: S.ink },
  sectionSubC: { fontSize: 13, fontFamily: 'Inter_400Regular', color: S.cap },
  reasonChipC: {
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginBottom: 10,
    backgroundColor: S.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  reasonIconC: { width: 40, height: 40, borderRadius: 12, backgroundColor: S.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reasonCheckC: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  reasonTextC: { fontSize: Typography.size.sm, color: S.ink },
  bottomBarC: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 14,
    backgroundColor: S.bg,
  },
  confirmBtnC: {
    height: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnTextC: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  successWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xxl, gap: Spacing.lg },
  successIconC: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  successTitleC: { fontSize: 20, fontFamily: 'Inter_700Bold', color: S.ink, textAlign: 'center' },
  successBodyC: { fontSize: Typography.size.sm, fontFamily: 'Inter_400Regular', color: S.cap, textAlign: 'center', lineHeight: 22 },
  penaltyBadgeC: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  doneBtnC: { marginTop: Spacing.sm, height: 50, paddingHorizontal: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: S.panel },
  doneBtnTextC: { color: '#ffffff', fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },
  });
}
