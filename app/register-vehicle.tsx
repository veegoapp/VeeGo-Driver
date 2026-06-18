import { ArrowLeft, ArrowRight, ChevronDown, RefreshCw, X } from 'lucide-react-native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

type Brand = { id: string; name: string };
type VehicleModel = { id: string; name: string };
type Color = { id: string; name: string; hex?: string };
type PickerType = 'brand' | 'model' | 'year' | 'color' | null;

function normalizeId(v: unknown): string {
  return String(v ?? '');
}


function normalizeList(raw: unknown): { id: string; name: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (typeof item === 'object' && item !== null) {
      const o = item as Record<string, unknown>;
      return { id: normalizeId(o.id ?? o._id), name: String(o.name ?? o.label ?? '') };
    }
    return { id: String(item), name: String(item) };
  });
}

export default function RegisterVehicleScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;

  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [colors, setColors] = useState<Color[]>([]);

  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [selectedModel, setSelectedModel] = useState<VehicleModel | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState<Color | null>(null);

  const [loadingBrands, setLoadingBrands] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingColors, setLoadingColors] = useState(false);

  const [errorBrands, setErrorBrands] = useState(false);
  const [errorColors, setErrorColors] = useState(false);

  const [activePicker, setActivePicker] = useState<PickerType>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchBrands = useCallback(async () => {
    setLoadingBrands(true);
    setErrorBrands(false);
    try {
      const raw = await endpoints.vehicles.brands();
      setBrands(normalizeList(raw));
    } catch {
      setErrorBrands(true);
    } finally {
      setLoadingBrands(false);
    }
  }, []);

  const fetchColors = useCallback(async () => {
    setLoadingColors(true);
    setErrorColors(false);
    try {
      const raw = await endpoints.vehicles.colors();
      setColors(normalizeList(raw));
    } catch {
      setErrorColors(true);
    } finally {
      setLoadingColors(false);
    }
  }, []);

  useEffect(() => {
    fetchBrands();
    fetchColors();
  }, [fetchBrands, fetchColors]);

  const fetchModels = useCallback(async (brandId: string) => {
    setLoadingModels(true);
    setModels([]);
    setSelectedModel(null);
    setSelectedYear(null);
    setYears([]);
    try {
      const raw = await endpoints.vehicles.models(brandId);
      setModels(normalizeList(raw));
    } catch {
      Alert.alert('Error', 'Could not load models. Please try again.');
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const handleSelectBrand = (b: Brand) => {
    setSelectedBrand(b);
    setActivePicker(null);
    fetchModels(b.id);
  };

  const fetchYears = useCallback(async (modelId: string) => {
    setLoadingYears(true);
    setYears([]);
    setSelectedYear(null);
    try {
      const res = await endpoints.vehicles.years(modelId);
      const items = res?.data ?? [];
      setYears(items.map(i => i.year));
    } catch {
      Alert.alert('Error', 'Could not load years. Please try again.');
    } finally {
      setLoadingYears(false);
    }
  }, []);

  const handleSelectModel = (m: VehicleModel) => {
    setSelectedModel(m);
    setActivePicker(null);
    fetchYears(m.id);
  };

  const handleSelectYear = (y: number) => {
    setSelectedYear(y);
    setActivePicker(null);
  };

  const handleSelectColor = (c: Color) => {
    setSelectedColor(c);
    setActivePicker(null);
  };

  const canContinue = !!selectedBrand && !!selectedModel && !!selectedYear && !!selectedColor && !submitting;

  const handleSubmit = async () => {
    if (!canContinue) return;
    setSubmitting(true);
    try {
      const colorIdNum = parseInt(selectedColor!.id, 10);
      await endpoints.registration.setVehicleDetails({
        brandId: selectedBrand!.id,
        modelId: selectedModel!.id,
        year: String(selectedYear!),
        color: selectedColor!.name,
        ...(Number.isFinite(colorIdNum) ? { colorId: colorIdNum } : {}),
      });
      router.push('/register-documents');
    } catch {
      Alert.alert('Error', 'Could not save vehicle information. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const pickerItems: { label: string; key: string }[] = activePicker === 'brand'
    ? brands.map(b => ({ label: b.name, key: b.id }))
    : activePicker === 'model'
    ? models.map(m => ({ label: m.name, key: m.id }))
    : activePicker === 'year'
    ? years.map(y => ({ label: String(y), key: String(y) }))
    : activePicker === 'color'
    ? colors.map(c => ({ label: c.name, key: c.id }))
    : [];

  const pickerLoading = activePicker === 'brand' ? loadingBrands
    : activePicker === 'model' ? loadingModels
    : activePicker === 'year' ? loadingYears
    : activePicker === 'color' ? loadingColors
    : false;

  const pickerTitle = activePicker === 'brand' ? t.vehicle_brand
    : activePicker === 'model' ? t.vehicle_model
    : activePicker === 'year' ? t.vehicle_year
    : activePicker === 'color' ? t.vehicle_color
    : '';

  const handlePickerSelect = (key: string) => {
    if (activePicker === 'brand') {
      const found = brands.find(b => b.id === key);
      if (found) handleSelectBrand(found);
    } else if (activePicker === 'model') {
      const found = models.find(m => m.id === key);
      if (found) handleSelectModel(found);
    } else if (activePicker === 'year') {
      handleSelectYear(parseInt(key, 10));
    } else if (activePicker === 'color') {
      const found = colors.find(c => c.id === key);
      if (found) handleSelectColor(found);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: '#fafafd' }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad + 120, paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color="#1e1e28" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </TouchableOpacity>

        <View style={s.header}>
          <Text style={[s.step, { textAlign: TA }]}>Step 2 of 3</Text>
          <Text style={[s.title, { textAlign: TA }]}>{t.vehicle_details}</Text>
          <Text style={[s.sub, { textAlign: TA }]}>{t.vehicle_details_sub}</Text>
        </View>

        <View style={s.fields}>
          <DropdownField
            label={t.vehicle_brand}
            placeholder={t.select_brand}
            value={selectedBrand?.name ?? null}
            loading={loadingBrands}
            error={errorBrands}
            errorLabel={t.load_failed}
            onPress={() => setActivePicker('brand')}
            onRetry={fetchBrands}
            isRTL={isRTL}
          />

          <DropdownField
            label={t.vehicle_model}
            placeholder={t.select_model}
            value={selectedModel?.name ?? null}
            loading={loadingModels}
            error={false}
            errorLabel={t.load_failed}
            onPress={() => selectedBrand ? setActivePicker('model') : undefined}
            disabled={!selectedBrand}
            isRTL={isRTL}
          />

          <DropdownField
            label={t.vehicle_year}
            placeholder={t.select_year}
            value={selectedYear ? String(selectedYear) : null}
            loading={loadingYears}
            error={false}
            errorLabel={t.load_failed}
            onPress={() => selectedModel ? setActivePicker('year') : undefined}
            disabled={!selectedModel}
            isRTL={isRTL}
          />

          <DropdownField
            label={t.vehicle_color}
            placeholder={t.select_color}
            value={selectedColor?.name ?? null}
            loading={loadingColors}
            error={errorColors}
            errorLabel={t.load_failed}
            colorHex={selectedColor?.hex}
            onPress={() => setActivePicker('color')}
            onRetry={fetchColors}
            isRTL={isRTL}
          />
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: botPad + 24 }]}>
        <TouchableOpacity
          style={[s.continueBtn, !canContinue && s.continueBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canContinue}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={s.continueBtnText}>Continue to documents</Text>
              <ArrowRight size={18} color="white" strokeWidth={2} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={activePicker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActivePicker(null)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setActivePicker(null)} />
        <View style={[s.sheet, { paddingBottom: botPad + 16 }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{pickerTitle}</Text>
            <Pressable onPress={() => setActivePicker(null)} hitSlop={8}>
              <X size={20} color="#5e5e72" strokeWidth={2} />
            </Pressable>
          </View>
          {pickerLoading ? (
            <View style={s.sheetLoader}>
              <ActivityIndicator size="large" color="#1e1e28" />
            </View>
          ) : pickerItems.length === 0 ? (
            <View style={s.sheetLoader}>
              <Text style={s.sheetEmpty}>No options available</Text>
            </View>
          ) : (
            <FlatList
              data={pickerItems}
              keyExtractor={item => item.key}
              renderItem={({ item }) => {
                const isSelected = activePicker === 'brand'
                  ? selectedBrand?.id === item.key
                  : activePicker === 'model'
                  ? selectedModel?.id === item.key
                  : activePicker === 'year'
                  ? String(selectedYear) === item.key
                  : activePicker === 'color'
                  ? selectedColor?.id === item.key
                  : false;

                return (
                  <Pressable
                    style={({ pressed }) => [s.sheetItem, isSelected && s.sheetItemSelected, pressed && { opacity: 0.7 }]}
                    onPress={() => handlePickerSelect(item.key)}
                  >
                    <Text style={[s.sheetItemText, isSelected && s.sheetItemTextSelected]}>{item.label}</Text>
                    {isSelected && <View style={s.sheetItemDot} />}
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 360 }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function DropdownField({
  label, placeholder, value, loading, error, errorLabel,
  colorHex, onPress, onRetry, disabled, isRTL,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  loading: boolean;
  error: boolean;
  errorLabel: string;
  colorHex?: string;
  onPress: () => void;
  onRetry?: () => void;
  disabled?: boolean;
  isRTL: boolean;
}) {
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  return (
    <View style={s.fieldWrap}>
      <Text style={[s.fieldLabel, { textAlign: TA }]}>{label}</Text>
      {error ? (
        <Pressable
          style={[s.dropdownRow, s.dropdownError]}
          onPress={onRetry}
          hitSlop={4}
        >
          <RefreshCw size={16} color="#c0392b" strokeWidth={2} />
          <Text style={[s.dropdownErrorText, { flex: 1 }]}>{errorLabel}</Text>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [
            s.dropdownRow,
            disabled && s.dropdownDisabled,
            pressed && !disabled && { opacity: 0.75 },
          ]}
          onPress={disabled ? undefined : onPress}
          disabled={disabled || loading}
        >
          <View style={[s.dropdownInner, { flexDirection: R }]}>
            {colorHex ? (
              <View style={[s.colorDot, { backgroundColor: colorHex }]} />
            ) : null}
            {loading ? (
              <ActivityIndicator size="small" color="#5e5e72" style={{ marginRight: 8 }} />
            ) : (
              <Text
                style={[s.dropdownValue, !value && s.dropdownPlaceholder, { textAlign: TA, flex: 1 }]}
                numberOfLines={1}
              >
                {value ?? placeholder}
              </Text>
            )}
          </View>
          <ChevronDown size={16} color={disabled ? '#c3c3cc' : '#5e5e72'} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: 'white',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e5e5ea',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  header: { marginTop: 24, marginBottom: 28, gap: 8 },
  step: { fontSize: 12, fontWeight: '600', color: '#5e5e72', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Inter_600SemiBold' },
  title: { fontSize: 34, fontWeight: '700', color: '#1e1e28', letterSpacing: -1.2, lineHeight: 40, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 14, color: '#5e5e72', lineHeight: 20, fontFamily: 'Inter_400Regular' },
  fields: { gap: 16 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#1e1e28', letterSpacing: 0.3, fontFamily: 'Inter_600SemiBold' },
  dropdownRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'white', borderRadius: 18, height: 54, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#e5e5ea',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  dropdownDisabled: { backgroundColor: '#f8f8fa', borderColor: '#ebebf0' },
  dropdownError: { backgroundColor: '#fff5f5', borderColor: '#fca5a5', gap: 10 },
  dropdownErrorText: { fontSize: 13, color: '#c0392b', fontFamily: 'Inter_400Regular' },
  dropdownInner: { flex: 1, alignItems: 'center', gap: 8 },
  dropdownValue: { fontSize: 14, color: '#1e1e28', fontFamily: 'Inter_400Regular' },
  dropdownPlaceholder: { color: '#c3c3cc' },
  colorDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e5ea' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 24, paddingTop: 16,
    backgroundColor: 'rgba(250,250,253,0.95)',
    borderTopWidth: 1, borderTopColor: '#e5e5ea',
  },
  continueBtn: {
    height: 56, borderRadius: 20, backgroundColor: '#1e1e28',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8,
  },
  continueBtnDisabled: { opacity: 0.35 },
  continueBtnText: { color: 'white', fontSize: 15, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingHorizontal: 0,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e5ea',
    alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f5',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  sheetLoader: { height: 120, alignItems: 'center', justifyContent: 'center' },
  sheetEmpty: { fontSize: 14, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f7f7fa',
  },
  sheetItemSelected: { backgroundColor: '#f2f4fe' },
  sheetItemText: { fontSize: 15, color: '#1e1e28', fontFamily: 'Inter_400Regular' },
  sheetItemTextSelected: { fontWeight: '600', color: '#3D52D5', fontFamily: 'Inter_600SemiBold' },
  sheetItemDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3D52D5' },
});
