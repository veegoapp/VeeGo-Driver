import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronRight, GitBranch, LogOut, Settings, Star } from 'lucide-react-native';
import { FeatherIcon } from '@/lib/iconMap';
import React from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import type { Language } from '@/lib/i18nContext';
import { useAuth } from '@/lib/authContext';
import { endpoints } from '@/lib/api';

const TAB_BAR_HEIGHT = 96;

type DriverProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  rating: number;
  avatar: string;
  trips: number;
  vehicle?: { make: string; model: string; plate: string };
};

const LANGUAGES: { label: string; value: Language }[] = [
  { label: 'English', value: 'en' },
  { label: 'العربية', value: 'ar' },
];

export default function ShuttleProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL, language, setLanguage } = useI18n();
  const { logout } = useAuth();

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { data: driverRaw, isLoading } = useQuery<DriverProfile>({
    queryKey: ['driver'],
    queryFn: endpoints.driver.me as () => Promise<DriverProfile>,
  });
  const driver = driverRaw;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: TAB_BAR_HEIGHT + 24, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.profile_title}</Text>

        <GlassView style={styles.profileCard} borderRadius={24}>
          <View style={styles.profileCardInner}>
            {isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 32 }} />
            ) : (
              <>
                <View style={styles.avatarWrap}>
                  <Image
                    source={{ uri: driver?.avatar ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(driver?.name ?? 'Driver')}&background=1e1e28&color=fff` }}
                    style={[styles.avatar, { borderColor: '#1e1e2866' }]}
                  />
                  <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.shuttleBadge}>
                    <GitBranch size={14} color="#fff" strokeWidth={2} />
                  </LinearGradient>
                </View>
                <Text style={[styles.driverName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>
                  {driver?.name ?? '—'}
                </Text>
                <Text style={[styles.driverMeta, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }]}>
                  {t.shuttle_service} · {driver?.trips ?? '—'} {t.trips}
                </Text>
                <View style={[styles.statsGrid, { flexDirection: R }]}>
                  <MiniStat
                    label={t.rating_stat}
                    value={driver?.rating?.toFixed(2) ?? '—'}
                    icon={<Star size={14} color={colors.accent} fill={colors.accent} strokeWidth={2} />}
                    colors={colors}
                  />
                </View>
              </>
            )}
          </View>
        </GlassView>

        <GlassView style={[styles.menuGroup, { marginTop: 20 }]} borderRadius={20}>
          <MenuItem icon="user" label={t.personal_info} sub={driver?.phone ?? driver?.email ?? driver?.name ?? '—'} onPress={() => router.push('/personal-info')} colors={colors} isRTL={isRTL} />
          <MenuItem
            icon="truck"
            label={t.vehicle_label}
            sub={driver?.vehicle ? `${driver.vehicle.make} ${driver.vehicle.model} · ${driver.vehicle.plate}` : '—'}
            onPress={() => router.push('/vehicle')}
            colors={colors}
            isRTL={isRTL}
          />
          <MenuItem icon="file-text" label={t.documents_label} onPress={() => router.push('/documents')} colors={colors} isRTL={isRTL} last />
        </GlassView>

        <GlassView style={[styles.menuGroup, { marginTop: 12 }]} borderRadius={20}>
          <MenuItem icon="inbox" label={t.notifications} onPress={() => router.push('/messages')} colors={colors} isRTL={isRTL} />
          <MenuItem icon="message-square" label={t.messages_label} onPress={() => router.push('/messages')} colors={colors} isRTL={isRTL} last />
        </GlassView>

        <GlassView style={[styles.menuGroup, { marginTop: 12 }]} borderRadius={20}>
          <View style={[styles.menuItem, { flexDirection: R }]}>
            <View style={[styles.menuIcon, { backgroundColor: colors.secondary + 'B3' }]}>
              <FeatherIcon name="globe" size={18} color={colors.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.language}</Text>
              <View style={[styles.langRow, { flexDirection: R }]}>
                {LANGUAGES.map(({ label, value }) => (
                  <Pressable
                    key={value}
                    onPress={() => setLanguage(value)}
                    style={[styles.langChip, {
                      backgroundColor: language === value ? '#1e1e2820' : colors.secondary,
                      borderColor: language === value ? '#1e1e2833' : 'transparent',
                    }]}
                  >
                    <Text style={[styles.langChipText, {
                      color: language === value ? '#2d2d42' : colors.mutedForeground,
                      fontFamily: 'Inter_600SemiBold',
                    }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
          <View style={[styles.menuItem, { flexDirection: R, borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={[styles.menuIcon, { backgroundColor: colors.secondary + 'B3' }]}>
              <Settings size={18} color={colors.foreground} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.settings_label}</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{t.push_notifs}</Text>
            </View>
            <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </View>
        </GlassView>

        <GlassView style={[styles.menuGroup, { marginTop: 12 }]} borderRadius={20}>
          <MenuItem icon="target" label={t.bonus_targets} onPress={() => router.push('/bonus-targets')} colors={colors} isRTL={isRTL} />
          <MenuItem icon="help-circle" label={t.help_support} sub="Shuttle operations" onPress={() => router.push('/support')} colors={colors} isRTL={isRTL} />
          <MenuItem icon="shield" label={t.safety_toolkit} sub="Emergency, verification" onPress={() => router.push('/safety')} colors={colors} isRTL={isRTL} last />
        </GlassView>

        <Pressable onPress={async () => { await logout(); router.replace('/login'); }} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }], marginTop: 12 }]}>
          <GlassView style={[styles.signOutBtn, { flexDirection: R }]} borderRadius={20}>
            <LogOut size={20} color={colors.destructive} strokeWidth={2} />
            <Text style={[styles.signOutText, { color: colors.destructive, fontFamily: 'Inter_700Bold' }]}>{t.sign_out}</Text>
          </GlassView>
        </Pressable>

        <Text style={[styles.version, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>VeeGo Driver · Shuttle · v{Constants.expoConfig?.version ?? '—'}</Text>
      </ScrollView>
    </View>
  );
}

function MiniStat({ label, value, icon, colors }: { label: string; value: string; icon?: React.ReactNode; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.miniStat, { backgroundColor: colors.secondary + '99' }]}>
      <View style={styles.miniStatValue}>
        {icon}
        <Text style={[styles.miniStatValueText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{value}</Text>
      </View>
      <Text style={[styles.miniStatLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
    </View>
  );
}

function MenuItem({ icon, label, sub, highlight, onPress, colors, isRTL, last }: { icon: string; label: string; sub?: string; highlight?: boolean; onPress?: () => void; colors: ReturnType<typeof useColors>; isRTL: boolean; last?: boolean }) {
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, { flexDirection: R }, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }, { backgroundColor: pressed ? colors.secondary + '66' : 'transparent' }]}
    >
      <View style={[styles.menuIcon, { backgroundColor: colors.secondary + 'B3' }]}>
        <FeatherIcon name={icon} size={18} color={colors.foreground} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.menuLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{label}</Text>
        {sub && <Text style={[styles.menuSub, { color: highlight ? colors.accent : colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={1}>{sub}</Text>}
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 24, marginBottom: 16 },
  profileCard: {},
  profileCardInner: { padding: 20, alignItems: 'center' },
  avatarWrap: { position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 4 },
  shuttleBadge: { position: 'absolute', bottom: -4, right: -4, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 8 },
  driverName: { fontSize: 20, marginTop: 12 },
  driverMeta: { fontSize: 12, marginTop: 4 },
  statsGrid: { gap: 8, marginTop: 20, width: '100%' },
  miniStat: { flex: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center' },
  miniStatValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniStatValueText: { fontSize: 14 },
  miniStatLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  menuGroup: {},
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 14 },
  menuSub: { fontSize: 12, marginTop: 2 },
  langRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  langChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  langChipText: { fontSize: 11 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  signOutText: { fontSize: 14 },
  version: { fontSize: 12, textAlign: 'center', marginTop: 16 },
});
