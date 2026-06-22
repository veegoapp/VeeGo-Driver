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
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';

const EC_STORAGE_KEY = 'veego_emergency_contact';

type EmergencyContact = { name: string; phone: string };

export default function SafetyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const topPad = insets.top;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecSaved, setEcSaved] = useState(false);
  const [savedContact, setSavedContact] = useState<EmergencyContact | null>(null);
  const ecSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(EC_STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const ec: EmergencyContact = JSON.parse(raw);
          setEcName(ec.name ?? '');
          setEcPhone(ec.phone ?? '');
          setSavedContact(ec);
        } catch { /* ignore */ }
      }
    });
    return () => { if (ecSavedTimer.current) clearTimeout(ecSavedTimer.current); };
  }, []);

  const handleSaveContact = async () => {
    if (!ecName.trim() || !ecPhone.trim()) {
      Alert.alert(t.error, t.emergency_contact_save_err);
      return;
    }
    try {
      const contact = { name: ecName.trim(), phone: ecPhone.trim() };
      await AsyncStorage.setItem(EC_STORAGE_KEY, JSON.stringify(contact));
      setSavedContact(contact);
      setEcSaved(true);
      if (ecSavedTimer.current) clearTimeout(ecSavedTimer.current);
      ecSavedTimer.current = setTimeout(() => setEcSaved(false), 3000);
    } catch {
      Alert.alert(t.error, t.emergency_contact_save_err);
    }
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
              <View style={{ flex: 1, paddingHorizontal: 12 }}>
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
                <Text style={{ fontSize: 16 }}>💬</Text>
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
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: ecSaved ? colors.success : colors.primary,
                opacity: pressed ? 0.85 : 1,
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
  titleRow: { alignItems: 'center', gap: 14, marginTop: 24 },
  titleIcon: {
    width: 52, height: 52, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  pageTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  pageSub: { fontSize: 13, marginTop: 3, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  savedCard: { padding: 16, gap: 14 },
  savedHeader: { alignItems: 'center', gap: 12 },
  savedAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  savedName: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  savedPhone: { fontSize: 14, marginTop: 2, fontFamily: 'Inter_400Regular' },
  savedActions: { gap: 10, marginTop: 4 },
  savedActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 11, borderRadius: 14, borderWidth: 1,
  },
  savedActionText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  emptyContactCard: {
    alignItems: 'center', gap: 10, paddingVertical: 32,
    borderRadius: 18, borderWidth: 1,
  },
  emptyContactText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  sectionLabel: {
    fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
    marginTop: 32, marginBottom: 12, fontFamily: 'Inter_700Bold',
  },
  formCard: { padding: 16, gap: 10 },
  ecInput: {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, borderWidth: 1, fontFamily: 'Inter_400Regular',
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, borderRadius: 16, marginTop: 4,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  infoNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginTop: 20, borderRadius: 14, borderWidth: 1, padding: 14,
  },
  infoNoteText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
});
