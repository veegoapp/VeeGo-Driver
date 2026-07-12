import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, Phone, Save, Shield, User } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints, type EmergencyContact } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';

// SOS Phase 1: the emergency contact now lives on the backend (one per
// driver) instead of only on-device. We still mirror it into AsyncStorage
// under the same key so the shuttle trip SOS flow (app/shuttle/trip-active.tsx),
// which reads this key directly, keeps working unchanged.
const EC_STORAGE_KEY = 'veego_emergency_contact';

export default function SafetyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const topPad = insets.top;
  const TA = isRTL ? 'right' as const : 'left' as const;
  const queryClient = useQueryClient();

  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecSaved, setEcSaved] = useState(false);
  const ecSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: savedContact } = useQuery({
    queryKey: ['emergency-contact'],
    queryFn: endpoints.emergencyContact.get,
  });

  useEffect(() => {
    if (savedContact) {
      setEcName(savedContact.name);
      setEcPhone(savedContact.phone);
      AsyncStorage.setItem(EC_STORAGE_KEY, JSON.stringify(savedContact)).catch(() => { /* ignore */ });
    }
    return () => { if (ecSavedTimer.current) clearTimeout(ecSavedTimer.current); };
  }, [savedContact]);

  const saveMutation = useMutation({
    mutationFn: (contact: EmergencyContact) => endpoints.emergencyContact.update(contact),
    onSuccess: (contact) => {
      queryClient.setQueryData(['emergency-contact'], contact);
      AsyncStorage.setItem(EC_STORAGE_KEY, JSON.stringify(contact)).catch(() => { /* ignore */ });
      setEcSaved(true);
      if (ecSavedTimer.current) clearTimeout(ecSavedTimer.current);
      ecSavedTimer.current = setTimeout(() => setEcSaved(false), 3000);
    },
    onError: () => {
      Alert.alert(t.error, t.emergency_contact_save_err);
    },
  });

  const handleSaveContact = () => {
    if (!ecName.trim() || !ecPhone.trim()) {
      Alert.alert(t.error, t.emergency_contact_save_err);
      return;
    }
    saveMutation.mutate({ name: ecName.trim(), phone: ecPhone.trim() });
  };

  const handleOpenWhatsApp = () => {
    if (!savedContact?.phone) return;
    const phoneClean = savedContact.phone.replace(/\D/g, '');
    Linking.openURL(`whatsapp://send?phone=${phoneClean}`).catch(() =>
      Alert.alert('WhatsApp', t.whatsapp_emergency_no_contact)
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 48, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </Pressable>

        {/* Title */}
        <View style={[styles.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.titleIcon}>
            <Shield size={24} color="#fff" strokeWidth={2} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.foreground, textAlign: TA }]}>
              {t.safety_toolkit}
            </Text>
            <Text style={[styles.pageSub, { color: colors.mutedForeground, textAlign: TA }]}>
              {t.safety_contact_subtitle}
            </Text>
          </View>
        </View>

        {/* Saved contact display card */}
        {savedContact?.phone ? (
          <GlassView style={[styles.savedCard, { marginTop: 28 }]} borderRadius={20}>
            <View style={[styles.savedHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.savedAvatar, { backgroundColor: colors.primary + '22' }]}>
                <User size={22} color={colors.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, paddingHorizontal: Spacing.md }}>
                <Text style={[styles.savedName, { color: colors.foreground, textAlign: TA }]}>
                  {savedContact.name}
                </Text>
                <Text style={[styles.savedPhone, { color: colors.mutedForeground, textAlign: TA }]}>
                  {savedContact.phone}
                </Text>
              </View>
            </View>

            <View style={[styles.savedActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable
                onPress={() => Linking.openURL(`tel:${savedContact.phone.replace(/\D/g, '')}`)}
                style={[styles.savedActionBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}
              >
                <Phone size={16} color={colors.primary} strokeWidth={2} />
                <Text style={[styles.savedActionText, { color: colors.primary }]}>
                  {t.call_police_label.split('·')[0].trim()}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleOpenWhatsApp}
                style={[styles.savedActionBtn, { backgroundColor: '#25D36615', borderColor: '#25D36640' }]}
              >
                <Text style={{ fontSize: Typography.size.md }}>💬</Text>
                <Text style={[styles.savedActionText, { color: '#25D366' }]}>
                  {t.safety_open_whatsapp}
                </Text>
              </Pressable>
            </View>
          </GlassView>
        ) : (
          <View style={[styles.emptyContactCard, { backgroundColor: colors.secondary, borderColor: colors.border, marginTop: 28 }]}>
            <User size={28} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.emptyContactText, { color: colors.mutedForeground }]}>
              {t.safety_no_contact_yet}
            </Text>
          </View>
        )}

        {/* Form */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, textAlign: TA }]}>
          {t.emergency_contact_section}
        </Text>

        <GlassView style={styles.formCard} borderRadius={20}>
          <TextInput
            value={ecName}
            onChangeText={setEcName}
            placeholder={t.emergency_contact_name_ph}
            placeholderTextColor={colors.mutedForeground}
            textAlign={isRTL ? 'right' : 'left'}
            style={[
              styles.ecInput,
              {
                color: colors.foreground,
                backgroundColor: colors.secondary,
                borderColor: colors.border,
              },
            ]}
          />
          <TextInput
            value={ecPhone}
            onChangeText={setEcPhone}
            placeholder={t.emergency_contact_phone_ph}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            textAlign={isRTL ? 'right' : 'left'}
            style={[
              styles.ecInput,
              {
                color: colors.foreground,
                backgroundColor: colors.secondary,
                borderColor: colors.border,
              },
            ]}
          />
          <Pressable
            onPress={handleSaveContact}
            disabled={saveMutation.isPending}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: ecSaved ? colors.success : colors.primary,
                opacity: pressed || saveMutation.isPending ? 0.85 : 1,
              },
            ]}
          >
            <Save size={17} color="#fff" strokeWidth={2} />
            <Text style={[styles.saveBtnText, { color: '#fff' }]}>
              {ecSaved ? t.emergency_contact_saved_title : t.emergency_contact_save}
            </Text>
          </Pressable>
        </GlassView>

        {/* Info note */}
        <View style={[styles.infoNote, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '40' }]}>
          <Text style={{ fontSize: 20 }}>💡</Text>
          <Text style={[styles.infoNoteText, { color: colors.foreground, textAlign: TA }]}>
            {t.safety_sos_note}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  titleRow: { alignItems: 'center', gap: 14, marginTop: Spacing.xl },
  titleIcon: {
    width: 52, height: 52, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: Shadows.large.elevation,
  },
  pageTitle: { fontSize: Typography.size.xl, fontFamily: 'Inter_700Bold' },
  pageSub: { fontSize: 13, marginTop: 3, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  savedCard: { padding: Spacing.lg, gap: 14 },
  savedHeader: { alignItems: 'center', gap: Spacing.md },
  savedAvatar: {
    width: 48, height: 48, borderRadius: Radius.xl,
    alignItems: 'center', justifyContent: 'center',
  },
  savedName: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  savedPhone: { fontSize: Typography.size.sm, marginTop: 2, fontFamily: 'Inter_400Regular' },
  savedActions: { gap: 10, marginTop: Spacing.xs },
  savedActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 11, borderRadius: 14, borderWidth: 1,
  },
  savedActionText: { fontSize: Typography.size.sm, fontFamily: 'Inter_700Bold' },
  emptyContactCard: {
    alignItems: 'center', gap: 10, paddingVertical: Spacing.xxl,
    borderRadius: 18, borderWidth: 1,
  },
  emptyContactText: { fontSize: Typography.size.sm, fontFamily: 'Inter_400Regular' },
  sectionLabel: {
    fontSize: Typography.size.xs, letterSpacing: 2, textTransform: 'uppercase',
    marginTop: Spacing.xxl, marginBottom: Spacing.md, fontFamily: 'Inter_700Bold',
  },
  formCard: { padding: Spacing.lg, gap: 10 },
  ecInput: {
    borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: Spacing.md,
    fontSize: 15, borderWidth: 1, fontFamily: 'Inter_400Regular',
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, height: 50, borderRadius: Radius.lg, marginTop: Spacing.xs,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: Shadows.medium.elevation,
  },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  infoNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginTop: 20, borderRadius: 14, borderWidth: 1, padding: 14,
  },
  infoNoteText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
});
