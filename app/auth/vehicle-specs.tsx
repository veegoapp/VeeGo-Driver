import { ArrowRight, ChevronDown, Check, Search, Navigation, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState, useMemo, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

// ── API-driven vehicle data types ──────────────────────────────────────────────

type ApiBrand = { id: number; name: string; models: { id: number; name: string }[] };
type ApiColor = { id: number; name: string; nameAr?: string };

const COLOR_HEX_MAP: Record<string, string> = {
  white: '#FFFFFF', black: '#1e1e28', silver: '#C0C0C0', gray: '#808080',
  red: '#E53935', blue: '#1565C0', green: '#388E3C', beige: '#D4B896',
  brown: '#795548', gold: '#FFC107', orange: '#F57C00', maroon: '#880E4F',
  navy: '#0D1B4B', pearl: '#F5F0E8',
};
const getColorHex = (name: string) => COLOR_HEX_MAP[name.toLowerCase()] ?? '#9E9E9E';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS: string[] = Array.from({ length: CURRENT_YEAR - 1989 }, (_, i) =>
  String(CURRENT_YEAR - i)
);

// ── SearchableDropdown ─────────────────────────────────────────────────────────

type DropdownItem = { id: string; label: string; sublabel?: string; colorHex?: string };

interface SearchableDropdownProps {
  placeholder: string;
  value: string | null;
  items: DropdownItem[];
  onSelect: (item: DropdownItem) => void;
  disabled?: boolean;
  isRTL?: boolean;
}

function SearchableDropdown({
  placeholder,
  value,
  items,
  onSelect,
  disabled = false,
  isRTL = false,
}: SearchableDropdownProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.sublabel?.toLowerCase().includes(q) ?? false),
    );
  }, [query, items]);

  const handleSelect = useCallback(
    (item: DropdownItem) => {
      onSelect(item);
      setOpen(false);
      setQuery('');
    },
    [onSelect],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  return (
    <>
      <TouchableOpacity
        style={[dd.trigger, disabled && dd.triggerDisabled, value && dd.triggerFilled]}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={disabled ? 1 : 0.8}
      >
        <View style={[dd.triggerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {value ? (
            <Text style={[dd.triggerValue, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
              {value}
            </Text>
          ) : (
            <Text style={[dd.triggerPlaceholder, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
              {placeholder}
            </Text>
          )}
          <ChevronDown size={16} color={disabled ? '#c3c3cc' : '#5e5e72'} />
        </View>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        <TouchableOpacity style={dd.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={[dd.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Sheet handle */}
          <View style={dd.handle} />

          {/* Header */}
          <View style={[dd.sheetHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={[dd.sheetTitle, { textAlign: isRTL ? 'right' : 'left', flex: 1 }]}>
              {placeholder}
            </Text>
            <TouchableOpacity onPress={handleClose} style={dd.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color="#5e5e72" />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={[dd.searchWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Search size={15} color="#5e5e72" style={{ flexShrink: 0 }} />
            <TextInput
              style={[dd.searchInput, { textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={t.search_placeholder}
              placeholderTextColor="#c3c3cc"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>

          {/* List */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
            ListEmptyComponent={
              <View style={dd.empty}>
                <Text style={dd.emptyText}>{t.no_results_dropdown}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const selected = item.label === value;
              return (
                <TouchableOpacity
                  style={[dd.listItem, selected && dd.listItemSelected, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.75}
                >
                  {item.colorHex && (
                    <View style={[dd.colorSwatch, { backgroundColor: item.colorHex, borderWidth: item.colorHex === '#FFFFFF' ? 1 : 0, borderColor: '#e5e5ea' }]} />
                  )}
                  <Text style={[dd.listItemText, selected && dd.listItemTextSelected, { textAlign: isRTL ? 'right' : 'left', flex: 1 }]}>
                    {item.label}
                  </Text>
                  {selected && <Check size={16} color="#1e1e28" />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function VehicleSpecsScreen() {
  const insets = useSafeAreaInsets();
  const { isRTL, t } = useI18n();
  const topPad = insets.top;
  const botPad = insets.bottom;

  const [selectedBrand, setSelectedBrand] = useState<ApiBrand | null>(null);
  const [selectedModel, setSelectedModel] = useState<{ id: number; name: string } | null>(null);
  const [selectedYear, setSelectedYear]   = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<ApiColor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: metaData } = useQuery({
    queryKey: ['vehicles-meta'],
    queryFn: endpoints.vehicles.meta,
    staleTime: Infinity,
  });

  const brandItems: DropdownItem[] = useMemo(
    () => (metaData?.brands ?? []).map((b) => ({ id: String(b.id), label: b.name })),
    [metaData?.brands],
  );

  const modelItems: DropdownItem[] = useMemo(
    () => (selectedBrand?.models ?? []).map((m) => ({ id: String(m.id), label: m.name })),
    [selectedBrand],
  );

  const yearItems: DropdownItem[] = useMemo(
    () => YEARS.map((y) => ({ id: y, label: y })),
    [],
  );

  const colorItems: DropdownItem[] = useMemo(
    () => (metaData?.colors ?? []).map((c) => ({
      id: String(c.id),
      label: isRTL ? (c.nameAr ?? c.name) : c.name,
      colorHex: getColorHex(c.name),
    })),
    [metaData?.colors, isRTL],
  );

  const canContinue =
    !!selectedBrand && !!selectedModel && !!selectedYear && !!selectedColor && !loading;

  const handleContinue = async () => {
    if (!canContinue) return;
    setError(null);
    setLoading(true);
    try {
      await endpoints.registration.setVehicleDetails({
        brandId:  selectedBrand!.id,
        modelId:  selectedModel!.id,
        year:     parseInt(selectedYear!, 10),
        color:    selectedColor!.name,
        colorId:  selectedColor!.id,
      });
    } catch {
      // Non-blocking: proceed even if the endpoint isn't live yet
    } finally {
      setLoading(false);
    }
    router.replace('/(tabs)/index');
  };

  return (
    <View style={s.root}>
      <LinearGradient colors={['#f4f4fb', 'transparent']} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 20, paddingBottom: botPad + 120, paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={s.logoRow}>
          <View style={s.logoIcon}>
            <Navigation size={18} color="white" />
          </View>
          <Text style={s.logoText}>Vee<Text style={{ color: '#3D52D5' }}>Go</Text></Text>
        </View>

        {/* Header */}
        <View style={s.header}>
          <Text style={[s.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t.vehicle_specs_title}</Text>
          <Text style={[s.sub, { textAlign: isRTL ? 'right' : 'left' }]}>
            {t.vehicle_specs_sub}
          </Text>
        </View>

        {/* Fields */}
        <View style={s.fields}>
          {/* Brand */}
          <View style={s.fieldBlock}>
            <Text style={[s.label, { textAlign: isRTL ? 'right' : 'left' }]}>
              {t.manufacturer_label}
            </Text>
            <SearchableDropdown
              placeholder={t.select_make}
              value={selectedBrand?.name ?? null}
              items={brandItems}
              isRTL={isRTL}
              onSelect={(item) => {
                const brand = metaData?.brands.find((b) => String(b.id) === item.id) ?? null;
                setSelectedBrand(brand);
                setSelectedModel(null);
              }}
            />
          </View>

          {/* Model */}
          <View style={s.fieldBlock}>
            <Text style={[s.label, { textAlign: isRTL ? 'right' : 'left' }]}>
              {t.car_model_label}
            </Text>
            <SearchableDropdown
              placeholder={selectedBrand ? t.car_model_placeholder : t.select_make_first}
              value={selectedModel?.name ?? null}
              items={modelItems}
              disabled={!selectedBrand}
              isRTL={isRTL}
              onSelect={(item) => {
                const model = selectedBrand?.models.find((m) => String(m.id) === item.id) ?? null;
                setSelectedModel(model);
              }}
            />
          </View>

          {/* Year */}
          <View style={s.fieldBlock}>
            <Text style={[s.label, { textAlign: isRTL ? 'right' : 'left' }]}>
              {t.car_year_label}
            </Text>
            <SearchableDropdown
              placeholder={t.select_year_placeholder}
              value={selectedYear}
              items={yearItems}
              isRTL={isRTL}
              onSelect={(item) => setSelectedYear(item.label)}
            />
          </View>

          {/* Color */}
          <View style={s.fieldBlock}>
            <Text style={[s.label, { textAlign: isRTL ? 'right' : 'left' }]}>
              {t.color_label}
            </Text>
            <SearchableDropdown
              placeholder={t.color_label}
              value={selectedColor ? (isRTL ? (selectedColor.nameAr ?? selectedColor.name) : selectedColor.name) : null}
              items={colorItems}
              isRTL={isRTL}
              onSelect={(item) => {
                const color = metaData?.colors.find((c) => String(c.id) === item.id) ?? null;
                setSelectedColor(color);
              }}
            />
          </View>
        </View>

        {/* Selected summary */}
        {selectedBrand && selectedModel && selectedYear && selectedColor && (
          <View style={s.summaryCard}>
            <View style={[s.summaryRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {(() => {
                const hex = getColorHex(selectedColor.name);
                return <View style={[s.colorDot, { backgroundColor: hex, borderWidth: hex === '#FFFFFF' ? 1 : 0, borderColor: '#e5e5ea' }]} />;
              })()}
              <Text style={s.summaryText} numberOfLines={2}>
                {isRTL ? (selectedColor.nameAr ?? selectedColor.name) : selectedColor.name} {selectedBrand.name} {selectedModel.name} — {selectedYear}
              </Text>
            </View>
          </View>
        )}

        {error && (
          <Text style={[s.errorText, { textAlign: isRTL ? 'right' : 'left' }]}>{error}</Text>
        )}
      </ScrollView>

      {/* Footer CTA */}
      <View style={[s.footer, { paddingBottom: botPad + 24 }]}>
        <TouchableOpacity
          style={[s.continueBtn, !canContinue && s.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Text style={s.continueBtnText}>{t.continue_label}</Text>
              <ArrowRight size={18} color="white" strokeWidth={2} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Dropdown styles ────────────────────────────────────────────────────────────

const dd = StyleSheet.create({
  trigger: {
    backgroundColor: '#f2f2f5',
    borderRadius: 18,
    height: 54,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  triggerDisabled: { opacity: 0.45 },
  triggerFilled: {
    backgroundColor: 'white',
    borderColor: '#1e1e28',
  },
  triggerRow: {
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
  },
  triggerValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1e1e28',
    fontFamily: 'Inter_600SemiBold',
  },
  triggerPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: '#c3c3cc',
    fontFamily: 'Inter_400Regular',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,18,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '80%',
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 99,
    backgroundColor: '#e5e5ea',
    marginBottom: 12,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e1e28',
    fontFamily: 'Inter_700Bold',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 99,
    backgroundColor: '#f2f2f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    alignItems: 'center',
    backgroundColor: '#f2f2f5',
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 46,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e1e28',
    fontFamily: 'Inter_400Regular',
  },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
  listItem: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f5',
    gap: 12,
  },
  listItemSelected: { backgroundColor: '#fafafd' },
  listItemText: {
    fontSize: 15,
    color: '#1e1e28',
    fontFamily: 'Inter_400Regular',
  },
  listItemTextSelected: {
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 99,
    flexShrink: 0,
  },
});

// ── Screen styles ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafd' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32 },
  logoIcon: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: '#1e1e28',
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 19, fontWeight: '700', color: '#1e1e28', letterSpacing: -0.7, fontFamily: 'Inter_700Bold' },
  header: { gap: 10, marginBottom: 32 },
  title: { fontSize: 34, fontWeight: '700', color: '#1e1e28', letterSpacing: -1.2, lineHeight: 40, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 14, color: '#5e5e72', lineHeight: 20, fontFamily: 'Inter_400Regular' },
  fields: { gap: 20 },
  fieldBlock: { gap: 8 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e1e28',
    fontFamily: 'Inter_600SemiBold',
    paddingHorizontal: 4,
  },
  summaryCard: {
    marginTop: 24,
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#1e1e28',
    shadowColor: '#1e1e28',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryRow: { alignItems: 'center', gap: 10 },
  colorDot: { width: 18, height: 18, borderRadius: 99, flexShrink: 0 },
  summaryText: { fontSize: 14, color: '#1e1e28', fontFamily: 'Inter_400Regular', flex: 1 },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    color: '#e53935',
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 4,
  },
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
  continueBtnText: { color: 'white', fontSize: 16, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
});
