import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ArrowRight, X } from 'lucide-react-native';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';

type Params = {
  bookingId: string;
  routeName: string;
  departureTime: string;
  fromStation: string;
  toStation: string;
};

export default function TripCancelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  const { bookingId, routeName, departureTime, fromStation, toStation } = useLocalSearchParams<Params>();

  const handleRefer = () => {
    router.push({
      pathname: '/shuttle/referral-request' as any,
      params: { bookingId, routeName, departureTime, fromStation, toStation },
    });
  };

  const handleDirectCancel = () => {
    router.push({
      pathname: '/shuttle/direct-cancel' as any,
      params: { bookingId, routeName, departureTime },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ChevronLeft size={24} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {t.cancel_trip_action}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        {/* Trip summary */}
        <GlassView style={[styles.tripSummary, { marginTop: 24 }]} borderRadius={16}>
          <View style={[{ flexDirection: R, alignItems: 'center', gap: 10 }]}>
            <View style={[styles.summaryDot, { backgroundColor: '#1e1e28' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 15, color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                {/* TODO: Use translated backend fields (routeNameAr, fromAr, toAr) here */}
                {routeName ?? '—'}
              </Text>
              <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 3, textAlign: TA }]}>
                {departureTime ?? '—'} · {fromStation ?? '—'} → {toStation ?? '—'}
              </Text>
            </View>
          </View>
        </GlassView>

        {/* Choice title */}
        <Text style={[styles.choiceTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA, marginTop: 28 }]}>
          {t.cancel_options_title}
        </Text>

        <View style={{ gap: 12, marginTop: 16 }}>
          {/* Option A: Refer to another driver */}
          <Pressable
            onPress={handleRefer}
            style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
          >
            <GlassView style={[styles.optionCard, { flexDirection: R }]} borderRadius={20}>
              <View style={[styles.optionIcon, { backgroundColor: '#1e1e2812' }]}>
                <Text style={{ fontSize: 24 }}>🔄</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                  {t.refer_to_driver}
                </Text>
                <Text style={[styles.optionSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                  {t.refer_to_driver_sub}
                </Text>
              </View>
              <ArrowRight size={18} color={colors.mutedForeground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </GlassView>
          </Pressable>

          {/* Option B: Direct cancellation */}
          <Pressable
            onPress={handleDirectCancel}
            style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
          >
            <GlassView style={[styles.optionCard, { flexDirection: R, borderColor: '#FCA5A580', borderWidth: 1 }]} borderRadius={20}>
              <View style={[styles.optionIcon, { backgroundColor: '#FEF2F2' }]}>
                <X size={22} color="#DC2626" strokeWidth={2.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: '#DC2626', fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                  {t.direct_cancel}
                </Text>
                <Text style={[styles.optionSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                  {t.direct_cancel_sub}
                </Text>
              </View>
              <ArrowRight size={18} color="#DC2626" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </GlassView>
          </Pressable>
        </View>
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
  tripSummary: { padding: 16 },
  summaryDot: { width: 10, height: 10, borderRadius: 5 },
  choiceTitle: { fontSize: 18 },
  optionCard: {
    alignItems: 'center',
    gap: 14,
    padding: 18,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { fontSize: 16 },
  optionSub: { fontSize: 13, marginTop: 3, lineHeight: 18 },
});
