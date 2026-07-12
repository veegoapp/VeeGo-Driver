import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react-native';
import { router } from 'expo-router';
import React, { useState, useRef } from 'react';
import {
  ActivityIndicator,
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
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';

const ARABIC_RE = /^[؀-ۿ]$/;

export default function RegisterPlateScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;

  // 3 separate letter boxes (box 3 is optional)
  const [l1, setL1] = useState('');
  const [l2, setL2] = useState('');
  const [l3, setL3] = useState('');
  const [numbers, setNumbers] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ref1 = useRef<TextInput>(null);
  const ref2 = useRef<TextInput>(null);
  const ref3 = useRef<TextInput>(null);
  const refNum = useRef<TextInput>(null);

  const letters = (l1 + l2 + l3).trim();
  const lettersOk = /^[؀-ۿ]{2,3}$/.test(letters);
  const numbersOk = /^\d{3,4}$/.test(numbers.trim());
  const canContinue = lettersOk && numbersOk && !submitting;

  const preview = letters + (numbers.trim() ? ' ' + numbers.trim() : '');

  const handleLetterChange = (
    val: string,
    setter: (v: string) => void,
    nextRef: React.RefObject<TextInput | null> | null,
  ) => {
    const ch = val.replace(/[^؀-ۿ]/g, '').slice(-1);
    setter(ch);
    setError(null);
    if (ch && nextRef?.current) nextRef.current.focus();
  };

  const handleLetterBackspace = (
    val: string,
    current: string,
    setter: (v: string) => void,
    prevRef: React.RefObject<TextInput | null> | null,
  ) => {
    if (val === '' && current === '' && prevRef?.current) {
      prevRef.current.focus();
    }
  };

  const handleSubmit = async () => {
    if (!canContinue) return;
    setSubmitting(true);
    setError(null);
    try {
      await endpoints.registration.setPlateNumber(letters, numbers.trim());
      router.push('/register-documents');
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        setError(body?.error ?? 'Failed to save plate number. Please try again.');
      } else {
        setError('Could not connect. Check your internet and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: '#fafafd' }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120, paddingHorizontal: Spacing.xl }}
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

          {/* Letter boxes */}
          <View style={s.sectionWrap}>
            <Text style={[s.fieldLabel, { textAlign: TA }]}>{t.reg_plate_letters_label}</Text>
            <Text style={[s.fieldHint, { textAlign: TA, marginBottom: 10 }]}>{t.reg_plate_letters_hint}</Text>
            <View style={s.letterBoxRow}>
              {/* Box 3 — optional, rightmost in Arabic plates */}
              <View style={[s.letterBox, l3 ? s.letterBoxFilled : null]}>
                <TextInput
                  ref={ref3}
                  style={s.letterInput}
                  value={l3}
                  onChangeText={v => handleLetterChange(v, setL3, refNum)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace') handleLetterBackspace(l3, l3, setL3, ref2);
                  }}
                  placeholder="؟"
                  placeholderTextColor="#c3c3cc"
                  autoCorrect={false}
                  autoCapitalize="none"
                  maxLength={1}
                  textAlign="center"
                />
              </View>

              {/* Box 2 */}
              <View style={[s.letterBox, l2 ? s.letterBoxFilled : null]}>
                <TextInput
                  ref={ref2}
                  style={s.letterInput}
                  value={l2}
                  onChangeText={v => handleLetterChange(v, setL2, ref3)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace') handleLetterBackspace(l2, l2, setL2, ref1);
                  }}
                  placeholder="؟"
                  placeholderTextColor="#c3c3cc"
                  autoCorrect={false}
                  autoCapitalize="none"
                  maxLength={1}
                  textAlign="center"
                />
              </View>

              {/* Box 1 — first letter */}
              <View style={[s.letterBox, l1 ? s.letterBoxFilled : null]}>
                <TextInput
                  ref={ref1}
                  style={s.letterInput}
                  value={l1}
                  onChangeText={v => handleLetterChange(v, setL1, ref2)}
                  placeholder="؟"
                  placeholderTextColor="#c3c3cc"
                  autoCorrect={false}
                  autoCapitalize="none"
                  autoFocus
                  maxLength={1}
                  textAlign="center"
                />
              </View>
            </View>
          </View>

          {/* Numbers field */}
          <View style={s.sectionWrap}>
            <Text style={[s.fieldLabel, { textAlign: TA }]}>{t.reg_plate_numbers_label}</Text>
            <Text style={[s.fieldHint, { textAlign: TA, marginBottom: 10 }]}>{t.reg_plate_numbers_hint}</Text>
            <View style={s.inputRow}>
              <TextInput
                ref={refNum}
                style={[s.input, { textAlign: 'center', letterSpacing: 4, fontSize: Typography.size.xl, fontWeight: Typography.weight.bold }]}
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

      <View style={[s.footer, { paddingBottom: insets.bottom + 24 }]}>
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
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: Shadows.small.elevation,
  },
  header: { marginTop: Spacing.xl, marginBottom: 28, gap: Spacing.sm },
  step: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: '#5e5e72', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Inter_600SemiBold' },
  title: { fontSize: 34, fontWeight: Typography.weight.bold, color: '#1e1e28', letterSpacing: -1.2, lineHeight: 40, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: Typography.size.sm, color: '#5e5e72', lineHeight: 20, fontFamily: 'Inter_400Regular' },
  platePreviewWrap: { alignItems: 'center', marginBottom: 28 },
  platePreview: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: 'white', borderRadius: 18, paddingHorizontal: 20, paddingVertical: 14,
    borderWidth: 2, borderColor: '#1e1e28',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: Shadows.medium.elevation,
  },
  plateBadge: { backgroundColor: '#1e1e28', borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  plateBadgeText: { fontSize: 11, fontWeight: Typography.weight.bold, color: 'white', letterSpacing: 1 },
  plateText: { fontSize: 24, fontWeight: Typography.weight.bold, color: '#1e1e28', letterSpacing: 4, fontFamily: 'Inter_700Bold', minWidth: 120, textAlign: 'center' },
  sectionWrap: { marginBottom: Spacing.xl },
  fieldLabel: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, color: '#1e1e28', letterSpacing: 0.3, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  fieldHint: { fontSize: 11, color: '#9e9ea8', fontFamily: 'Inter_400Regular' },
  letterBoxRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  letterBox: {
    width: 72, height: 72, borderRadius: 18, backgroundColor: 'white',
    borderWidth: 1.5, borderColor: '#e5e5ea', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  letterBoxFilled: { borderColor: '#1e1e28', borderWidth: 2 },
  letterInput: { fontSize: 26, fontWeight: Typography.weight.bold, color: '#1e1e28', fontFamily: 'Inter_700Bold', width: '100%', textAlign: 'center' },
  letterOptional: { fontSize: 9, color: '#9e9ea8', fontFamily: 'Inter_400Regular', marginTop: 2 },
  inputRow: {
    backgroundColor: 'white', borderRadius: 18, height: 64, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: '#e5e5ea', justifyContent: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  input: { fontSize: Typography.size.md, color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.xs, marginBottom: Spacing.sm },
  errorText: { fontSize: Typography.size.xs, color: '#e53935', fontFamily: 'Inter_400Regular', flex: 1 },
  noteBox: { backgroundColor: '#f2f2f5', borderRadius: 14, padding: 14, marginTop: Spacing.sm },
  noteText: { fontSize: Typography.size.xs, color: '#5e5e72', lineHeight: 18, fontFamily: 'Inter_400Regular' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg,
    backgroundColor: 'rgba(250,250,253,0.95)',
    borderTopWidth: 1, borderTopColor: '#e5e5ea',
  },
  continueBtn: {
    height: 56, borderRadius: 20, backgroundColor: '#1e1e28',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: Shadows.large.elevation,
  },
  continueBtnDisabled: { opacity: 0.35 },
  continueBtnText: { color: 'white', fontSize: 15, fontWeight: Typography.weight.semibold, fontFamily: 'Inter_600SemiBold' },
});
