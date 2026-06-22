import { ArrowRight, Car, Bike as ScooterIcon, Package, Bus, Lock } from 'lucide-react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { useService } from '@/lib/serviceContext';
import { endpoints, ApiError } from '@/lib/api';

type ServiceOption = {
  key: string;       // value sent to backend: 'car'|'shuttle'|'scooter'|'delivery'
  appType: string;   // maps to ServiceContext type: 'CAR'|'SHUTTLE'|'SCOOTER'|'DELIVERY'
  label: string;
  labelAr: string;
  desc: string;
  descAr: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  accentColor: string;
};

const SERVICE_OPTIONS: ServiceOption[] = [
  {
    key: 'shuttle', appType: 'SHUTTLE',
    label: 'Shuttle', labelAr: 'شاتل',
    desc: 'Fixed routes & scheduled trips', descAr: 'خطوط ثابتة ورحلات مجدولة',
    Icon: Bus, accentColor: '#3D52D5',
  },
  {
    key: 'car', appType: 'CAR',
    label: 'Car', labelAr: 'سيارة',
    desc: 'On-demand private rides', descAr: 'رحلات خاصة عند الطلب',
    Icon: Car, accentColor: '#0ea5e9',
  },
  {
    key: 'scooter', appType: 'SCOOTER',
    label: 'Scooter', labelAr: 'موتوسيكل',
    desc: 'Quick city rides', descAr: 'رحلات سريعة داخل المدينة',
    Icon: ScooterIcon, accentColor: '#f97316',
  },
  {
    key: 'delivery', appType: 'DELIVERY',
    label: 'Delivery', labelAr: 'توصيل',
    desc: 'Package & food delivery', descAr: 'توصيل طلبات وطرود',
    Icon: Package, accentColor: '#10b981',
  },
];

type ServiceControl = {
  serviceType: string;
  isEnabled: boolean;
  displayMode: string;
  unavailableMessage: string | null;
};

export default function RegisterServiceTypeScreen() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const botPad = insets.bottom;
  const { isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;
  const { setServiceType } = useService();

  const [controls, setControls] = useState<ServiceControl[]>([]);
  const [loadingControls, setLoadingControls] = useState(true);
  const [selected, setSelected] = useState<ServiceOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await endpoints.services.available();
        setControls(res?.data ?? []);
      } catch {
        // If unavailable, show all options as enabled (fail open)
        setControls([]);
      } finally {
        setLoadingControls(false);
      }
    })();
  }, []);

  const getControl = (key: string): ServiceControl | undefined =>
    controls.find(c => c.serviceType === key);

  const isSelectable = (key: string): boolean => {
    if (controls.length === 0) return true; // fail open
    const ctrl = getControl(key);
    if (!ctrl) return true; // no row → default live
    return ctrl.isEnabled && ctrl.displayMode === 'live';
  };

  const getBlockReason = (key: string): string | null => {
    const ctrl = getControl(key);
    if (!ctrl) return null;
    if (ctrl.isEnabled && ctrl.displayMode === 'live') return null;
    return ctrl.unavailableMessage ?? 'This service is currently unavailable';
  };

  const handleSelect = (opt: ServiceOption) => {
    if (!isSelectable(opt.key)) return;
    setSelected(opt);
    setError(null);
  };

  const handleContinue = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await endpoints.registration.setServiceType(selected.key);
      // Update local service context so the app shows the correct interface
      setServiceType(selected.appType as any);
      router.push('/register-vehicle');
    } catch (err) {
      let msg = 'Could not save your selection. Please try again.';
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; displayMode?: string } | null;
        if (body?.error) msg = body.error;
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: '#fafafd' }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 20, paddingBottom: botPad + 120, paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Text style={[s.step, { textAlign: TA }]}>Step 1 of 4</Text>
          <Text style={[s.title, { textAlign: TA }]}>Select your{'\n'}service type</Text>
          <Text style={[s.sub, { textAlign: TA }]}>
            This determines your vehicle type and the app interface you'll use.
          </Text>
        </View>

        {loadingControls ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color="#3D52D5" />
            <Text style={s.loadingText}>Loading available services…</Text>
          </View>
        ) : (
          <View style={s.optionsGrid}>
            {SERVICE_OPTIONS.map((opt) => {
              const selectable = isSelectable(opt.key);
              const blockReason = getBlockReason(opt.key);
              const isSelected = selected?.key === opt.key;
              const { Icon } = opt;

              return (
                <Pressable
                  key={opt.key}
                  style={({ pressed }) => [
                    s.optionCard,
                    isSelected && [s.optionCardSelected, { borderColor: opt.accentColor }],
                    !selectable && s.optionCardDisabled,
                    pressed && selectable && { opacity: 0.8 },
                  ]}
                  onPress={() => handleSelect(opt)}
                  disabled={!selectable}
                >
                  <LinearGradient
                    colors={isSelected ? [opt.accentColor + '18', opt.accentColor + '08'] : ['#fff', '#fafafd']}
                    style={s.optionCardInner}
                  >
                    {/* Icon */}
                    <View style={[s.iconBox, { backgroundColor: selectable ? opt.accentColor + '18' : '#f2f2f5' }]}>
                      <Icon size={26} color={selectable ? opt.accentColor : '#c3c3cc'} strokeWidth={1.8} />
                    </View>

                    {/* Text */}
                    <View style={{ flex: 1 }}>
                      <Text style={[s.optLabel, !selectable && s.optLabelDisabled]}>
                        {isRTL ? opt.labelAr : opt.label}
                      </Text>
                      <Text style={[s.optDesc, !selectable && s.optDescDisabled]} numberOfLines={2}>
                        {blockReason ?? (isRTL ? opt.descAr : opt.desc)}
                      </Text>
                    </View>

                    {/* Selected dot OR lock */}
                    {isSelected ? (
                      <View style={[s.selectedDot, { backgroundColor: opt.accentColor }]} />
                    ) : !selectable ? (
                      <Lock size={14} color="#c3c3cc" />
                    ) : null}
                  </LinearGradient>
                </Pressable>
              );
            })}
          </View>
        )}

        {error && <Text style={s.errorText}>{error}</Text>}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: botPad + 20 }]}>
        <TouchableOpacity
          style={[s.continueBtn, (!selected || submitting) && s.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!selected || submitting}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={s.continueBtnText}>Continue</Text>
              <ArrowRight size={18} color="white" strokeWidth={2} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { marginBottom: 24, gap: 8 },
  step: { fontSize: 12, fontWeight: '600', color: '#5e5e72', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Inter_600SemiBold' },
  title: { fontSize: 34, fontWeight: '700', color: '#1e1e28', letterSpacing: -1.2, lineHeight: 40, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 14, color: '#5e5e72', lineHeight: 20, fontFamily: 'Inter_400Regular' },
  loadingWrap: { alignItems: 'center', gap: 12, paddingTop: 40 },
  loadingText: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
  optionsGrid: { gap: 12 },
  optionCard: {
    borderRadius: 22, borderWidth: 1.5, borderColor: '#e5e5ea', overflow: 'hidden',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  optionCardSelected: { borderWidth: 2 },
  optionCardDisabled: { opacity: 0.55 },
  optionCardInner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  iconBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  optLabel: { fontSize: 16, fontWeight: '700', color: '#1e1e28', fontFamily: 'Inter_700Bold', marginBottom: 3 },
  optLabelDisabled: { color: '#9e9ea8' },
  optDesc: { fontSize: 12, color: '#5e5e72', lineHeight: 17, fontFamily: 'Inter_400Regular' },
  optDescDisabled: { color: '#b0b0bc' },
  selectedDot: { width: 10, height: 10, borderRadius: 5 },
  errorText: { fontSize: 13, color: '#e53935', textAlign: 'center', marginTop: 8, fontFamily: 'Inter_400Regular' },
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
});
