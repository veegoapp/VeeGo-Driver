import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AlertTriangle, ArrowLeft, Eye, Mic, MicOff, Phone, Save, Share2, Shield } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { endpoints } from '@/lib/api';
import { useI18n } from '@/lib/i18nContext';

const EC_STORAGE_KEY = 'veego_emergency_contact';

type EmergencyContact = { name: string; phone: string };

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
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [alertBusy, setAlertBusy] = useState(false);

  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecSaved, setEcSaved] = useState(false);
  const ecSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(EC_STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const ec: EmergencyContact = JSON.parse(raw);
          setEcName(ec.name ?? '');
          setEcPhone(ec.phone ?? '');
        } catch { /* ignore */ }
      }
    });
    return () => { if (ecSavedTimer.current) clearTimeout(ecSavedTimer.current); };
  }, []);

  const { data: activeRideRaw } = useQuery({
    queryKey: ['driver-active-ride'],
    queryFn: () => endpoints.rides.active() as Promise<{ id?: string } | null>,
    retry: false,
  });
  const { data: driverRaw } = useQuery({
    queryKey: ['driver'],
    queryFn: () => endpoints.driver.me() as Promise<{ name?: string; phone?: string; vehicle?: { make?: string; model?: string; plate?: string } } | null>,
    retry: false,
  });
  const activeRideId = (activeRideRaw as { id?: string } | null)?.id;

  const handleSaveContact = async () => {
    if (!ecName.trim() || !ecPhone.trim()) {
      Alert.alert(t.error, t.emergency_contact_save_err);
      return;
    }
    try {
      await AsyncStorage.setItem(EC_STORAGE_KEY, JSON.stringify({ name: ecName.trim(), phone: ecPhone.trim() }));
      setEcSaved(true);
      if (ecSavedTimer.current) clearTimeout(ecSavedTimer.current);
      ecSavedTimer.current = setTimeout(() => setEcSaved(false), 3000);
    } catch {
      Alert.alert(t.error, t.emergency_contact_save_err);
    }
  };

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

  const handleWhatsappEmergency = async () => {
    if (whatsappBusy) return;
    const raw = await AsyncStorage.getItem(EC_STORAGE_KEY);
    if (!raw) {
      Alert.alert(t.emergency_contact_required_title, t.whatsapp_emergency_no_contact);
      return;
    }
    let ec: EmergencyContact;
    try { ec = JSON.parse(raw); } catch { return; }
    if (!ec.phone) {
      Alert.alert(t.emergency_contact_required_title, t.whatsapp_emergency_no_contact);
      return;
    }

    setWhatsappBusy(true);
    try {
      const coords = await tryGetLocation();
      const driver = driverRaw;
      const mapLink = coords.latitude !== 0
        ? `https://maps.google.com/?q=${coords.latitude},${coords.longitude}`
        : '';
      const vehicleInfo = driver?.vehicle
        ? `${driver.vehicle.make ?? ''} ${driver.vehicle.model ?? ''} · ${driver.vehicle.plate ?? ''}`.trim()
        : '';
      const lines = [
        '🚨 EMERGENCY ALERT 🚨',
        `Driver: ${driver?.name ?? '—'} | ${driver?.phone ?? '—'}`,
        vehicleInfo ? `Vehicle: ${vehicleInfo}` : '',
        activeRideId ? `Trip ID: ${activeRideId}` : '',
        mapLink ? `📍 Live Location: ${mapLink}` : '📍 Location unavailable',
      ].filter(Boolean).join('\n');

      const encoded = encodeURIComponent(lines);
      const phoneClean = ec.phone.replace(/\D/g, '');
      await Linking.openURL(`whatsapp://send?phone=${phoneClean}&text=${encoded}`);
      Alert.alert(t.whatsapp_emergency_sent_title, t.whatsapp_emergency_sent_msg);
    } catch {
      Alert.alert(t.error, t.whatsapp_emergency_no_contact);
    } finally {
      setWhatsappBusy(false);
    }
  };

  const handleEmergencyAlert = async () => {
    if (alertBusy) return;
    setAlertBusy(true);
    try {
      const coords = await tryGetLocation();
      if (activeRideId) {
        await endpoints.rides.sos(activeRideId, { latitude: coords.latitude, longitude: coords.longitude });
      }
      Alert.alert(t.emergency_alert_sent_title, t.emergency_alert_sent_msg);
    } catch {
      Alert.alert(t.error, t.emergency_alert_err);
    } finally {
      setAlertBusy(false);
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

        {/* Emergency actions */}
        <View style={{ marginTop: 20, gap: 8 }}>
          <Pressable
            onPress={() => Linking.openURL('tel:122')}
            style={({ pressed }) => [styles.emergencyBtn, { backgroundColor: colors.destructive, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <Phone size={20} color={colors.destructiveForeground} strokeWidth={2} />
            <Text style={[styles.emergencyText, { color: colors.destructiveForeground, fontFamily: 'Inter_700Bold' }]}>{t.call_police_label}</Text>
          </Pressable>

          <Pressable
            onPress={handleEmergencyAlert}
            disabled={alertBusy}
            style={({ pressed }) => [styles.emergencyBtn, { backgroundColor: '#dc2626', transform: [{ scale: pressed ? 0.98 : 1 }], opacity: alertBusy ? 0.6 : 1 }]}
          >
            <AlertTriangle size={20} color="#fff" strokeWidth={2} />
            <Text style={[styles.emergencyText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>
              {alertBusy ? t.share_trip_loading : t.emergency_alert_sent_title}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleWhatsappEmergency}
            disabled={whatsappBusy}
            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }], opacity: whatsappBusy ? 0.6 : 1 }]}
          >
            <GlassView style={styles.safetyItem} borderRadius={20}>
              <View style={[styles.itemIcon, { backgroundColor: '#25D36626' }]}>
                <Share2 size={18} color="#25D366" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.whatsapp_emergency_title}</Text>
                <Text style={[styles.itemSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {whatsappBusy ? t.whatsapp_emergency_busy : t.whatsapp_emergency_sub}
                </Text>
              </View>
            </GlassView>
          </Pressable>
        </View>

        {/* Standard safety tools */}
        <View style={{ marginTop: 8, gap: 8 }}>
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

        {/* Emergency Contact */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
          {t.emergency_contact_section}
        </Text>
        <GlassView style={styles.ecCard} borderRadius={20}>
          <TextInput
            value={ecName}
            onChangeText={setEcName}
            placeholder={t.emergency_contact_name_ph}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.ecInput, { color: colors.foreground, backgroundColor: colors.secondary, fontFamily: 'Inter_400Regular' }]}
          />
          <TextInput
            value={ecPhone}
            onChangeText={setEcPhone}
            placeholder={t.emergency_contact_phone_ph}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            style={[styles.ecInput, { color: colors.foreground, backgroundColor: colors.secondary, fontFamily: 'Inter_400Regular' }]}
          />
          <Pressable
            onPress={handleSaveContact}
            style={({ pressed }) => [
              styles.ecSaveBtn,
              { backgroundColor: ecSaved ? colors.primary : colors.secondary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Save size={16} color={ecSaved ? '#fff' : colors.foreground} strokeWidth={2} />
            <Text style={[styles.ecSaveBtnText, { color: ecSaved ? '#fff' : colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {ecSaved ? t.emergency_contact_saved_title : t.emergency_contact_save}
            </Text>
          </Pressable>
        </GlassView>
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
  emergencyBtn: { height: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 8, shadowColor: '#E85454', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  emergencyText: { fontSize: 16 },
  safetyItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  itemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14 },
  itemSub: { fontSize: 12, marginTop: 2 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  activeBadgeText: { fontSize: 10, letterSpacing: 0.5 },
  sectionTitle: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: 28, marginBottom: 12 },
  ecCard: { padding: 16, gap: 10 },
  ecInput: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  ecSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 14 },
  ecSaveBtnText: { fontSize: 14 },
});
