import {
  ArrowRight, Navigation, Car, Bike, Package, Bus, CheckCircle2,
  Clock, WifiOff, Wrench, Star, AlertCircle,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useService, ServiceType } from '@/lib/serviceContext';
import { useServiceControl, DriverSnapshot, ServiceStatus } from '@/lib/serviceControlContext';
import { api } from '@/lib/api';

type ServiceOption = {
  type: ServiceType;
  label: string;
  sub: string;
  tag?: string;
};

const SERVICE_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  CAR: Car,
  MOTOR: Bike,
  DELIVERY: Package,
  SHUTTLE: Bus,
};

const SERVICES: ServiceOption[] = [
  { type: 'CAR', label: 'Car', sub: 'Private rides & transfers', tag: 'Most popular' },
  { type: 'MOTOR', label: 'Motorbike', sub: 'Fast urban deliveries' },
  { type: 'DELIVERY', label: 'Delivery', sub: 'Package & order delivery' },
  { type: 'SHUTTLE', label: 'Shuttle', sub: 'Fixed routes & scheduled lines', tag: 'New' },
];

function BlockedOverlay({ status }: { status: ServiceStatus }) {
  const isComingSoon = status.displayMode === 'coming_soon';
  const isMaintenance = status.displayMode === 'maintenance';
  const isIneligible = !!status.ineligibilityReason;

  const Icon = isComingSoon ? Clock
    : isMaintenance ? Wrench
    : isIneligible ? Star
    : WifiOff;

  const label = isIneligible
    ? status.ineligibilityReason!
    : isComingSoon
    ? 'Coming Soon'
    : status.message ?? (isMaintenance ? 'Under Maintenance' : 'Unavailable');

  return (
    <View style={ov.overlay}>
      <Icon size={16} color="rgba(255,255,255,0.9)" />
      <Text style={ov.label} numberOfLines={2}>{label}</Text>
      {isMaintenance && status.eta && (
        <Text style={ov.eta}>ETA: {status.eta}</Text>
      )}
    </View>
  );
}

export default function ServiceSelectScreen() {
  const insets = useSafeAreaInsets();
  const { setServiceType } = useService();
  const { getServiceStatus, isLoading: controlLoading } = useServiceControl();
  const [selected, setSelected] = useState<ServiceType | null>(null);
  const [driverSnapshot, setDriverSnapshot] = useState<DriverSnapshot | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  // Fetch driver profile for eligibility checks (best-effort, non-blocking)
  useEffect(() => {
    api.get<Record<string, unknown>>('/driver/me')
      .then((profile) => {
        setDriverSnapshot({
          rating: typeof profile.rating === 'number' ? profile.rating : undefined,
          licenseVerified:
            typeof profile.licenseVerified === 'boolean'
              ? profile.licenseVerified
              : typeof (profile.license as Record<string, unknown> | undefined)?.verified === 'boolean'
              ? (profile.license as Record<string, unknown>).verified as boolean
              : undefined,
          insuranceVerified:
            typeof profile.insuranceVerified === 'boolean'
              ? profile.insuranceVerified
              : typeof (profile.insurance as Record<string, unknown> | undefined)?.verified === 'boolean'
              ? (profile.insurance as Record<string, unknown>).verified as boolean
              : undefined,
        });
      })
      .catch(() => {}); // non-fatal — eligibility degrades gracefully
  }, []);

  const handleContinue = () => {
    if (!selected) return;
    const status = getServiceStatus(selected, driverSnapshot);
    if (!status.available) return;
    setServiceType(selected);
    router.replace(selected === 'SHUTTLE' ? '/(shuttle)' : '/(tabs)');
  };

  // Compute status for each service upfront
  const statusMap = Object.fromEntries(
    SERVICES.map((svc) => [svc.type, getServiceStatus(svc.type, driverSnapshot)])
  ) as Record<ServiceType, ServiceStatus>;

  // Visible services only
  const visibleServices = SERVICES.filter((svc) => statusMap[svc.type].visible);

  const selectedStatus = selected ? statusMap[selected] : null;
  const canContinue = !!selected && !!selectedStatus?.available;

  return (
    <View style={[s.root, { backgroundColor: '#fafafd' }]}>
      <LinearGradient colors={['#f4f4fb', 'transparent']} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 20, paddingBottom: botPad + 120, paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.logoRow}>
          <View style={s.logoIcon}>
            <Navigation size={18} color="white" />
          </View>
          <Text style={s.logoText}>Vee<Text style={{ color: '#3D52D5' }}>Go</Text></Text>
        </View>

        <View style={s.header}>
          <Text style={s.title}>Choose your{'\n'}service type</Text>
          <Text style={s.sub}>Select how you want to earn with VeeGo. You can change this later.</Text>
        </View>

        {controlLoading ? (
          <View style={s.loadingRow}>
            <ActivityIndicator size="small" color="#1e1e28" />
            <Text style={s.loadingText}>Loading services…</Text>
          </View>
        ) : null}

        <View style={s.grid}>
          {visibleServices.map((svc) => {
            const status = statusMap[svc.type];
            const isSelected = selected === svc.type;
            const isBlocked = !status.available;
            const Icon = SERVICE_ICONS[svc.type];

            return (
              <TouchableOpacity
                key={svc.type}
                style={[
                  s.card,
                  isSelected && s.cardSelected,
                  isBlocked && s.cardBlocked,
                ]}
                onPress={() => !isBlocked && setSelected(svc.type)}
                activeOpacity={isBlocked ? 1 : 0.85}
                disabled={isBlocked}
              >
                {/* Tag pill (Most popular / New / Coming Soon) */}
                {svc.tag && !isBlocked && (
                  <View style={s.tagPill}>
                    <Text style={s.tagText}>{svc.tag}</Text>
                  </View>
                )}

                <View style={[s.iconBox, isSelected && s.iconBoxSelected, isBlocked && s.iconBoxBlocked]}>
                  <Icon size={28} color={isSelected ? 'white' : isBlocked ? '#b0b0c0' : '#1e1e28'} />
                </View>

                <Text style={[s.cardLabel, isSelected && s.cardLabelSelected, isBlocked && s.cardLabelBlocked]}>
                  {svc.label}
                </Text>
                <Text style={[s.cardSub, isSelected && s.cardSubSelected, isBlocked && s.cardSubBlocked]}>
                  {svc.sub}
                </Text>

                {isSelected && !isBlocked && (
                  <View style={s.checkMark}>
                    <CheckCircle2 size={20} color="#1e1e28" />
                  </View>
                )}

                {/* Blocked overlay */}
                {isBlocked && <BlockedOverlay status={status} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Ineligibility explanation for selected service */}
        {selected && selectedStatus && !selectedStatus.available && selectedStatus.ineligibilityReason && (
          <View style={s.eligibilityBanner}>
            <AlertCircle size={14} color="#e53935" />
            <Text style={s.eligibilityText}>{selectedStatus.ineligibilityReason}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: botPad + 24 }]}>
        <TouchableOpacity
          style={[s.continueBtn, !canContinue && s.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.9}
        >
          <Text style={s.continueBtnText}>Continue</Text>
          <ArrowRight size={18} color="white" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Overlay styles ────────────────────────────────────────────────────────────

const ov = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    backgroundColor: 'rgba(10,10,18,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    lineHeight: 15,
  },
  eta: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
  },
});

// ── Card styles ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32 },
  logoIcon: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: '#1e1e28',
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 19, fontWeight: '700', color: '#1e1e28', letterSpacing: -0.7, fontFamily: 'Inter_700Bold' },
  header: { gap: 10, marginBottom: 28 },
  title: { fontSize: 34, fontWeight: '700', color: '#1e1e28', letterSpacing: -1.2, lineHeight: 40, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 14, color: '#5e5e72', lineHeight: 20, fontFamily: 'Inter_400Regular' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  loadingText: { fontSize: 12, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47%',
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 20,
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#e5e5ea',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardSelected: {
    borderColor: '#1e1e28',
    backgroundColor: '#fafafd',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  cardBlocked: {
    borderColor: '#e5e5ea',
    backgroundColor: '#f7f7fa',
  },
  tagPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(30,30,40,0.07)',
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 4,
  },
  tagText: { fontSize: 9, fontWeight: '700', color: '#1e1e28', letterSpacing: 1 },
  iconBox: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#f2f2f5',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBoxSelected: { backgroundColor: '#1e1e28' },
  iconBoxBlocked: { backgroundColor: '#ebebf0' },
  cardLabel: { fontSize: 16, fontWeight: '700', color: '#1e1e28', fontFamily: 'Inter_700Bold', marginTop: 4 },
  cardLabelSelected: { color: '#1e1e28' },
  cardLabelBlocked: { color: '#b0b0c0' },
  cardSub: { fontSize: 12, color: '#5e5e72', lineHeight: 16, fontFamily: 'Inter_400Regular' },
  cardSubSelected: { color: '#5e5e72' },
  cardSubBlocked: { color: '#c0c0cc' },
  checkMark: { position: 'absolute', top: 14, right: 14 },
  eligibilityBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, paddingHorizontal: 4,
  },
  eligibilityText: { fontSize: 12, color: '#e53935', fontFamily: 'Inter_400Regular', flex: 1 },
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
