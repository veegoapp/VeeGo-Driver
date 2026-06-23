import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Award, ChevronRight, Copy, LogOut, Moon, Star, Sun } from 'lucide-react-native';
import { FeatherIcon } from '@/lib/iconMap';
import React, { useState, useCallback } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useService } from '@/lib/serviceContext';
import { useI18n } from '@/lib/i18nContext';
import type { Language } from '@/lib/i18nContext';
import { useAuth } from '@/lib/authContext';
import { endpoints } from '@/lib/api';
import { TermsModal } from '@/components/TermsModal';
import { TAB_BAR_HEIGHT } from './home';

const TERMS_VERSION_KEY = 'driver_terms_accepted_version';
type TermsData = { id: number; version: number; contentAr: string; contentEn: string; updatedAt: string };

const LANGUAGES: { label: string; value: Language }[] = [
  { label: 'English', value: 'en' },
  { label: 'العربية', value: 'ar' },
];

type DriverProfile = {
  id: string;
  name: string;
  rating: number;
  avatar: string;
  trips: number;
  acceptanceRate: number;
  cancelRate: number;
  level: string;
  referralCode?: string;
  vehicle?: { make: string; model: string; plate: string; year?: number | string | null; color?: string | null };
};

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { isDarkMode, setIsDarkMode } = useService();
  const { t, isRTL, language, setLanguage } = useI18n();
  const { logout } = useAuth();
  const [codeCopied, setCodeCopied] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [termsData, setTermsData] = useState<TermsData | null>(null);
  const [termsLoading, setTermsLoading] = useState(false);
  const [termsAcceptLoading, setTermsAcceptLoading] = useState(false);
  const [acceptedVersion, setAcceptedVersion] = useState<number | null>(null);

  React.useEffect(() => {
    AsyncStorage.getItem(TERMS_VERSION_KEY).then(v => {
      if (v) setAcceptedVersion(Number(v));
    });
  }, []);

  const handleOpenTerms = useCallback(async () => {
    setTermsLoading(true);
    try {
      const data = await endpoints.terms.fetchDriver();
      setTermsData(data);
      setTermsModalVisible(true);
    } catch {
      Alert.alert('', 'Failed to load terms. Please try again.');
    } finally {
      setTermsLoading(false);
    }
  }, []);

  const handleAcceptTerms = useCallback(async () => {
    if (!termsData) return;
    setTermsAcceptLoading(true);
    try {
      await endpoints.terms.accept(termsData.version);
      await AsyncStorage.setItem(TERMS_VERSION_KEY, String(termsData.version));
      setAcceptedVersion(termsData.version);
      setTermsModalVisible(false);
    } catch {
      // fail silently, user can try again
    } finally {
      setTermsAcceptLoading(false);
    }
  }, [termsData]);

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { data: driverRaw, isLoading } = useQuery<DriverProfile>({
    queryKey: ['driver'],
    queryFn: endpoints.driver.me as () => Promise<DriverProfile>,
  });

  const { data: documentsRaw } = useQuery({
    queryKey: ['driver-documents'],
    queryFn: endpoints.driver.documents,
    staleTime: 5 * 60 * 1000,
  });

  const documentsArray: { type: string; fileUrl?: string; url?: string }[] = Array.isArray(documentsRaw)
    ? documentsRaw
    : Array.isArray((documentsRaw as any)?.data)
      ? (documentsRaw as any).data
      : [];

  const profilePhotoUrl = documentsArray.find(d => d.type === 'profile_photo')?.fileUrl
    ?? documentsArray.find(d => d.type === 'profile_photo')?.url
    ?? null;

  const driver = driverRaw;
  const avatarUri = driver?.avatar ?? profilePhotoUrl ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(driver?.name ?? 'Driver')}&background=1e1e28&color=fff`;

  const handleCopyCode = async () => {
    const code = driver?.referralCode;
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);
  };

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
                    source={{ uri: avatarUri }}
                    style={[styles.avatar, { borderColor: colors.primary + '66' }]}
                  />
                  <LinearGradient colors={['#2d2d42', '#D5B23D']} style={styles.awardBadge}>
                    <Award size={16} color={colors.primaryForeground} strokeWidth={2} />
                  </LinearGradient>
                </View>
                <Text style={[styles.driverName, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>
                  {driver?.name ?? '—'}
                </Text>
                <Text style={[styles.driverMeta, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }]}>
                  {driver?.level ?? '—'} · {driver?.trips ?? '—'} {t.trips}
                </Text>
                {driver?.referralCode ? (
                  <Pressable onPress={handleCopyCode} style={[styles.driverCodeRow, { backgroundColor: colors.secondary + 'B3', borderColor: colors.border }]}>
                    <Text style={[styles.driverCodeLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{t.driver_code_label}</Text>
                    <Text style={[styles.driverCodeValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{driver.referralCode}</Text>
                    <Copy size={14} color={codeCopied ? colors.primary : colors.mutedForeground} strokeWidth={2} />
                    {codeCopied && <Text style={[styles.codeCopiedText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>{t.driver_code_copied}</Text>}
                  </Pressable>
                ) : null}
                <View style={[styles.statsGrid, { flexDirection: R }]}>
                  <MiniStat label={t.rating_stat} value={driver?.rating?.toFixed(2) ?? '—'} icon={<Star size={14} color={colors.accent} fill={colors.accent} strokeWidth={2} />} colors={colors} />
                  <MiniStat label={t.accept_rate} value={driver?.acceptanceRate != null ? `${driver.acceptanceRate}%` : '—'} colors={colors} />
                  <MiniStat label={t.cancel_rate} value={driver?.cancelRate != null ? `${driver.cancelRate}%` : '—'} colors={colors} />
                </View>
              </>
            )}
          </View>
        </GlassView>

        <GlassView style={styles.menuGroup} borderRadius={20}>
          <MenuItem icon="user" label={t.profile_info_label} onPress={() => router.push('/personal-info')} colors={colors} isRTL={isRTL} />
          <MenuItem icon="star" label={t.ratings_reviews} sub={driver?.trips ? `${driver.trips} reviews` : '—'} onPress={() => router.push('/ratings')} colors={colors} isRTL={isRTL} />
          <MenuItem
            icon="truck"
            label={t.vehicle_label}
            sub={driver?.vehicle ? [driver.vehicle.make, driver.vehicle.model, driver.vehicle.year, driver.vehicle.color].filter(Boolean).join(' ') + (driver.vehicle.plate ? ` · ${driver.vehicle.plate}` : '') : '—'}
            onPress={() => router.push('/vehicle')}
            colors={colors}
            isRTL={isRTL}
          />
          <MenuItem icon="file-text" label={t.documents_label} onPress={() => router.push('/documents')} colors={colors} isRTL={isRTL} />
          <MenuItem icon="target" label={t.bonus_targets} onPress={() => router.push('/bonus-targets')} colors={colors} isRTL={isRTL} />
          <MenuItem icon="clock" label={t.ride_history_label} sub={t.ride_history_sub} onPress={() => router.push('/ride/history' as any)} colors={colors} isRTL={isRTL} />
          <MenuItem icon="shield" label={t.safety_toolkit} sub={t.safety_sub} onPress={() => router.push('/safety')} colors={colors} isRTL={isRTL} last />
        </GlassView>

        <GlassView style={[styles.menuGroup, { marginTop: 12 }]} borderRadius={20}>
          <MenuItem icon="help-circle" label={t.help_support} onPress={() => router.push('/support')} colors={colors} isRTL={isRTL} />
          <MenuItem icon="message-square" label={t.messages_label} onPress={() => router.push('/messages')} colors={colors} isRTL={isRTL} />
          <MenuItem icon="file-text" label={t.terms_menu_label} onPress={handleOpenTerms} colors={colors} isRTL={isRTL} sub={termsLoading ? '...' : undefined} />

          {/* Language inline toggle */}
          <View style={[styles.menuItem, { flexDirection: R, borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={[styles.menuIcon, { backgroundColor: colors.secondary + 'B3' }]}>
              <Text style={{ fontSize: 18 }}>🌐</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.language}</Text>
              <View style={[styles.langRow, { flexDirection: R }]}>
                {LANGUAGES.map(({ label, value }) => (
                  <Pressable
                    key={value}
                    onPress={() => setLanguage(value)}
                    style={[
                      styles.langChip,
                      {
                        backgroundColor: language === value ? colors.primary : colors.secondary + 'B3',
                        borderColor: language === value ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.langChipText, { color: language === value ? '#fff' : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Dark mode toggle */}
          <View style={[styles.menuItem, { flexDirection: R, borderTopWidth: 1, borderTopColor: colors.border, borderBottomWidth: 0 }]}>
            <View style={[styles.menuIcon, { backgroundColor: colors.secondary + 'B3' }]}>
              {isDarkMode
                ? <Moon size={18} color={colors.foreground} strokeWidth={2} />
                : <Sun size={18} color={colors.foreground} strokeWidth={2} />
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.dark_mode}</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                {isDarkMode ? t.dark_theme_active : t.light_theme_active}
              </Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={setIsDarkMode}
              trackColor={{ false: colors.secondary, true: colors.primary }}
              thumbColor={'#fff'}
            />
          </View>
        </GlassView>

        <Pressable onPress={async () => { await logout(); router.replace('/login'); }} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }], marginTop: 12 }]}>
          <GlassView style={[styles.signOutBtn, { flexDirection: R }]} borderRadius={20}>
            <LogOut size={20} color={colors.destructive} strokeWidth={2} />
            <Text style={[styles.signOutText, { color: colors.destructive, fontFamily: 'Inter_700Bold' }]}>{t.sign_out}</Text>
          </GlassView>
        </Pressable>

        <Text style={[styles.version, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>VeeGo Driver · v{Constants.expoConfig?.version ?? '—'}</Text>
      </ScrollView>

      {termsData && (
        <TermsModal
          visible={termsModalVisible}
          contentEn={termsData.contentEn}
          contentAr={termsData.contentAr}
          showAcceptButton={acceptedVersion == null || termsData.version > acceptedVersion}
          acceptLoading={termsAcceptLoading}
          onAccept={handleAcceptTerms}
          onClose={() => setTermsModalVisible(false)}
        />
      )}
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
      <Text style={[styles.miniStatLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>{label}</Text>
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
  pageTitle: { fontSize: 24, marginBottom: 20 },
  profileCard: {},
  profileCardInner: { padding: 20, alignItems: 'center' },
  avatarWrap: { position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 4 },
  awardBadge: { position: 'absolute', bottom: -4, right: -4, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 8 },
  driverName: { fontSize: 20, marginTop: 12 },
  driverMeta: { fontSize: 12, marginTop: 4 },
  driverCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12 },
  driverCodeLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  driverCodeValue: { fontSize: 14, flex: 1 },
  codeCopiedText: { fontSize: 11 },
  statsGrid: { gap: 8, marginTop: 20, width: '100%' },
  miniStat: { flex: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center' },
  miniStatValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniStatValueText: { fontSize: 14 },
  miniStatLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  menuGroup: { marginTop: 20 },
  menuItem: { alignItems: 'center', gap: 12, padding: 16 },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 14 },
  menuSub: { fontSize: 12, marginTop: 2 },
  langRow: { gap: 8, marginTop: 8, flexWrap: 'wrap' },
  langChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  langChipText: { fontSize: 13 },
  signOutBtn: { alignItems: 'center', gap: 12, padding: 16 },
  signOutText: { fontSize: 14 },
  version: { fontSize: 12, textAlign: 'center', marginTop: 16 },
});
