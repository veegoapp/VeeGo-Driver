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

// ── Static placeholder data (replace with API calls once backend is ready) ────

type Brand = { id: string; name: string };
type VehicleModel = { id: string; name: string; brandId: string };
type ColorOption = { id: string; label: string; hex: string };

const BRANDS: Brand[] = [
  { id: '1',  name: 'Toyota' },
  { id: '2',  name: 'Hyundai' },
  { id: '3',  name: 'Kia' },
  { id: '4',  name: 'Nissan' },
  { id: '5',  name: 'Honda' },
  { id: '6',  name: 'Chevrolet' },
  { id: '7',  name: 'Mitsubishi' },
  { id: '8',  name: 'Suzuki' },
  { id: '9',  name: 'BMW' },
  { id: '10', name: 'Mercedes-Benz' },
  { id: '11', name: 'Volkswagen' },
  { id: '12', name: 'Ford' },
  { id: '13', name: 'Peugeot' },
  { id: '14', name: 'Renault' },
  { id: '15', name: 'Skoda' },
  { id: '16', name: 'Opel' },
  { id: '17', name: 'Lada' },
  { id: '18', name: 'Fiat' },
  { id: '19', name: 'Jeep' },
  { id: '20', name: 'Subaru' },
];

const ALL_MODELS: VehicleModel[] = [
  { id: '101', brandId: '1',  name: 'Camry' },
  { id: '102', brandId: '1',  name: 'Corolla' },
  { id: '103', brandId: '1',  name: 'Yaris' },
  { id: '104', brandId: '1',  name: 'Land Cruiser' },
  { id: '105', brandId: '1',  name: 'Hilux' },
  { id: '106', brandId: '1',  name: 'RAV4' },
  { id: '107', brandId: '1',  name: 'Fortuner' },
  { id: '108', brandId: '2',  name: 'Elantra' },
  { id: '109', brandId: '2',  name: 'Tucson' },
  { id: '110', brandId: '2',  name: 'Accent' },
  { id: '111', brandId: '2',  name: 'i10' },
  { id: '112', brandId: '2',  name: 'Sonata' },
  { id: '113', brandId: '2',  name: 'Santa Fe' },
  { id: '114', brandId: '3',  name: 'Sportage' },
  { id: '115', brandId: '3',  name: 'Cerato' },
  { id: '116', brandId: '3',  name: 'Picanto' },
  { id: '117', brandId: '3',  name: 'Rio' },
  { id: '118', brandId: '3',  name: 'Sorento' },
  { id: '119', brandId: '4',  name: 'Sunny' },
  { id: '120', brandId: '4',  name: 'Sentra' },
  { id: '121', brandId: '4',  name: 'Altima' },
  { id: '122', brandId: '4',  name: 'Maxima' },
  { id: '123', brandId: '4',  name: 'Pathfinder' },
  { id: '124', brandId: '4',  name: 'X-Trail' },
  { id: '125', brandId: '5',  name: 'Civic' },
  { id: '126', brandId: '5',  name: 'Accord' },
  { id: '127', brandId: '5',  name: 'City' },
  { id: '128', brandId: '5',  name: 'CR-V' },
  { id: '129', brandId: '6',  name: 'Optra' },
  { id: '130', brandId: '6',  name: 'Aveo' },
  { id: '131', brandId: '6',  name: 'Captiva' },
  { id: '132', brandId: '7',  name: 'Lancer' },
  { id: '133', brandId: '7',  name: 'Outlander' },
  { id: '134', brandId: '7',  name: 'Galant' },
  { id: '135', brandId: '8',  name: 'Swift' },
  { id: '136', brandId: '8',  name: 'Alto' },
  { id: '137', brandId: '8',  name: 'Vitara' },
  { id: '138', brandId: '9',  name: '316i' },
  { id: '139', brandId: '9',  name: '320i' },
  { id: '140', brandId: '9',  name: 'X3' },
  { id: '141', brandId: '10', name: 'C-Class' },
  { id: '142', brandId: '10', name: 'E-Class' },
  { id: '143', brandId: '10', name: 'GLE' },
  { id: '144', brandId: '11', name: 'Passat' },
  { id: '145', brandId: '11', name: 'Golf' },
  { id: '146', brandId: '11', name: 'Jetta' },
  { id: '147', brandId: '12', name: 'Focus' },
  { id: '148', brandId: '12', name: 'Escape' },
  { id: '149', brandId: '13', name: '208' },
  { id: '150', brandId: '13', name: '301' },
  { id: '151', brandId: '13', name: '3008' },
  { id: '152', brandId: '14', name: 'Symbol' },
  { id: '153', brandId: '14', name: 'Logan' },
  { id: '154', brandId: '14', name: 'Duster' },
  { id: '155', brandId: '15', name: 'Octavia' },
  { id: '156', brandId: '15', name: 'Fabia' },
  { id: '157', brandId: '16', name: 'Astra' },
  { id: '158', brandId: '16', name: 'Corsa' },
  { id: '159', brandId: '17', name: 'Vesta' },
  { id: '160', brandId: '17', name: 'Granta' },
  { id: '161', brandId: '18', name: 'Palio' },
  { id: '162', brandId: '18', name: 'Tipo' },
  { id: '163', brandId: '19', name: 'Wrangler' },
  { id: '164', brandId: '19', name: 'Grand Cherokee' },
  { id: '165', brandId: '20', name: 'Outback' },
  { id: '166', brandId: '20', name: 'Forester' },
];

const COLORS: ColorOption[] = [
  { id: 'white',   label: 'White',    hex: '#FFFFFF' },
  { id: 'black',   label: 'Black',    hex: '#1e1e28' },
  { id: 'silver',  label: 'Silver',   hex: '#C0C0C0' },
  { id: 'gray',    label: 'Gray',     hex: '#808080' },
  { id: 'red',     label: 'Red',      hex: '#E53935' },
  { id: 'blue',    label: 'Blue',     hex: '#1565C0' },
  { id: 'green',   label: 'Green',    hex: '#388E3C' },
  { id: 'beige',   label: 'Beige',    hex: '#D4B896' },
  { id: 'brown',   label: 'Brown',    hex: '#795548' },
  { id: 'gold',    label: 'Gold',     hex: '#FFC107' },
  { id: 'orange',  label: 'Orange',   hex: '#F57C00' },
  { id: 'maroon',  label: 'Maroon',   hex: '#880E4F' },
  { id: 'navy',    label: 'Navy',     hex: '#0D1B4B' },
  { id: 'pearl',   label: 'Pearl',    hex: '#F5F0E8' },
];

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
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [selectedModel, setSelectedModel] = useState<VehicleModel | null>(null);
  const [selectedYear, setSelectedYear]   = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<ColorOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandItems: DropdownItem[] = useMemo(
    () => BRANDS.map((b) => ({ id: b.id, label: b.name })),
    [],
  );

  const modelItems: DropdownItem[] = useMemo(() => {
    if (!selectedBrand) return [];
    return ALL_MODELS
      .filter((m) => m.brandId === selectedBrand.id)
      .map((m) => ({ id: m.id, label: m.name }));
  }, [selectedBrand]);

  const yearItems: DropdownItem[] = useMemo(
    () => YEARS.map((y) => ({ id: y, label: y })),
    [],
  );

  const COLOR_LABELS: Record<string, string> = {
    white: t.color_white,
    black: t.color_black,
    silver: t.color_silver,
    gray: t.color_gray,
    red: t.color_red,
    blue: t.color_blue,
    green: t.color_green,
    beige: t.color_beige,
    brown: t.color_brown,
    gold: t.color_gold,
    orange: t.color_orange,
    maroon: t.color_maroon,
    navy: t.color_navy,
    pearl: t.color_pearl,
  };

  const colorItems: DropdownItem[] = useMemo(
    () => COLORS.map((c) => ({ id: c.id, label: COLOR_LABELS[c.id] ?? c.label, colorHex: c.hex })),
    [COLOR_LABELS],
  );

  const canContinue =
    !!selectedBrand && !!selectedModel && !!selectedYear && !!selectedColor && !loading;

  const handleContinue = async () => {
    if (!canContinue) return;
    setError(null);
    setLoading(true);
    try {
      // TODO: Backend Integration — POST /driver/register/vehicle-details
      await endpoints.registration.setVehicleDetails({
        brandId:  selectedBrand!.id,
        modelId:  selectedModel!.id,
        year:     selectedYear!,
        color:    selectedColor!.id,
      });
    } catch {
      // Non-blocking: proceed even if the endpoint isn't live yet
    } finally {
      setLoading(false);
    }
    router.replace('/(tabs)');
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
                const brand = BRANDS.find((b) => b.id === item.id) ?? null;
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
                const model = ALL_MODELS.find((m) => m.id === item.id) ?? null;
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
              value={selectedColor ? COLOR_LABELS[selectedColor.id] ?? selectedColor.label : null}
              items={colorItems}
              isRTL={isRTL}
              onSelect={(item) => {
                const color = COLORS.find((c) => c.id === item.id) ?? null;
                setSelectedColor(color);
              }}
            />
          </View>
        </View>

        {/* Selected summary */}
        {selectedBrand && selectedModel && selectedYear && selectedColor && (
          <View style={s.summaryCard}>
            <View style={[s.summaryRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[s.colorDot, { backgroundColor: selectedColor.hex, borderWidth: selectedColor.id === 'white' ? 1 : 0, borderColor: '#e5e5ea' }]} />
              <Text style={s.summaryText} numberOfLines={2}>
                {COLOR_LABELS[selectedColor.id] ?? selectedColor.label} {selectedBrand.name} {selectedModel.name} — {selectedYear}
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
