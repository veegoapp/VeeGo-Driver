import { ArrowLeft, ArrowRight, ChevronDown, RefreshCw, X, Info, Search } from 'lucide-react-native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { getFallbackBrands, FALLBACK_COLORS, getFallbackModels, getFallbackYears } from '@/constants/vehicleCatalog';
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18nContext';
import { AppLoader } from '@/components/ui/AppLoader';
import { useService } from '@/lib/serviceContext';
import { endpoints, ApiError } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';

// ─── Types matching backend catalog ──────────────────────────────────────────

type VehicleBrand = {
  id: number;
  name: string;
  nameAr: string | null;
  serviceType: string;
  isChinese: boolean;
};

type VehicleModel = {
  id: number;
  name: string;
  nameAr: string | null;
  seatCapacity: number | null;
};

type VehicleYear = {
  id: number | null;
  year: number;
  pricingCategory: string | null;
};

type VehicleColor = {
  id: number;
  nameEn: string;
  nameAr: string;
  hexCode: string | null;
};

type PickerType = 'brand' | 'model' | 'year' | 'color' | null;

// Maps app ServiceType to the API query param expected by the backend
function toApiServiceType(t: string): string {
  const map: Record<string, string> = {
    CAR: 'car',
    SCOOTER: 'scooter',
    DELIVERY: 'delivery',
    SHUTTLE: 'shuttle',
  };
  return map[t] ?? t.toLowerCase();
}

function formatCategory(raw: string): string {
  if (raw === 'EconomyPlus') return 'Economy Plus';
  return raw; // "Economy" and "Comfort" are already display-ready
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RegisterVehicleScreen() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const botPad = insets.bottom;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { serviceType: rawServiceType } = useService();
  const serviceType = toApiServiceType(rawServiceType); // lowercase for API

  const [brands, setBrands] = useState<VehicleBrand[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [years, setYears] = useState<VehicleYear[]>([]);
  const [colors, setColors] = useState<VehicleColor[]>([]);

  const [selectedBrand, setSelectedBrand] = useState<VehicleBrand | null>(null);
  const [selectedModel, setSelectedModel] = useState<VehicleModel | null>(null);
  const [selectedYear, setSelectedYear] = useState<VehicleYear | null>(null);
  const [selectedColor, setSelectedColor] = useState<VehicleColor | null>(null);

  const [loadingBrands, setLoadingBrands] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingColors, setLoadingColors] = useState(false);

  const [errorBrands, setErrorBrands] = useState(false);
  const [errorBrandsDetail, setErrorBrandsDetail] = useState<string | null>(null);
  const [errorColors, setErrorColors] = useState(false);
  const [errorColorsDetail, setErrorColorsDetail] = useState<string | null>(null);
  const [emptyYears, setEmptyYears] = useState(false);

  const [activePicker, setActivePicker] = useState<PickerType>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchBrands = useCallback(async () => {
    setLoadingBrands(true);
    setErrorBrands(false);
    setErrorBrandsDetail(null);
    try {
      const res = await endpoints.vehicles.brands(serviceType);
      const items = res?.data ?? (Array.isArray(res) ? res as typeof brands : []);
      setBrands(items);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
        console.warn('[register-vehicle] auth error on brands — using static fallback.');
        setBrands(getFallbackBrands(serviceType));
      } else {
        setErrorBrands(true);
        if (err instanceof ApiError) {
          setErrorBrandsDetail(`HTTP ${err.status}: ${err.message}`);
          console.error('[register-vehicle] brands fetch failed:', err.status, err.body);
        } else {
          setErrorBrandsDetail(err instanceof Error ? err.message : String(err));
          console.error('[register-vehicle] brands fetch failed:', err);
        }
      }
    } finally {
      setLoadingBrands(false);
    }
  }, [serviceType]);

  const fetchColors = useCallback(async () => {
    setLoadingColors(true);
    setErrorColors(false);
    setErrorColorsDetail(null);
    try {
      const res = await endpoints.vehicles.colors();
      const items = res?.data ?? (Array.isArray(res) ? res as typeof colors : []);
      setColors(items);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
        console.warn('[register-vehicle] auth error on colors — using static fallback.');
        setColors(FALLBACK_COLORS);
      } else {
        setErrorColors(true);
        if (err instanceof ApiError) {
          setErrorColorsDetail(`HTTP ${err.status}: ${err.message}`);
          console.error('[register-vehicle] colors fetch failed:', err.status, err.body);
        } else {
          setErrorColorsDetail(err instanceof Error ? err.message : String(err));
          console.error('[register-vehicle] colors fetch failed:', err);
        }
      }
    } finally {
      setLoadingColors(false);
    }
  }, []);

  useEffect(() => {
    fetchBrands();
    fetchColors();
  }, [fetchBrands, fetchColors]);

  const fetchModels = useCallback(async (brandId: number) => {
    setLoadingModels(true);
    setModels([]);
    setSelectedModel(null);
    setSelectedYear(null);
    setYears([]);
    setEmptyYears(false);
    try {
      const res = await endpoints.vehicles.models(brandId);
      setModels(res?.data ?? []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        console.warn('[register-vehicle] 403 on models — using static fallback.');
        setModels(getFallbackModels(brandId));
      } else {
        Alert.alert(t.error, t.reg_models_err);
      }
    } finally {
      setLoadingModels(false);
    }
  }, []);

  // Uses the new combined endpoint: GET /vehicles/brands/:brandId/models/:modelId
  // Returns model details + years in a single public request.
  const fetchModelYears = useCallback(async (brandId: number, modelId: number) => {
    setLoadingYears(true);
    setYears([]);
    setSelectedYear(null);
    setEmptyYears(false);
    try {
      const res = await endpoints.vehicles.modelWithYears(brandId, modelId);
      const years = res?.data?.years ?? [];
      if (years.length === 0) setEmptyYears(true);
      setYears(years);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        console.warn('[register-vehicle] 403 on modelWithYears — using static fallback.');
        setYears(getFallbackYears());
      } else {
        console.error('[register-vehicle] modelWithYears failed:', err);
        Alert.alert(t.error, t.reg_years_err);
      }
    } finally {
      setLoadingYears(false);
    }
  }, []);

  // ── Selection handlers ──────────────────────────────────────────────────────

  const handleSelectBrand = (b: VehicleBrand) => {
    setSelectedBrand(b);
    setActivePicker(null);
    fetchModels(b.id);
  };

  const handleSelectModel = (m: VehicleModel) => {
    setSelectedModel(m);
    setActivePicker(null);
    if (selectedBrand) {
      fetchModelYears(selectedBrand.id, m.id);
    }
  };

  const handleSelectYear = (y: VehicleYear) => {
    setSelectedYear(y);
    setActivePicker(null);
  };

  const handleSelectColor = (c: VehicleColor) => {
    setSelectedColor(c);
    setActivePicker(null);
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const canContinue = !!selectedBrand && !!selectedModel && !!selectedYear && !!selectedColor && !submitting;

  const handleSubmit = async () => {
    if (!canContinue) return;
    setSubmitting(true);
    try {
      await endpoints.registration.setVehicleDetails({
        brandId: selectedBrand!.id,
        modelId: selectedModel!.id,
        year: selectedYear!.year,
        color: selectedColor!.nameEn,
        colorId: selectedColor!.id,
      });
      router.push('/register-plate');
    } catch (err) {
      console.log('[register-vehicle] error:', err);
      let msg = 'Failed to save vehicle details. Please try again.';
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        if (body?.error) msg = body.error;
      }
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Picker data ─────────────────────────────────────────────────────────────

  type PickerItem = { key: string; label: string; labelAr?: string | null; sub?: string; hexCode?: string | null };

  const pickerItems: PickerItem[] =
    activePicker === 'brand'
      ? brands.map(b => ({ key: String(b.id), label: b.name, labelAr: b.nameAr }))
      : activePicker === 'model'
      ? models.map(m => ({ key: String(m.id), label: m.name, labelAr: m.nameAr }))
      : activePicker === 'year'
      ? years.map(y => ({
          key: String(y.year),
          label: String(y.year),
          sub: serviceType === 'car' && y.pricingCategory ? formatCategory(y.pricingCategory) : undefined,
        }))
      : activePicker === 'color'
      ? colors.map(c => ({ key: String(c.id), label: c.nameEn, hexCode: c.hexCode }))
      : [];

  const showSearch = activePicker === 'brand' || activePicker === 'model';
  const filteredItems = showSearch && searchQuery.trim()
    ? pickerItems.filter(item => {
        const q = searchQuery.trim().toLowerCase();
        const matchEn = item.label.toLowerCase().includes(q);
        const matchAr = item.labelAr ? item.labelAr.includes(searchQuery.trim()) : false;
        return matchEn || matchAr;
      })
    : pickerItems;

  const openPicker = (type: PickerType) => {
    setSearchQuery('');
    setActivePicker(type);
  };

  const pickerLoading =
    activePicker === 'brand' ? loadingBrands
    : activePicker === 'model' ? loadingModels
    : activePicker === 'year' ? loadingYears
    : activePicker === 'color' ? loadingColors
    : false;

  const pickerTitle =
    activePicker === 'brand' ? t.vehicle_brand
    : activePicker === 'model' ? t.vehicle_model
    : activePicker === 'year' ? t.vehicle_year
    : activePicker === 'color' ? t.vehicle_color
    : '';

  const isItemSelected = (item: PickerItem) => {
    if (activePicker === 'brand') return String(selectedBrand?.id) === item.key;
    if (activePicker === 'model') return String(selectedModel?.id) === item.key;
    if (activePicker === 'year') return String(selectedYear?.year) === item.key;
    if (activePicker === 'color') return String(selectedColor?.id) === item.key;
    return false;
  };

  const handlePickerSelect = (item: PickerItem) => {
    if (activePicker === 'brand') {
      const found = brands.find(b => String(b.id) === item.key);
      if (found) handleSelectBrand(found);
    } else if (activePicker === 'model') {
      const found = models.find(m => String(m.id) === item.key);
      if (found) handleSelectModel(found);
    } else if (activePicker === 'year') {
      const found = years.find(y => String(y.year) === item.key);
      if (found) handleSelectYear(found);
    } else if (activePicker === 'color') {
      const found = colors.find(c => String(c.id) === item.key);
      if (found) handleSelectColor(found);
    }
  };

  // ── Seat capacity chip (shuttle only) ───────────────────────────────────────
  const showSeatCapacity = serviceType === 'shuttle' && !!selectedModel?.seatCapacity;

  return (
    <View style={[s.root, { backgroundColor: '#fafafd' }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad + 120, paddingHorizontal: Spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.replace('/register-service-type')} style={s.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color="#1e1e28" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </TouchableOpacity>

        <View style={s.header}>
          <Text style={[s.step, { textAlign: TA }]}>{t.reg_step_2_of_4}</Text>
          <Text style={[s.title, { textAlign: TA }]}>{t.vehicle_details}</Text>
          <Text style={[s.sub, { textAlign: TA }]}>{t.vehicle_details_sub}</Text>
        </View>

        <View style={s.fields}>
          {/* Brand */}
          <DropdownField
            label={t.vehicle_brand}
            placeholder={t.select_brand}
            value={selectedBrand ? (isRTL && selectedBrand.nameAr ? selectedBrand.nameAr : selectedBrand.name) : null}
            loading={loadingBrands}
            error={errorBrands}
            errorLabel={t.load_failed}
            errorDetail={errorBrandsDetail}
            onPress={() => openPicker('brand')}
            onRetry={fetchBrands}
            isRTL={isRTL}
          />

          {/* Model */}
          <DropdownField
            label={t.vehicle_model}
            placeholder={t.select_model}
            value={selectedModel ? (isRTL && selectedModel.nameAr ? selectedModel.nameAr : selectedModel.name) : null}
            loading={loadingModels}
            error={false}
            errorLabel={t.load_failed}
            onPress={() => selectedBrand ? openPicker('model') : undefined}
            disabled={!selectedBrand}
            isRTL={isRTL}
          />

          {/* Seat capacity chip — shuttle models only */}
          {showSeatCapacity && (
            <View style={[s.infoChip, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Info size={14} color="#3D52D5" />
              <Text style={s.infoChipText}>{t.reg_seat_capacity.replace('{n}', String(selectedModel!.seatCapacity))}</Text>
            </View>
          )}

          {/* Year */}
          <DropdownField
            label={t.vehicle_year}
            placeholder={emptyYears ? t.reg_no_years : t.select_year}
            value={selectedYear ? String(selectedYear.year) : null}
            loading={loadingYears}
            error={false}
            errorLabel={t.load_failed}
            onPress={() => (selectedModel && years.length > 0) ? setActivePicker('year') : undefined}
            disabled={!selectedModel || emptyYears}
            isRTL={isRTL}
          />

          {/* Color */}
          <DropdownField
            label={t.vehicle_color}
            placeholder={t.select_color}
            value={selectedColor?.nameEn ?? null}
            loading={loadingColors}
            error={errorColors}
            errorLabel={t.load_failed}
            errorDetail={errorColorsDetail}
            colorHex={selectedColor?.hexCode ?? undefined}
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
              <Text style={s.continueBtnText}>{t.reg_vehicle_continue}</Text>
              <ArrowRight size={18} color="white" strokeWidth={2} />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Picker bottom sheet */}
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

          {showSearch && (
            <View style={s.searchWrap}>
              <Search size={16} color="#9e9ea8" strokeWidth={2} style={s.searchIcon} />
              <TextInput
                style={[s.searchInput, { textAlign: isRTL ? 'right' : 'left' }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={isRTL ? 'ابحث...' : 'Search...'}
                placeholderTextColor="#c3c3cc"
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />
            </View>
          )}

          {pickerLoading ? (
            <View style={s.sheetLoader}>
              <AppLoader />
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={s.sheetLoader}>
              <Text style={s.sheetEmpty}>
                {searchQuery ? (isRTL ? 'لا توجد نتائج' : 'No results') : activePicker === 'year' ? t.reg_year_no_eligible : t.reg_no_options}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={item => item.key}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = isItemSelected(item);
                const displayLabel = isRTL && item.labelAr ? item.labelAr : item.label;
                return (
                  <Pressable
                    style={({ pressed }) => [s.sheetItem, selected && s.sheetItemSelected, pressed && { opacity: 0.7 }]}
                    onPress={() => handlePickerSelect(item)}
                  >
                    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 }}>
                      {item.hexCode !== undefined && (
                        <View style={[s.colorSwatch, { backgroundColor: item.hexCode ?? '#ccc' }]} />
                      )}
                      <Text style={[s.sheetItemText, selected && s.sheetItemTextSelected]}>{displayLabel}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                      {item.sub && (
                        <View style={s.categoryBadge}>
                          <Text style={s.categoryBadgeText}>{item.sub}</Text>
                        </View>
                      )}
                      {selected && <View style={s.sheetItemDot} />}
                    </View>
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 380 }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── DropdownField ─────────────────────────────────────────────────────────────

function DropdownField({
  label, placeholder, value, loading, error, errorLabel, errorDetail,
  colorHex, onPress, onRetry, disabled, isRTL,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  loading: boolean;
  error: boolean;
  errorLabel: string;
  errorDetail?: string | null;
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
        <>
          <Pressable style={[s.dropdownRow, s.dropdownError]} onPress={onRetry} hitSlop={4}>
            <RefreshCw size={16} color="#c0392b" strokeWidth={2} />
            <Text style={[s.dropdownErrorText, { flex: 1 }]}>{errorLabel}</Text>
          </Pressable>
          {errorDetail ? (
            <Text style={{ fontSize: 11, color: '#c0392b', fontFamily: 'Inter_400Regular', marginTop: Spacing.xs, paddingHorizontal: Spacing.xs }}>
              {errorDetail}
            </Text>
          ) : null}
        </>
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
            {colorHex ? <View style={[s.colorDot, { backgroundColor: colorHex }]} /> : null}
            {loading ? (
              <ActivityIndicator size="small" color="#5e5e72" style={{ marginRight: Spacing.sm }} />
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: 'white',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e5e5ea',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: Shadows.small.elevation,
  },
  header: { marginTop: Spacing.xl, marginBottom: 28, gap: Spacing.sm },
  step: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: '#5e5e72', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Inter_600SemiBold' },
  title: { fontSize: 34, fontWeight: Typography.weight.bold, color: '#1e1e28', letterSpacing: -1.2, lineHeight: 40, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: Typography.size.sm, color: '#5e5e72', lineHeight: 20, fontFamily: 'Inter_400Regular' },
  fields: { gap: Spacing.lg },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: '#1e1e28', letterSpacing: 0.3, fontFamily: 'Inter_600SemiBold' },
  dropdownRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'white', borderRadius: 18, height: 54, paddingHorizontal: Spacing.lg,
    borderWidth: 1, borderColor: '#e5e5ea',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  dropdownDisabled: { backgroundColor: '#f8f8fa', borderColor: '#ebebf0' },
  dropdownError: { backgroundColor: '#fff5f5', borderColor: '#fca5a5', gap: 10 },
  dropdownErrorText: { fontSize: 13, color: '#c0392b', fontFamily: 'Inter_400Regular' },
  dropdownInner: { flex: 1, alignItems: 'center', gap: Spacing.sm },
  dropdownValue: { fontSize: Typography.size.sm, color: '#1e1e28', fontFamily: 'Inter_400Regular' },
  dropdownPlaceholder: { color: '#c3c3cc' },
  colorDot: { width: 16, height: 16, borderRadius: Radius.sm, borderWidth: 1, borderColor: '#e5e5ea' },
  infoChip: {
    alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#eef0fd', borderRadius: 14, borderWidth: 1, borderColor: '#c7cdf7',
  },
  infoChipText: { fontSize: 13, color: '#3D52D5', fontWeight: Typography.weight.medium, fontFamily: 'Inter_500Medium', flex: 1 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg,
    backgroundColor: 'rgba(250,250,253,0.95)',
    borderTopWidth: 1, borderTopColor: '#e5e5ea',
  },
  continueBtn: {
    height: 56, borderRadius: 20, backgroundColor: '#1e1e28',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: Shadows.large.elevation,
  },
  continueBtnDisabled: { opacity: 0.35 },
  continueBtnText: { color: 'white', fontSize: 15, fontWeight: Typography.weight.semibold, fontFamily: 'Inter_600SemiBold' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: Spacing.md,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 12,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e5ea', alignSelf: 'center', marginBottom: Spacing.md },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.xl, marginBottom: Spacing.sm,
    backgroundColor: '#f5f5f8', borderRadius: 14, paddingHorizontal: 14, height: 44,
    borderWidth: 1, borderColor: '#e5e5ea',
  },
  searchIcon: { flexShrink: 0 },
  searchInput: { flex: 1, fontSize: Typography.size.sm, color: '#1e1e28', fontFamily: 'Inter_400Regular' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f5',
  },
  sheetTitle: { fontSize: Typography.size.md, fontWeight: Typography.weight.bold, color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  sheetLoader: { height: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  sheetEmpty: { fontSize: Typography.size.sm, color: '#5e5e72', fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f7f7fa',
  },
  sheetItemSelected: { backgroundColor: '#f2f4fe' },
  sheetItemText: { fontSize: 15, color: '#1e1e28', fontFamily: 'Inter_400Regular' },
  sheetItemTextSelected: { fontWeight: Typography.weight.semibold, color: '#55c49a', fontFamily: 'Inter_600SemiBold' },
  sheetItemDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#55c49a' },
  categoryBadge: {
    backgroundColor: '#f0f4ff', borderRadius: 99, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: '#d0d8f8',
  },
  categoryBadgeText: { fontSize: 11, color: '#55c49a', fontWeight: Typography.weight.semibold, fontFamily: 'Inter_600SemiBold' },
  colorSwatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#e5e5ea' },
});
