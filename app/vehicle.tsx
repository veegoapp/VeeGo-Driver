import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, Truck } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { endpoints } from '@/lib/api';

type VehicleData = { make: string; model: string; year: number; color: string; plate: string };

export default function VehicleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { data: rawData, isLoading, isError } = useQuery({
    queryKey: ['vehicle'],
    queryFn: endpoints.driver.vehicle,
  });

  const v = rawData as VehicleData | undefined;

  const rows = [
    { label: 'Make', value: v?.make ?? '—' },
    { label: 'Model', value: v?.model ?? '—' },
    { label: 'Year', value: v?.year ? String(v.year) : '—' },
    { label: 'Color', value: v?.color ?? '—' },
    { label: 'License plate', value: v?.plate ?? '—' },
    { label: 'Inspection', value: '—' },
    { label: 'Insurance', value: '—' },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 }}>Failed to load vehicle info. Please try again.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Your vehicle</Text>

        <View style={[styles.vehicleHero, { borderColor: colors.border }]}>
          <LinearGradient colors={['rgba(42,58,90,1)', 'rgba(27,31,46,1)']} style={StyleSheet.absoluteFill} />
          <View style={[styles.vehicleHeroOverlay, { backgroundColor: colors.primary + '1A' }]} />
          <View style={styles.vehicleHeroContent}>
            <View style={[styles.vehicleIcon, { backgroundColor: colors.card }]}>
              <Truck size={36} color={colors.primary} strokeWidth={2} />
            </View>
            <View>
              <Text style={[styles.vehicleYear, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{v?.year ?? '—'}</Text>
              <Text style={[styles.vehicleName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{v?.make ?? '—'} {v?.model ?? ''}</Text>
              <Text style={[styles.vehicleColor, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{v?.color ?? '—'}</Text>
            </View>
          </View>
          <View style={styles.plateWrap}>
            <View style={[styles.plate, { backgroundColor: '#F7F8FC' }]}>
              <Text style={[styles.plateText, { color: colors.background, fontFamily: 'Inter_700Bold' }]}>{v?.plate ?? '—'}</Text>
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
  vehicleHeroContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
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
