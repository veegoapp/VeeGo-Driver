
import { ArrowRight, Navigation, Car, Bike, Package, Bus, CheckCircle2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useService, ServiceType } from '@/lib/serviceContext';

type ServiceOption = {
  type: ServiceType;
  icon: string;
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
  { type: 'CAR', icon: 'CAR', label: 'Car', sub: 'Private rides & transfers', tag: 'Most popular' },
  { type: 'MOTOR', icon: 'MOTOR', label: 'Motorbike', sub: 'Fast urban deliveries' },
  { type: 'DELIVERY', icon: 'DELIVERY', label: 'Delivery', sub: 'Package & order delivery' },
  { type: 'SHUTTLE', icon: 'SHUTTLE', label: 'Shuttle', sub: 'Fixed routes & scheduled lines', tag: 'New' },
];

export default function ServiceSelectScreen() {
  const insets = useSafeAreaInsets();
  const { setServiceType } = useService();
  const [selected, setSelected] = useState<ServiceType | null>(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const handleContinue = () => {
    if (!selected) return;
    setServiceType(selected);
    router.replace(selected === 'SHUTTLE' ? '/(shuttle)' : '/(tabs)');
  };

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

        <View style={s.grid}>
          {SERVICES.map((svc) => {
            const isSelected = selected === svc.type;
            return (
              <TouchableOpacity
                key={svc.type}
                style={[s.card, isSelected && s.cardSelected]}
                onPress={() => setSelected(svc.type)}
                activeOpacity={0.85}
              >
                {svc.tag && (
                  <View style={s.tagPill}>
                    <Text style={s.tagText}>{svc.tag}</Text>
                  </View>
                )}
                <View style={[s.iconBox, isSelected && s.iconBoxSelected]}>
                  {(() => { const Icon = SERVICE_ICONS[svc.icon]; return <Icon size={28} color={isSelected ? 'white' : '#1e1e28'} />; })()}
                </View>
                <Text style={[s.cardLabel, isSelected && s.cardLabelSelected]}>{svc.label}</Text>
                <Text style={[s.cardSub, isSelected && s.cardSubSelected]}>{svc.sub}</Text>
                {isSelected && (
                  <View style={s.checkMark}>
                    <CheckCircle2 size={20} color="#1e1e28" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: botPad + 24 }]}>
        <TouchableOpacity
          style={[s.continueBtn, !selected && s.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!selected}
          activeOpacity={0.9}
        >
          <Text style={s.continueBtnText}>Continue</Text>
          <ArrowRight size={18} color="white" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

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
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardSelected: {
    borderColor: '#1e1e28',
    backgroundColor: '#fafafd',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
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
  cardLabel: { fontSize: 16, fontWeight: '700', color: '#1e1e28', fontFamily: 'Inter_700Bold', marginTop: 4 },
  cardLabelSelected: { color: '#1e1e28' },
  cardSub: { fontSize: 12, color: '#5e5e72', lineHeight: 16, fontFamily: 'Inter_400Regular' },
  cardSubSelected: { color: '#5e5e72' },
  checkMark: { position: 'absolute', top: 14, right: 14 },
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
