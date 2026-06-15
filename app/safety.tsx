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
      Alert.alert('Trip Shared', result.message ?? 'Your trip status has been shared with your emergency contact.');
    } catch {
      Alert.alert('Error', 'Could not share trip status. Please try again.');
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
      Alert.alert('RideCheck Activated', result.message ?? 'Monitoring is active. We will alert if anything seems wrong.');
    } catch {
      Alert.alert('Error', 'Could not activate RideCheck. Please try again.');
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
        Alert.alert('Recording Started', 'Audio is being recorded and encrypted securely.');
      } else {
        Alert.alert('Recording Stopped', 'Recording has been saved and encrypted.');
      }
    } catch {
      Alert.alert('Error', 'Could not toggle audio recording. Please try again.');
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
            <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Safety toolkit</Text>
            <Text style={[styles.pageSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Available 24/7 while you're driving</Text>
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
          {/* Share trip status */}
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
                <Text style={[styles.itemTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Share trip status</Text>
                <Text style={[styles.itemSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {shareBusy ? 'Sharing...' : 'Send live location to your emergency contact'}
                </Text>
              </View>
            </GlassView>
          </Pressable>

          {/* RideCheck */}
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
                <Text style={[styles.itemTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>RideCheck</Text>
                <Text style={[styles.itemSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {rideCheckBusy ? 'Activating...' : "We monitor your trip and alert if anything's wrong"}
                </Text>
              </View>
            </GlassView>
          </Pressable>

          {/* Audio recording */}
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
                  {isRecording ? 'Stop recording' : 'Audio recording'}
                </Text>
                <Text style={[styles.itemSub, { color: isRecording ? '#ef4444' : colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {recordBusy
                    ? (isRecording ? 'Stopping...' : 'Starting...')
                    : isRecording
                      ? 'Recording in progress — tap to stop'
                      : 'Encrypted recordings during trips'}
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
