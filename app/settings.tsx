import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { FeatherIcon } from '@/lib/iconMap';
import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

type SettingsData = {
  push_notifications?: boolean;
  sound?: boolean;
  biometric?: boolean;
  [key: string]: unknown;
};

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [pushOn, setPushOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [bioOn, setBioOn] = useState(true);

  const TA = isRTL ? 'right' as const : 'left' as const;

  const { data: settingsData, isLoading } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: () => endpoints.settings.get() as Promise<SettingsData>,
  });

  useEffect(() => {
    if (!settingsData) return;
    if (settingsData.push_notifications !== undefined) setPushOn(settingsData.push_notifications);
    if (settingsData.sound !== undefined) setSoundOn(settingsData.sound);
    if (settingsData.biometric !== undefined) setBioOn(settingsData.biometric);
  }, [settingsData]);

  const updateSetting = async (key: string, value: boolean) => {
    try {
      await endpoints.settings.update({ [key]: value });
    } catch {
      // best-effort: local state already changed, revert silently would confuse the user
    }
  };

  const handlePushChange = (v: boolean) => {
    setPushOn(v);
    updateSetting('push_notifications', v);
  };

  const handleSoundChange = (v: boolean) => {
    setSoundOn(v);
    updateSetting('sound', v);
  };

  const handleBioChange = (v: boolean) => {
    setBioOn(v);
    updateSetting('biometric', v);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.settings_label}</Text>

        {isLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Loading settings…
            </Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.preferences}</Text>
        <GlassView style={{ marginTop: 8 }} borderRadius={20}>
          <SettingRow icon="globe" label={t.language} value="English" colors={colors} isRTL={isRTL} />
          <SettingRow icon="map-pin" label={t.country} value="Tunisia" colors={colors} isRTL={isRTL} />
          <SettingRow icon="moon" label={t.appearance} value="Dark" colors={colors} isRTL={isRTL} last />
        </GlassView>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: 20, textAlign: TA }]}>{t.notifications}</Text>
        <GlassView style={{ marginTop: 8 }} borderRadius={20}>
          <ToggleRow icon="bell" label={t.push_notifs} value={pushOn} onChange={handlePushChange} colors={colors} isRTL={isRTL} />
          <ToggleRow icon="volume-2" label={t.sound_new_trips} value={soundOn} onChange={handleSoundChange} colors={colors} isRTL={isRTL} last />
        </GlassView>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: 20, textAlign: TA }]}>{t.security_title}</Text>
        <GlassView style={{ marginTop: 8 }} borderRadius={20}>
          <ToggleRow icon="lock" label={t.biometric} value={bioOn} onChange={handleBioChange} colors={colors} isRTL={isRTL} />
          <SettingRow icon={undefined} label={t.change_pin} onPress={() => Alert.alert('Coming soon')} colors={colors} isRTL={isRTL} />
          <SettingRow icon={undefined} label={t.privacy_policy} colors={colors} isRTL={isRTL} />
          <SettingRow icon={undefined} label={t.terms_of_service} colors={colors} isRTL={isRTL} last />
        </GlassView>
      </ScrollView>
    </View>
  );
}

function SettingRow({ icon, label, value, onPress, colors, isRTL, last }: { icon?: string; label: string; value?: string; onPress?: () => void; colors: ReturnType<typeof useColors>; isRTL: boolean; last?: boolean }) {
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { flexDirection: R }, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }, pressed && { backgroundColor: colors.secondary + '66' }]}>
      {icon
        ? <FeatherIcon name={icon} size={18} color={colors.mutedForeground} />
        : <View style={{ width: 18 }} />
      }
      <Text style={[styles.rowLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: TA }]}>{label}</Text>
      {value && <Text style={[styles.rowValue, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{value}</Text>}
      <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
    </Pressable>
  );
}

function ToggleRow({ icon, label, value, onChange, colors, isRTL, last }: { icon: string; label: string; value: boolean; onChange: (v: boolean) => void; colors: ReturnType<typeof useColors>; isRTL: boolean; last?: boolean }) {
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  return (
    <View style={[styles.row, { flexDirection: R }, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <FeatherIcon name={icon} size={18} color={colors.mutedForeground} />
      <Text style={[styles.rowLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: TA }]}>{label}</Text>
      <Pressable onPress={() => onChange(!value)} style={[styles.toggle, { backgroundColor: value ? undefined : colors.secondary }]}>
        {value ? (
          <LinearGradient colors={['#2d2d42', '#1e1e28']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />
        ) : null}
        <View style={[styles.toggleThumb, { left: value ? 22 : 2, backgroundColor: '#fff' }]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageTitle: { fontSize: 24, marginTop: 24, marginBottom: 8 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  loadingText: { fontSize: 13 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', marginTop: 8, marginBottom: 4 },
  row: { alignItems: 'center', gap: 12, padding: 16 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 12, marginRight: 4 },
  toggle: { width: 44, height: 24, borderRadius: 12, position: 'relative', overflow: 'hidden' },
  toggleThumb: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 2 },
});
