import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, Truck } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import type { DriverProfileEnriched } from '@/lib/api';

type BaseProfile = {
  name: string;
  vehicle?: { make: string; model: string; plate: string; year?: number; color?: string } | null;
};

export default function VehicleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { data: enriched, isLoading: enrichedLoading, isError: enrichedError } = useQuery<DriverProfileEnriched>({
    queryKey: ['driver', 'profile'],
    queryFn: endpoints.driver.profile,
    retry: 1,
  });

  const { data: base, isLoading: baseLoading } = useQuery<BaseProfile>({
    queryKey: ['driver'],
    queryFn: endpoints.driver.me as () => Promise<BaseProfile>,
    enabled: enrichedError,
  });

  const isLoading = enrichedLoading || (enrichedError && baseLoading);
  const vehicle = enriched?.vehicle ?? base?.vehicle ?? null;

  const make = vehicle?.make ?? null;
  const model = vehicle?.model ?? null;
  const plate = vehicle?.plate ?? null;
  const year = (vehicle as { year?: number } | null)?.year ?? null;
  const color = (vehicle as { color?: string } | null)?.color ?? null;

  const rows = [
    { label: t.vehicle_brand, value: make ?? '—' },
    { label: t.vehicle_model, value: model ?? '—' },
    { label: t.vehicle_year, value: year ? String(year) : '—' },
    { label: t.vehicle_color, value: color ?? '—' },
    { label: t.vehicle_plate, value: plate ?? '—' },
    { label: t.vehicle_inspection, value: '—' },
    { label: t.vehicle_insurance, value: '—' },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.vehicle_label}</Text>

        <View style={[styles.vehicleHero, { borderColor: colors.border }]}>
          <LinearGradient colors={['rgba(42,58,90,1)', 'rgba(27,31,46,1)']} style={StyleSheet.absoluteFill} />
          <View style={[styles.vehicleHeroOverlay, { backgroundColor: colors.primary + '1A' }]} />
          <View style={[styles.vehicleHeroContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.vehicleIcon, { backgroundColor: colors.card }]}>
              <Truck size={36} color={colors.primary} strokeWidth={2} />
            </View>
            <View>
              <Text style={[styles.vehicleYear, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{year ?? '—'}</Text>
              <Text style={[styles.vehicleName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{make ?? '—'} {model ?? ''}</Text>
              <Text style={[styles.vehicleColor, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{color ?? '—'}</Text>
            </View>
          </View>
          <View style={styles.plateWrap}>
            <View style={[styles.plate, { backgroundColor: '#F7F8FC' }]}>
              <Text style={[styles.plateText, { color: colors.background, fontFamily: 'Inter_700Bold' }]}>{plate ?? '—'}</Text>
            </View>
          </View>
        </View>

        <GlassView style={{ marginTop: 24 }} borderRadius={20}>
          {rows.map((row, i) => (
            <View key={row.label} style={[styles.detailRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{row.label}</Text>
              <Text style={[styles.detailValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{row.value}</Text>
            </View>
          ))}
        </GlassView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageTitle: { fontSize: 24, marginTop: 24, marginBottom: 20 },
  vehicleHero: { borderRadius: 24, padding: 24, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  vehicleHeroOverlay: { position: 'absolute', inset: 0, borderRadius: 24 },
  vehicleHeroContent: { alignItems: 'center', gap: 16 },
  vehicleIcon: { width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  vehicleYear: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  vehicleName: { fontSize: 24, marginTop: 2 },
  vehicleColor: { fontSize: 14, marginTop: 2 },
  plateWrap: { marginTop: 20 },
  plate: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  plateText: { fontSize: 20, letterSpacing: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  detailLabel: { fontSize: 14 },
  detailValue: { fontSize: 14 },
});
