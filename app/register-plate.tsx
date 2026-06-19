import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react-native';
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
import { useI18n } from '@/lib/i18nContext';
import { endpoints, ApiError } from '@/lib/api';

export default function RegisterPlateScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;

  const [letters, setLetters] = useState('');
  const [numbers, setNumbers] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lettersOk = letters.trim().length === 3;
  const numbersOk = /^\d{1,4}$/.test(numbers.trim());
  const canContinue = lettersOk && numbersOk && !submitting;

  const preview = letters.trim().toUpperCase() + (numbers.trim() ? ' ' + numbers.trim() : '');

  const handleSubmit = async () => {
    if (!canContinue) return;
    setSubmitting(true);
    setError(null);
    try {
      await endpoints.registration.plateNumber(letters.trim().toUpperCase(), numbers.trim());
      router.push('/register-documents');
    } catch (err) {
      let msg = t.reg_plate_err_save;
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        if (err.status === 409) msg = t.reg_plate_err_duplicate;
        else if (body?.error) msg = body.error;
      }
      setError(msg);
    } finally {
      setSubmitting(false);
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
          <TouchableOpacity onPress={() => router.replace('/register-vehicle')} style={s.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={20} color="#1e1e28" strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </TouchableOpacity>

          <View style={s.header}>
            <Text style={[s.step, { textAlign: TA }]}>{t.reg_step_3_of_4}</Text>
            <Text style={[s.title, { textAlign: TA }]}>{t.reg_plate_title}</Text>
            <Text style={[s.sub, { textAlign: TA }]}>{t.reg_plate_sub}</Text>
          </View>

          {/* Plate preview */}
          <View style={s.platePreviewWrap}>
            <View style={s.platePreview}>
              <View style={s.plateBadge}><Text style={s.plateBadgeText}>EGY</Text></View>
              <Text style={s.plateText}>{preview || '— —'}</Text>
            </View>
          </View>

          <View style={s.fieldsRow}>
            {/* Letters */}
            <View style={[s.fieldWrap, { flex: 1 }]}>
              <Text style={[s.fieldLabel, { textAlign: TA }]}>{t.reg_plate_letters_label}</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={[s.input, { textAlign: 'center', letterSpacing: 6, fontSize: 18, fontWeight: '700' }]}
                  value={letters}
                  onChangeText={v => {
                    setLetters(v.replace(/[^a-zA-Z؀-ۿ]/g, '').slice(0, 3));
                    setError(null);
                  }}
                  placeholder="ABC"
                  placeholderTextColor="#c3c3cc"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={3}
                />
              </View>
              <Text style={s.fieldHint}>{t.reg_plate_letters_hint}</Text>
            </View>

            <View style={s.fieldSep} />

            {/* Numbers */}
            <View style={[s.fieldWrap, { flex: 1 }]}>
              <Text style={[s.fieldLabel, { textAlign: TA }]}>{t.reg_plate_numbers_label}</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={[s.input, { textAlign: 'center', letterSpacing: 4, fontSize: 18, fontWeight: '700' }]}
                  value={numbers}
                  onChangeText={v => {
                    setNumbers(v.replace(/\D/g, '').slice(0, 4));
                    setError(null);
                  }}
                  placeholder="1234"
                  placeholderTextColor="#c3c3cc"
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
              <Text style={s.fieldHint}>{t.reg_plate_numbers_hint}</Text>
            </View>
          </View>

          {error && (
            <View style={s.errorRow}>
              <AlertCircle size={14} color="#e53935" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={s.noteBox}>
            <Text style={s.noteText}>{t.reg_plate_note}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[s.footer, { paddingBottom: botPad + 24 }]}>
        <TouchableOpacity
          style={[s.continueBtn, !canContinue && s.continueBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canContinue}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={s.continueBtnText}>{t.reg_plate_continue}</Text>
              <ArrowRight size={18} color="white" strokeWidth={2} />
            </>
          )}
        </TouchableOpacity>
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
  platePreviewWrap: { alignItems: 'center', marginBottom: 28 },
  platePreview: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'white', borderRadius: 18, paddingHorizontal: 20, paddingVertical: 14,
    borderWidth: 2, borderColor: '#1e1e28',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  plateBadge: {
    backgroundColor: '#1e1e28', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  plateBadgeText: { fontSize: 11, fontWeight: '700', color: 'white', letterSpacing: 1 },
  plateText: { fontSize: 24, fontWeight: '700', color: '#1e1e28', letterSpacing: 4, fontFamily: 'Inter_700Bold', minWidth: 120, textAlign: 'center' },
  fieldsRow: { flexDirection: 'row', gap: 0, marginBottom: 16, alignItems: 'flex-start' },
  fieldSep: { width: 12 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#1e1e28', letterSpacing: 0.3, fontFamily: 'Inter_600SemiBold' },
  inputRow: {
    backgroundColor: 'white', borderRadius: 18, height: 56, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#e5e5ea', justifyContent: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  input: { fontSize: 16, color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  fieldHint: { fontSize: 11, color: '#9e9ea8', fontFamily: 'Inter_400Regular' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, marginBottom: 8 },
  errorText: { fontSize: 12, color: '#e53935', fontFamily: 'Inter_400Regular', flex: 1 },
  noteBox: {
    backgroundColor: '#f2f2f5', borderRadius: 14, padding: 14, marginTop: 8,
  },
  noteText: { fontSize: 12, color: '#5e5e72', lineHeight: 18, fontFamily: 'Inter_400Regular' },
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
