import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, Eye, Mic, MicOff, Phone, Share2, Shield } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { endpoints } from '@/lib/api';
import { useI18n } from '@/lib/i18nContext';

async function tryGetLocation(): Promise<{ latitude: number; longitude: number }> {
  try {
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { latitude: 0, longitude: 0 };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return { latitude: 0, longitude: 0 };
  }
}

export default function SafetyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [shareBusy, setShareBusy] = useState(false);
  const [rideCheckBusy, setRideCheckBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);

  const { data: activeRideRaw } = useQuery({
    queryKey: ['driver-active-ride'],
    queryFn: () => endpoints.rides.active() as Promise<{ id?: string } | null>,
    retry: false,
  });
  const activeRideId = (activeRideRaw as { id?: string } | null)?.id;

  const handleShareTrip = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const result = await endpoints.safety.shareTrip({ rideId: activeRideId });
      Alert.alert(t.share_trip_success_title, result.message ?? t.share_trip_sub);
    } catch {
      Alert.alert(t.error, t.share_trip_error);
    } finally {
      setShareBusy(false);
    }
  };

  const handleRideCheck = async () => {
    if (rideCheckBusy) return;
    setRideCheckBusy(true);
    try {
      const coords = await tryGetLocation();
      const result = await endpoints.safety.rideCheck({ rideId: activeRideId, ...coords });
      Alert.alert(t.ridecheck_success_title, result.message ?? t.ridecheck_sub);
    } catch {
      Alert.alert(t.error, t.ridecheck_error);
    } finally {
      setRideCheckBusy(false);
    }
  };

  const handleRecording = async () => {
    if (recordBusy) return;
    setRecordBusy(true);
    const action = isRecording ? 'stop' : 'start';
    try {
      await endpoints.safety.recording({ rideId: activeRideId, action });
      setIsRecording(!isRecording);
      if (action === 'start') {
        Alert.alert(t.audio_rec_started_title, t.audio_rec_started_msg);
      } else {
        Alert.alert(t.audio_rec_stopped_title, t.audio_rec_stopped_msg);
      }
    } catch {
      Alert.alert(t.error, t.audio_rec_toggle_error);
    } finally {
      setRecordBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </Pressable>

        <View style={styles.titleRow}>
          <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.titleIcon}>
            <Shield size={24} color={colors.primaryForeground} strokeWidth={2} />
          </LinearGradient>
          <View>
            <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.help_safety}</Text>
            <Text style={[styles.pageSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.safety_available_24_7}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => Linking.openURL('tel:197')}
          style={({ pressed }) => [styles.emergencyBtn, { backgroundColor: colors.destructive, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        >
          <Phone size={20} color={colors.destructiveForeground} strokeWidth={2} />
          <Text style={[styles.emergencyText, { color: colors.destructiveForeground, fontFamily: 'Inter_700Bold' }]}>Emergency · 197</Text>
        </Pressable>

        <View style={{ marginTop: 20, gap: 8 }}>
          <Pressable
            onPress={handleShareTrip}
            disabled={shareBusy}
            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }], opacity: shareBusy ? 0.6 : 1 }]}
          >
            <GlassView style={styles.safetyItem} borderRadius={20}>
              <View style={[styles.itemIcon, { backgroundColor: colors.primary + '26' }]}>
                <Share2 size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.share_trip_title}</Text>
                <Text style={[styles.itemSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {shareBusy ? t.share_trip_loading : t.share_trip_sub}
                </Text>
              </View>
            </GlassView>
          </Pressable>

          <Pressable
            onPress={handleRideCheck}
            disabled={rideCheckBusy}
            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }], opacity: rideCheckBusy ? 0.6 : 1 }]}
          >
            <GlassView style={styles.safetyItem} borderRadius={20}>
              <View style={[styles.itemIcon, { backgroundColor: colors.primary + '26' }]}>
                <Eye size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.ridecheck_title}</Text>
                <Text style={[styles.itemSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {rideCheckBusy ? t.ridecheck_activating : t.ridecheck_sub}
                </Text>
              </View>
            </GlassView>
          </Pressable>

          <Pressable
            onPress={handleRecording}
            disabled={recordBusy}
            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }], opacity: recordBusy ? 0.6 : 1 }]}
          >
            <GlassView style={styles.safetyItem} borderRadius={20}>
              <View style={[styles.itemIcon, { backgroundColor: isRecording ? '#ef444426' : colors.primary + '26' }]}>
                {isRecording
                  ? <MicOff size={18} color="#ef4444" strokeWidth={2} />
                  : <Mic size={18} color={colors.primary} strokeWidth={2} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                  {isRecording ? t.audio_rec_stop_title : t.audio_rec_start_title}
                </Text>
                <Text style={[styles.itemSub, { color: isRecording ? '#ef4444' : colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {recordBusy
                    ? (isRecording ? t.audio_rec_stopping : t.audio_rec_starting)
                    : isRecording
                      ? t.audio_rec_active_sub
                      : t.audio_rec_default_sub}
                </Text>
              </View>
              {isRecording && (
                <View style={[styles.activeBadge, { backgroundColor: '#ef444420', borderColor: '#ef444460' }]}>
                  <View style={[styles.activeDot, { backgroundColor: '#ef4444' }]} />
                  <Text style={[styles.activeBadgeText, { color: '#ef4444', fontFamily: 'Inter_700Bold' }]}>LIVE</Text>
                </View>
              )}
            </GlassView>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  titleIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#2d2d42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  pageTitle: { fontSize: 24 },
  pageSub: { fontSize: 12, marginTop: 2 },
  emergencyBtn: { marginTop: 24, height: 64, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 8, shadowColor: '#E85454', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  emergencyText: { fontSize: 18 },
  safetyItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  itemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14 },
  itemSub: { fontSize: 12, marginTop: 2 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  activeBadgeText: { fontSize: 10, letterSpacing: 0.5 },
});
