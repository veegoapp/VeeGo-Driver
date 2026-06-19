import { User } from 'lucide-react-native';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '@/lib/api';
import { useI18n } from '@/lib/i18nContext';

export default function RegisterInfoScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canContinue = name.trim().length > 1 && !isSubmitting;

  const handleContinue = async () => {
    if (!canContinue) return;
    setIsSubmitting(true);
    try {
      await endpoints.driver.updateMe({
        name: name.trim(),
      });
      router.push('/register-vehicle');
    } catch {
      Alert.alert(t.error, t.reg_info_err);
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
            <Text style={s.step}>{t.reg_step_2_of_4}</Text>
            <Text style={s.title}>{t.reg_info_title}</Text>
            <Text style={s.sub}>{t.reg_info_sub}</Text>
          </View>

          <View style={s.fields}>
            <Field
              label={t.reg_info_full_name_label}
              value={name}
              onChangeText={setName}
              placeholder={t.reg_info_name_placeholder}
              autoCapitalize="words"
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
              <Text style={s.continueBtnText}>{t.reg_vehicle_continue}</Text>
              <ArrowRight size={18} color="white" strokeWidth={2} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.inputRow}>
        <View style={s.inputIcon}>
          <User size={16} color="#5e5e72" />
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
