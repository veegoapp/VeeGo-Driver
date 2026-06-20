import { router } from 'expo-router';
import { ArrowLeft, Pencil, Truck } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import type { DriverProfileEnriched } from '@/lib/api';

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

const BORDER_COLOR = 'rgba(0,0,0,0.08)';

export default function VehicleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const queryClient = useQueryClient();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [inputYear, setInputYear] = useState('');
  const [inputColor, setInputColor] = useState('');

  const updateMutation = useMutation({
    mutationFn: (data: { year?: number; color?: string }) =>
      endpoints.driver.updateVehicle(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver', 'vehicle'] });
      queryClient.invalidateQueries({ queryKey: ['driver', 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['driver'] });
      setEditModalVisible(false);
    },
    onError: () => {
      Alert.alert('خطأ', 'فشل حفظ البيانات، حاول تاني.');
    },
  });

  const handleSave = () => {
    const yearNum = inputYear ? parseInt(inputYear, 10) : undefined;
    if (yearNum && (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1)) {
      Alert.alert('خطأ', 'السنة غير صحيحة');
      return;
    }
    const payload: { year?: number; color?: string } = {};
    if (yearNum) payload.year = yearNum;
    if (inputColor.trim()) payload.color = inputColor.trim();
    if (!payload.year && !payload.color) return;
    updateMutation.mutate(payload);
  };

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
  const hasMissingInfo = !isLoading && !hasNoData && (!year || !color);

  const openEditModal = () => {
    setInputYear(year ? String(year) : '');
    setInputColor(color ?? '');
    setEditModalVisible(true);
  };

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
            <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.pageTitle, { color: colors.foreground, textAlign: TA, flex: 1 }]}>
            {t.vehicle_label}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
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

            {/* Banner: prompt driver to complete missing info */}
            {hasMissingInfo && (
              <Pressable
                onPress={openEditModal}
                style={[styles.missingBanner, { backgroundColor: '#D5B23D22', borderColor: '#D5B23D' }]}
              >
                <Pencil size={16} color="#D5B23D" strokeWidth={2} />
                <Text style={[styles.missingBannerText, { color: '#D5B23D', textAlign: TA }]}>
                  بيانات العربية ناقصة — اضغط لإكمال السنة واللون
                </Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>تحديث بيانات العربية</Text>

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>سنة الصنع</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
              placeholder="مثال: 2020"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              value={inputYear}
              onChangeText={setInputYear}
              maxLength={4}
            />

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>اللون</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
              placeholder="مثال: أبيض"
              placeholderTextColor={colors.mutedForeground}
              value={inputColor}
              onChangeText={setInputColor}
            />

            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setEditModalVisible(false)}
                style={[styles.modalBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>إلغاء</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={updateMutation.isPending}
                style={[styles.modalBtn, { backgroundColor: '#2d2d42', flex: 1 }]}
              >
                {updateMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>حفظ</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  pageTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  center: { alignItems: 'center', paddingVertical: 60 },
  emptyBox: {
    alignItems: 'center', justifyContent: 'center', gap: 12,
    borderRadius: 20, borderWidth: 1, paddingVertical: 48, marginTop: 8,
  },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  heroCard: {
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
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
    fontSize: 22,
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    marginTop: 2,
  },
  platePill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  detailRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  detailLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  detailValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1 },
  divider: { height: 1, marginHorizontal: 16 },
  missingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 16,
  },
  missingBannerText: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 12,
  },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: 'Inter_400Regular',
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: {
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20,
  },
});
