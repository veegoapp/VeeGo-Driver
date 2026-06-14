import {
  ArrowRight, Navigation, Car, Bike, Package, Bus, CheckCircle2,
  WifiOff, Wrench, Star, AlertCircle, RefreshCw,
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
import { api, endpoints } from '@/lib/api';
import { useI18n } from '@/lib/i18nContext';

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
  { type: 'CAR',      label: 'Car',       sub: 'Private rides & transfers',      tag: 'Most popular' },
  { type: 'MOTOR',    label: 'Scooter',   sub: 'Fast urban deliveries' },
  { type: 'DELIVERY', label: 'Delivery',  sub: 'Package & order delivery' },
  { type: 'SHUTTLE',  label: 'Shuttle',   sub: 'Fixed routes & scheduled lines',  tag: 'New' },
];

// Maps frontend ServiceType keys → backend serviceType strings
const BACKEND_TYPE_MAP: Record<ServiceType, string> = {
  CAR:      'car',
  MOTOR:    'scooter',
  DELIVERY: 'delivery',
  SHUTTLE:  'shuttle',
};

function BlockedOverlay({ status }: { status: ServiceStatus }) {
  const isMaintenance = status.displayMode === 'maintenance';
  const isIneligible  = !!status.ineligibilityReason;

  const Icon = isMaintenance ? Wrench : isIneligible ? Star : WifiOff;

  const label = isIneligible
    ? status.ineligibilityReason!
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
  const { t } = useI18n();
  const { setServiceType } = useService();
  const {
    services,
    getServiceStatus,
    isLoading: controlLoading,
    error: controlError,
    refresh,
  } = useServiceControl();
  const [selected, setSelected]             = useState<ServiceType | null>(null);
  const [driverSnapshot, setDriverSnapshot] = useState<DriverSnapshot | null>(null);
  const [retrying, setRetrying]             = useState(false);

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
      .catch(() => {});
  }, []);

  const handleContinue = async () => {
    if (!selected) return;
    setServiceType(selected);

    // Persist service type to the backend (non-blocking — proceed even if it fails)
    try {
      // TODO: Backend Integration — POST /driver/register/service-type
      await endpoints.registration.setServiceType(BACKEND_TYPE_MAP[selected]);
    } catch {
      // Endpoint may not be live yet; local + per-user storage already saved above
    }

    if (selected === 'SHUTTLE') {
      router.replace('/(shuttle)');
    } else {
      // Vehicle-based services go through the vehicle specs setup step first
      router.replace('/auth/vehicle-specs');
    }
  };

  // Build status map using lowercase backend type keys so the lookup matches
  const statusMap = Object.fromEntries(
    SERVICES.map((svc) => [svc.type, getServiceStatus(BACKEND_TYPE_MAP[svc.type], driverSnapshot)])
  ) as Record<ServiceType, ServiceStatus>;

  const selectedStatus = selected ? statusMap[selected] : null;
  // Continue only requires a service to be selected — the service guard on
  // the target screen handles runtime blocking. No availability gate here.
  const canContinue = !!selected && !controlLoading;

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
          <Text style={s.title}>{t.choose_service_type}</Text>
          <Text style={s.sub}>{t.service_select_sub}</Text>
        </View>

        {/* Loading state */}
        {controlLoading ? (
          <View style={s.stateBox}>
            <ActivityIndicator size="large" color="#1e1e28" />
            <Text style={s.stateTitle}>Checking services…</Text>
            <Text style={s.stateSub}>Please wait while we load availability.</Text>
          </View>
        ) : controlError ? (
          /* Error state */
          <View style={s.stateBox}>
            <WifiOff size={36} color="#e53935" />
            <Text style={[s.stateTitle, { color: '#e53935' }]}>Could not load services</Text>
            <Text style={s.stateSub}>
              Unable to reach the server. Check your connection and try again.
            </Text>
            <TouchableOpacity
              style={s.retryBtn}
              onPress={async () => {
                setRetrying(true);
                await refresh();
                setRetrying(false);
              }}
              disabled={retrying}
              activeOpacity={0.8}
            >
              <RefreshCw size={15} color="white" />
              <Text style={s.retryText}>{retrying ? 'Retrying…' : 'Retry'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {(!controlLoading && !controlError) ? (
          services.length === 0 ? (
            /* Safety fallback — API returned nothing */
            <View style={s.stateBox}>
              <Text style={s.stateTitle}>No services available</Text>
              <Text style={s.stateSub}>There are no services configured at the moment. Please try again later.</Text>
            </View>
          ) : (
            <View style={s.grid}>
              {/* Render ALL services — never filter by displayMode */}
              {SERVICES.map((svc) => {
                const status      = statusMap[svc.type];
                const isSelected  = selected === svc.type;
                const isComingSoon = status.displayMode === 'coming_soon';
                // coming_soon → visible but not selectable
                // unavailable / maintenance / ineligible → blocked overlay
                const isBlocked   = !status.available && !isComingSoon;
                const isDisabled  = !status.available; // covers both coming_soon and truly blocked
                const Icon        = SERVICE_ICONS[svc.type];

                return (
                  <TouchableOpacity
                    key={svc.type}
                    style={[
                      s.card,
                      isSelected   && s.cardSelected,
                      isComingSoon && s.cardComingSoon,
                      isBlocked    && s.cardBlocked,
                    ]}
                    onPress={() => {
                      if (isDisabled) return;
                      setSelected(svc.type);
                      // Save immediately so navigateAfterAuth always finds the
                      // preferred service type on every subsequent login.
                      setServiceType(svc.type);
                    }}
                    activeOpacity={isDisabled ? 1 : 0.85}
                    disabled={isDisabled}
                  >
                    {svc.tag && !isDisabled && (
                      <View style={s.tagPill}>
                        <Text style={s.tagText}>{svc.tag}</Text>
                      </View>
                    )}

                    <View style={[
                      s.iconBox,
                      isSelected   && s.iconBoxSelected,
                      isComingSoon && s.iconBoxComingSoon,
                      isBlocked    && s.iconBoxBlocked,
                    ]}>
                      <Icon
                        size={28}
                        color={
                          isSelected   ? 'white'
                          : isComingSoon ? '#a0a0b8'
                          : isBlocked   ? '#b0b0c0'
                          : '#1e1e28'
                        }
                      />
                    </View>

                    <Text style={[
                      s.cardLabel,
                      isSelected   && s.cardLabelSelected,
                      isComingSoon && s.cardLabelComingSoon,
                      isBlocked    && s.cardLabelBlocked,
                    ]}>
                      {svc.label}
                    </Text>

                    <Text style={[
                      s.cardSub,
                      isSelected   && s.cardSubSelected,
                      isComingSoon && s.cardSubComingSoon,
                      isBlocked    && s.cardSubBlocked,
                    ]}>
                      {svc.sub}
                    </Text>

                    {/* "Soon" badge — centered below name, only for coming_soon */}
                    {isComingSoon && (
                      <View style={s.soonBadge}>
                        <Text style={s.soonBadgeText}>Soon</Text>
                      </View>
                    )}

                    {isSelected && !isDisabled && (
                      <View style={s.checkMark}>
                        <CheckCircle2 size={20} color="#1e1e28" />
                      </View>
                    )}

                    {/* Dark overlay only for truly blocked (unavailable / maintenance / ineligible) */}
                    {isBlocked && <BlockedOverlay status={status} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        ) : null}

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
          <Text style={s.continueBtnText}>{t.continue}</Text>
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
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e1e28',
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  stateSub: {
    fontSize: 13,
    color: '#5e5e72',
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e1e28',
    borderRadius: 99,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    fontFamily: 'Inter_600SemiBold',
  },
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
    alignItems: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardSelected: {
    borderColor: '#1e1e28',
    backgroundColor: '#fafafd',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  cardComingSoon: {
    borderColor: '#e5e5ea',
    backgroundColor: '#f9f9fc',
    opacity: 0.65,
  },
  cardBlocked: {
    borderColor: '#e5e5ea',
    backgroundColor: '#f7f7fa',
  },
  tagPill: {
    alignSelf: 'center',
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
  iconBoxSelected:   { backgroundColor: '#1e1e28' },
  iconBoxComingSoon: { backgroundColor: '#ebebf0' },
  iconBoxBlocked:    { backgroundColor: '#ebebf0' },
  cardLabel: { fontSize: 16, fontWeight: '700', color: '#1e1e28', fontFamily: 'Inter_700Bold', marginTop: 4, textAlign: 'center' },
  cardLabelSelected:   { color: '#1e1e28' },
  cardLabelComingSoon: { color: '#a0a0b8' },
  cardLabelBlocked:    { color: '#b0b0c0' },
  cardSub: { fontSize: 12, color: '#5e5e72', lineHeight: 16, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  cardSubSelected:   { color: '#5e5e72' },
  cardSubComingSoon: { color: '#b0b0c0' },
  cardSubBlocked:    { color: '#c0c0cc' },
  soonBadge: {
    alignSelf: 'center',
    backgroundColor: '#ebebf8',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
  },
  soonBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6060a8',
    letterSpacing: 0.5,
    fontFamily: 'Inter_700Bold',
  },
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
