import { Camera, User, Mail, Calendar } from 'lucide-react-native';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '@/lib/api';

export default function RegisterInfoScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (lib.status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri);
  };

  const canContinue = name.trim().length > 1 && !isSubmitting;

  const handleContinue = async () => {
    if (!canContinue) return;
    setIsSubmitting(true);
    try {
      await endpoints.driver.updateMe({
        name: name.trim(),
        email: email.trim() || undefined,
        dateOfBirth: dob.trim() || undefined,
      });
      router.push('/documents');
    } catch {
      Alert.alert('Error', 'Could not save your information. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: '#fafafd' }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad + 120, paddingHorizontal: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.backBtn}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color="#1e1e28" strokeWidth={2} />
          </TouchableOpacity>

          <View style={s.header}>
            <Text style={s.step}>Step 2 of 4</Text>
            <Text style={s.title}>Personal{'\n'}information</Text>
            <Text style={s.sub}>We need a few details to verify your identity.</Text>
          </View>

          <TouchableOpacity style={s.photoBox} onPress={pickPhoto} activeOpacity={0.85}>
            {photo ? (
              <Image source={{ uri: photo }} style={s.photoImg} />
            ) : (
              <View style={s.photoPlaceholder}>
                <View style={s.photoIconBox}>
                  <Camera size={28} color="#5e5e72" />
                </View>
                <Text style={s.photoLabel}>Profile photo</Text>
                <Text style={s.photoHint}>Tap to take photo with camera</Text>
              </View>
            )}
            {photo && (
              <View style={s.photoEditBadge}>
                <Camera size={14} color="white" />
              </View>
            )}
          </TouchableOpacity>

          <View style={s.fields}>
            <Field
              icon="user"
              label="Full name"
              value={name}
              onChangeText={setName}
              placeholder="Your full legal name"
              autoCapitalize="words"
            />
            <Field
              icon="mail"
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
            />
            <Field
              icon="calendar"
              label="Date of birth"
              value={dob}
              onChangeText={setDob}
              placeholder="DD / MM / YYYY"
              keyboardType="numeric"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[s.footer, { paddingBottom: botPad + 24 }]}>
        <TouchableOpacity
          style={[s.continueBtn, !canContinue && s.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.9}
        >
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={s.continueBtnText}>Continue to documents</Text>
              <ArrowRight size={18} color="white" strokeWidth={2} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const FIELD_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  user: User,
  mail: Mail,
  calendar: Calendar,
};

function Field({ icon, label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: {
  icon: string; label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.inputRow}>
        <View style={s.inputIcon}>
          {(() => { const Icon = FIELD_ICONS[icon] ?? User; return <Icon size={16} color="#5e5e72" />; })()}
        </View>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#c3c3cc"
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize || 'none'}
          autoCorrect={false}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: 'white',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e5e5ea',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  header: { marginTop: 24, marginBottom: 28, gap: 8 },
  step: { fontSize: 12, fontWeight: '600', color: '#5e5e72', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Inter_600SemiBold' },
  title: { fontSize: 34, fontWeight: '700', color: '#1e1e28', letterSpacing: -1.2, lineHeight: 40, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 14, color: '#5e5e72', lineHeight: 20, fontFamily: 'Inter_400Regular' },
  photoBox: {
    alignSelf: 'center', width: 110, height: 110, borderRadius: 55,
    marginBottom: 28, position: 'relative',
  },
  photoImg: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: '#1e1e28' },
  photoPlaceholder: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#f2f2f5', borderWidth: 2, borderColor: '#e5e5ea', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoIconBox: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'white',
    alignItems: 'center', justifyContent: 'center',
  },
  photoLabel: { fontSize: 10, fontWeight: '700', color: '#1e1e28', textAlign: 'center', fontFamily: 'Inter_700Bold' },
  photoHint: { fontSize: 9, color: '#5e5e72', textAlign: 'center', paddingHorizontal: 8 },
  photoEditBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#1e1e28',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'white',
  },
  fields: { gap: 16 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#1e1e28', letterSpacing: 0.3, fontFamily: 'Inter_600SemiBold' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', borderRadius: 18, height: 54, paddingHorizontal: 16, gap: 10,
    borderWidth: 1, borderColor: '#e5e5ea',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  inputIcon: { width: 24, alignItems: 'center' },
  input: { flex: 1, fontSize: 14, color: '#1e1e28', fontFamily: 'Inter_400Regular' },
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
  continueBtnText: { color: 'white', fontSize: 15, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
});
