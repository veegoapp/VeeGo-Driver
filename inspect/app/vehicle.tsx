import { router } from 'expo-router';
import { ArrowLeft, Truck } from 'lucide-react-native';
import React from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
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
import { rtlIconStyle } from '@/lib/rtlUtils';
import { endpoints } from '@/lib/api';
import type { DriverProfileEnriched } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { BORDER_COLOR } from '@/constants/uiConstants';

type VehicleEndpointData = {
  id?: number | string;
  plateLetters?: string | null;
  plateNumbers?: string | null;
  plateNumber?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | string | null;
  color?: string | null;
  colorAr?: string | null;
  type?: string | null;
  vehicleType?: string | null;
  // Backend wraps vehicle details inside a nested key
  vehicle?: {
    make?: string | null;
    model?: string | null;
    year?: number | string | null;
    color?: string | null;
    colorAr?: string | null;
    plate?: string | null;
  } | null;
};

export default function VehicleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const {
    data: vehicleData,
    isLoading: vehicleLoading,
    refetch: refetchVehicle,
    isRefetching,
  } = useQuery<VehicleEndpointData | null>({
    queryKey: ['driver', 'vehicle'],
    queryFn: endpoints.driver.vehicle as () => Promise<VehicleEndpointData | null>,
    retry: 1,
  });

  const { data: profile, isLoading: profileLoading } = useQuery<DriverProfileEnriched>({
    queryKey: ['driver', 'profile'],
    queryFn: endpoints.driver.profile,
    retry: 1,
  });

  const isLoading = vehicleLoading || profileLoading;

  // Backend returns { vehicle: {...} | null, vehicleType: string } — unwrap the nested vehicle
  const nestedVehicle = vehicleData?.vehicle ?? null;
  const profileVehicle = profile?.vehicle ?? null;

  const make = vehicleData?.make ?? nestedVehicle?.make ?? profileVehicle?.make ?? null;
  const model = vehicleData?.model ?? nestedVehicle?.model ?? profileVehicle?.model ?? null;
  const year = vehicleData?.year ?? nestedVehicle?.year ?? profileVehicle?.year ?? null;
  const color = vehicleData?.color ?? nestedVehicle?.color ?? profileVehicle?.color ?? null;
  const colorAr = vehicleData?.colorAr ?? nestedVehicle?.colorAr ?? profileVehicle?.colorAr ?? null;
  const vehicleType = vehicleData?.type ?? vehicleData?.vehicleType ?? null;

  // Plate: prefer combined plateLetters+plateNumbers, fallback to plateNumber, then profile
  const plate = (() => {
    if (vehicleData?.plateLetters && vehicleData?.plateNumbers) {
      return `${vehicleData.plateLetters} ${vehicleData.plateNumbers}`;
    }
    if (vehicleData?.plateNumber) return vehicleData.plateNumber;
    return nestedVehicle?.plate ?? profileVehicle?.plate ?? null;
  })();

  const displayColor = isRTL && colorAr ? colorAr : (color ?? null);

  const rows: { label: string; value: string | null }[] = [
    { label: t.vehicle_brand, value: make },
    { label: t.vehicle_model, value: model },
    { label: t.vehicle_year, value: year ? String(year) : null },
    { label: t.vehicle_color, value: displayColor },
    { label: t.vehicle_plate, value: plate },
    ...(vehicleType ? [{ label: t.vehicle_label, value: vehicleType }] : []),
  ];

  const hasNoData = !isLoading && !make && !model && !plate;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 8,
          paddingBottom: 40,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetchVehicle}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={[styles.headerRow, { flexDirection: R }]}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
          >
            <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} style={rtlIconStyle(isRTL)} />
          </Pressable>
          <Text style={[styles.pageTitle, { color: colors.foreground, textAlign: TA, flex: 1 }]}>
            {t.vehicle_label}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <AppLoader />
          </View>
        ) : hasNoData ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.secondary, borderColor: BORDER_COLOR }]}>
            <Truck size={36} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {t.load_failed}
            </Text>
          </View>
        ) : (
          <>
            {/* Hero card */}
            <View style={[styles.heroCard, { backgroundColor: '#1e1e28' }]}>
              <View style={styles.heroIconWrap}>
                <Truck size={40} color="#fff" strokeWidth={1.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroMake} numberOfLines={1}>
                  {make ?? '—'}
                </Text>
                <Text style={styles.heroModel} numberOfLines={1}>
                  {model ?? '—'}
                </Text>
                {plate && (
                  <View style={styles.platePill}>
                    <Text style={styles.plateText}>{plate}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Details list */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, textAlign: TA }]}>
              {t.vehicle_details}
            </Text>
            <View style={[styles.card, { borderColor: BORDER_COLOR }]}>
              {rows.map((row, i) => (
                <View key={row.label}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: BORDER_COLOR }]} />}
                  <View style={[styles.detailRow, { flexDirection: R }]}>
                    <Text style={[styles.detailLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                      {row.label}
                    </Text>
                    <Text style={[styles.detailValue, { color: row.value ? colors.foreground : colors.mutedForeground, textAlign: isRTL ? 'left' : 'right' }]}>
                      {row.value ?? '—'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xl },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  pageTitle: { fontSize: Typography.size.xl, fontFamily: 'Inter_700Bold' },
  center: { alignItems: 'center', paddingVertical: 60 },
  emptyBox: {
    alignItems: 'center', justifyContent: 'center', gap: Spacing.md,
    borderRadius: 20, borderWidth: 1, paddingVertical: 48, marginTop: Spacing.sm,
  },
  emptyText: { fontSize: Typography.size.sm, fontFamily: 'Inter_400Regular' },
  heroCard: {
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  heroIconWrap: {
    width: 72, height: 72, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroMake: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroModel: {
    fontSize: Typography.size.xl,
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    marginTop: 2,
  },
  platePill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: Spacing.xs,
  },
  plateText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 3,
  },
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
  detailRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    gap: Spacing.sm,
  },
  detailLabel: { fontSize: Typography.size.sm, fontFamily: 'Inter_400Regular' },
  detailValue: { fontSize: Typography.size.sm, fontFamily: 'Inter_600SemiBold', flex: 1 },
  divider: { height: 1, marginHorizontal: Spacing.lg },
});
