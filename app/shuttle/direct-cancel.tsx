import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, AlertTriangle, Check } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints, ApiError } from '@/lib/api';
import { useShuttle } from '@/lib/shuttleContext';

type Params = {
  bookingId: string;
  routeName: string;
  departureTime: string;
};

// TODO: Backend Integration - cancellation reasons list to be confirmed/localised from backend
const CANCEL_REASONS = [
  { key: 'emergency', labelKey: 'cancel_reason_emergency' as const },
  { key: 'vehicle',   labelKey: 'cancel_reason_vehicle'    as const },
  { key: 'illness',   labelKey: 'cancel_reason_illness'    as const },
  { key: 'traffic',   labelKey: 'cancel_reason_traffic'    as const },
  { key: 'other',     labelKey: 'cancel_reason_other'      as const },
];

export default function DirectCancelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const queryClient = useQueryClient();

  const { refetch } = useShuttle();
  const { bookingId, routeName, departureTime } = useLocalSearchParams<Params>();

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const { data: previewData } = useQuery({
    queryKey: ['cancel-preview', bookingId],
    queryFn: () => endpoints.shuttle.cancelPreview(bookingId!),
    enabled: !!bookingId,
    retry: 1,
  });

  const cancelMutation = useMutation({
    mutationFn: () => endpoints.shuttle.cancelBookingFinal(bookingId!, selectedReason!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-driver-trips'] });
      refetch();
      setCancelled(true);
    },
    onError: (err) => {
      const apiErr = err instanceof ApiError ? err : null;
      const body = apiErr?.body as Record<string, unknown> | null;
      const msg =
        (typeof body?.error === 'string' ? body.error : null) ??
        (typeof body?.message === 'string' ? body.message : null) ??
        'فشل إلغاء الرحلة. يرجى المحاولة مجدداً أو التواصل مع الدعم.';
      Alert.alert('', msg);
    },
  });

  const handleConfirmCancel = () => {
    if (!selectedReason) {
      Alert.alert('', 'يرجى اختيار سبب الإلغاء أولاً.');
      return;
    }
    if (cancelMutation.isPending) return;

    Alert.alert(
      'تأكيد الإلغاء النهائي',
      'هل أنت متأكد تماماً من إلغاء هذه الرحلة؟ لا يمكن التراجع عن هذا الإجراء.',
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: 'نعم، إلغاء',
          style: 'destructive',
          onPress: () => cancelMutation.mutate(),
        },
      ]
    );
  };

  if (cancelled) {
    return (
      <View style={[styles.container, styles.successWrap, { backgroundColor: colors.background }]}>
        <View style={[styles.successIcon, { backgroundColor: '#FEF2F2' }]}>
          <Check size={36} color="#DC2626" strokeWidth={2.5} />
        </View>
        <Text style={[{ fontSize: 20, color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>
          تم إلغاء الرحلة
        </Text>
        <Text style={[{ fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 }]}>
          {/* TODO: Backend Integration - Show penalty amount if applicable (from backend response) */}
          تم إشعار الركاب بإلغاء الرحلة. سيقوم الإدارة بإعادة التعيين يدوياً.
        </Text>
        <Pressable
          onPress={() => router.replace('/(shuttle)/' as any)}
          style={[styles.doneBtn, { backgroundColor: '#1e1e28' }]}
        >
          <Text style={[styles.doneBtnText, { fontFamily: 'Inter_700Bold' }]}>العودة للرئيسية</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ChevronLeft size={24} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {t.direct_cancel}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Warning banner */}
        <GlassView style={[styles.warningBanner, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]} borderRadius={16}>
          <AlertTriangle size={20} color="#DC2626" strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={[{ fontSize: 14, color: '#DC2626', fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              إلغاء نهائي للرحلة
            </Text>
            {previewData != null ? (
              <Text style={[{ fontSize: 12, color: '#991B1B', fontFamily: 'Inter_700Bold', marginTop: 3, textAlign: TA }]}>
                {previewData.penaltyAmount > 0
                  ? `غرامة الإلغاء: ${previewData.penaltyAmount} جنيه`
                  : 'لا توجد غرامة على هذا الإلغاء'}
              </Text>
            ) : null}
            <Text style={[{ fontSize: 12, color: '#991B1B', fontFamily: 'Inter_400Regular', marginTop: 3, textAlign: TA }]}>
              سيتم إشعار جميع الركاب وسيقوم الإداريون بإعادة التعيين.
            </Text>
          </View>
        </GlassView>

        {/* Trip summary */}
        <GlassView style={[styles.tripSummary, { marginTop: 16 }]} borderRadius={16}>
          <Text style={[{ fontSize: 15, color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
            {/* TODO: Use translated backend fields (routeNameAr, fromAr, toAr) here */}
            {routeName ?? '—'}
          </Text>
          <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 4, textAlign: TA }]}>
            {departureTime ?? '—'}
          </Text>
        </GlassView>

        {/* Reasons list */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA, marginTop: 28 }]}>
          {t.cancel_reasons_title}
        </Text>
        <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA, marginTop: 4, marginBottom: 14 }]}>
          {/* TODO: Backend Integration - أشهر أسباب الرفض */}
          اختر السبب الأكثر ملاءمةً لإلغاء رحلتك.
        </Text>

        <GlassView style={{ overflow: 'hidden' }} borderRadius={16}>
          {CANCEL_REASONS.map((reason, idx) => {
            const isSelected = selectedReason === reason.key;
            const isLast = idx === CANCEL_REASONS.length - 1;
            return (
              <Pressable
                key={reason.key}
                onPress={() => setSelectedReason(reason.key)}
                style={({ pressed }) => [
                  styles.reasonRow,
                  { flexDirection: R },
                  !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  { backgroundColor: pressed ? colors.secondary + '66' : isSelected ? '#1e1e2808' : 'transparent' },
                ]}
              >
                {/* Radio button */}
                <View style={[styles.radio, { borderColor: isSelected ? '#1e1e28' : colors.border }]}>
                  {isSelected && <View style={[styles.radioDot, { backgroundColor: '#1e1e28' }]} />}
                </View>
                <Text style={[styles.reasonText, { color: colors.foreground, fontFamily: isSelected ? 'Inter_700Bold' : 'Inter_400Regular', textAlign: TA, flex: 1 }]}>
                  {t[reason.labelKey]}
                </Text>
              </Pressable>
            );
          })}
        </GlassView>
      </ScrollView>

      {/* Confirm cancel button */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20), borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          onPress={handleConfirmCancel}
          disabled={cancelMutation.isPending || !selectedReason}
          style={({ pressed }) => [
            styles.confirmBtn,
            {
              backgroundColor: selectedReason ? '#DC2626' : colors.secondary,
              opacity: pressed ? 0.88 : cancelMutation.isPending ? 0.7 : 1,
            },
          ]}
        >
          {cancelMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.confirmBtnText, { color: selectedReason ? '#fff' : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
              {t.confirm_cancel_btn}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17 },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    marginTop: 20,
    borderWidth: 1,
  },
  tripSummary: { padding: 16 },
  sectionTitle: { fontSize: 16 },
  reasonRow: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  reasonText: { fontSize: 14 },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  confirmBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: { fontSize: 15 },
  successWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  doneBtn: { marginTop: 8, height: 50, paddingHorizontal: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { color: '#fff', fontSize: 14 },
});
