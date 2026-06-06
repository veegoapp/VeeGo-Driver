import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, Eye, Mic, Phone, Share2, Shield } from 'lucide-react-native';
import React from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';

const SAFETY_ITEMS = [
  { Icon: Share2, title: 'Share trip status', sub: 'Send live location to a trusted contact' },
  { Icon: Eye, title: 'RideCheck', sub: "We monitor your trip and alert if anything's wrong" },
  { Icon: Mic, title: 'Audio recording', sub: 'Encrypted recordings during trips' },
  { Icon: Shield, title: 'Driver verification', sub: 'Verify your identity before going online' },
] as const;

export default function SafetyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
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

        <Pressable onPress={() => Linking.openURL('tel:197')} style={({ pressed }) => [styles.emergencyBtn, { backgroundColor: colors.destructive, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
          <Phone size={20} color={colors.destructiveForeground} strokeWidth={2} />
          <Text style={[styles.emergencyText, { color: colors.destructiveForeground, fontFamily: 'Inter_700Bold' }]}>Emergency · 197</Text>
        </Pressable>

        <View style={{ marginTop: 20, gap: 8 }}>
          {SAFETY_ITEMS.map(item => (
            <Pressable key={item.title} onPress={() => router.push('/support')} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
              <GlassView style={styles.safetyItem} borderRadius={20}>
                <View style={[styles.itemIcon, { backgroundColor: colors.primary + '26' }]}>
                  <item.Icon size={18} color={colors.primary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{item.title}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{item.sub}</Text>
                </View>
              </GlassView>
            </Pressable>
          ))}
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
});
