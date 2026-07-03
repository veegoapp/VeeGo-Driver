import {
  Navigation, Phone, Lock, Eye, EyeOff,
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Mail,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
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
import { endpoints, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18nContext';
import { useCodeLockout, formatLockoutCountdown } from '@/hooks/useCodeLockout';

type Step = 'request' | 'reset' | 'done';
type TDict = ReturnType<typeof useI18n>['t'];

function getErrorMessage(err: unknown, t: TDict): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t.err_no_connection;
    if (err.status >= 500) return t.err_server_error;
    const body = err.body as { error?: string } | null;
    if (body?.error) return body.error;
    if (err.status === 429) return t.err_too_many_attempts;
    return t.err_code_invalid;
  }
  if (err instanceof TypeError) return t.err_no_connection;
  return t.err_generic;
}

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('request');
  const [phone, setPhone] = useState('');

  return (
    <LinearGradient colors={['#f4f4fb', '#ededf4']} style={s.root}>
      <TouchableOpacity
        style={[s.backBtn, { top: insets.top + 12 }]}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <ArrowLeft size={20} color="#1e1e28" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.logoBlock}>
            <View style={s.logoIcon}>
              <Navigation size={28} color="#ffffff" />
            </View>
            <Text style={s.wordmark}>Vee<Text style={{ color: '#3D52D5' }}>Go</Text></Text>
          </View>

          <View style={s.card}>
            {step === 'request' && (
              <RequestStep
                initialPhone={phone}
                onSuccess={(p) => {
                  setPhone(p);
                  setStep('reset');
                }}
              />
            )}
            {step === 'reset' && (
              <ResetStep
                phone={phone}
                onResend={() => setStep('request')}
                onSuccess={() => setStep('done')}
              />
            )}
            {step === 'done' && (
              <DoneStep
                onGoToLogin={() => router.replace({ pathname: '/login', params: { credential: encodeURIComponent(phone) } } as any)}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function RequestStep({ onSuccess, initialPhone }: { onSuccess: (phone: string) => void; initialPhone?: string }) {
  const { t } = useI18n();
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const canSubmit = phone.trim().length > 7 && cooldown <= 0;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handle = async () => {
    if (!canSubmit || loading) return;
    setError(null);
    setLoading(true);
    try {
      // Backend always responds 200 here regardless of whether the phone is
      // registered, to avoid account enumeration — move to the code step either way.
      await endpoints.auth.forgotPassword(phone.trim());
      onSuccess(phone.trim());
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const body = err.body as { error?: string; retryAfter?: number } | null;
        setError(body?.error ?? t.err_too_many_attempts);
        if (typeof body?.retryAfter === 'number') setCooldown(body.retryAfter);
      } else {
        setError(getErrorMessage(err, t));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.form}>
      <View style={s.formHeader}>
        <Text style={s.formTitle}>{t.forgot_password_title}</Text>
        <Text style={s.formSub}>{t.forgot_password_sub}</Text>
      </View>

      <View style={s.inputWrap}>
        <View style={s.inputIcon}><Phone size={16} color="#5e5e72" /></View>
        <TextInput
          style={s.inputField}
          placeholder={t.phone}
          placeholderTextColor="#c3c3cc"
          value={phone}
          onChangeText={(v) => { setPhone(v); setError(null); }}
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
      </View>

      {error && (
        <View style={s.errorRow}>
          <AlertCircle size={14} color="#e53935" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {cooldown > 0 && (
        <Text style={s.cooldownText}>Try again in {cooldown}s</Text>
      )}

      <Pressable
        style={[s.primaryBtn, (!canSubmit || loading) && { opacity: 0.6 }]}
        onPress={handle}
        disabled={!canSubmit || loading}
      >
        {loading
          ? <ActivityIndicator color="white" size="small" />
          : <><Text style={s.primaryBtnText}>{t.send_reset_code}</Text><ArrowRight size={16} color="white" /></>
        }
      </Pressable>
    </View>
  );
}

function ResetStep({
  phone,
  onResend,
  onSuccess,
}: {
  phone: string;
  onResend: () => void;
  onSuccess: () => void;
}) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { locked, lockoutRemaining, lock } = useCodeLockout();

  const { t } = useI18n();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    code.trim().length === 6 &&
    password.length >= 8 &&
    confirmPassword.length >= 8 &&
    passwordsMatch &&
    !locked;

  const handle = async () => {
    if (!canSubmit || loading) return;
    if (!passwordsMatch) {
      setError(t.passwords_dont_match);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // No tokens on success — the driver signs in manually with the new password.
      await endpoints.auth.resetPassword(phone, code.trim(), password);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; attemptsRemaining?: number; retryAfter?: number } | null;
        if (err.status === 429) {
          lock(body?.retryAfter);
          setError(body?.error ?? 'Too many incorrect attempts. Please request a new code.');
        } else if (err.status === 400) {
          const remaining = typeof body?.attemptsRemaining === 'number' ? body.attemptsRemaining : null;
          setError(
            remaining !== null
              ? `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
              : (body?.error ?? t.err_code_invalid)
          );
        } else {
          setError(getErrorMessage(err, t));
        }
      } else {
        setError(getErrorMessage(err, t));
      }
    } finally {
      setLoading(false);
    }
  };

  const maskedPhone = phone.replace(/^(\+?\d{2,3})\d+(\d{3})$/, '$1****$2');

  return (
    <View style={s.form}>
      <View style={s.formHeader}>
        <Text style={s.formTitle}>{t.enter_reset_code_title}</Text>
        <Text style={s.formSub}>
          {t.reset_code_sent_to}{' '}
          <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#1e1e28' }}>{maskedPhone}</Text>
          {t.reset_code_enter_below}
        </Text>
      </View>

      <View style={[s.inputWrap, locked && s.inputWrapLocked]}>
        <View style={s.inputIcon}><Mail size={16} color="#5e5e72" /></View>
        <TextInput
          style={[s.inputField, { letterSpacing: 4, fontSize: 16 }]}
          placeholder={t.reset_code_placeholder}
          placeholderTextColor="#c3c3cc"
          value={code}
          onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(null); }}
          keyboardType="number-pad"
          maxLength={6}
          editable={!locked}
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
      </View>

      <View style={s.divider}>
        <View style={s.dividerLine} />
        <Text style={s.dividerText}>{t.new_password_label}</Text>
        <View style={s.dividerLine} />
      </View>

      <View style={s.inputWrap}>
        <View style={s.inputIcon}><Lock size={16} color="#5e5e72" /></View>
        <TextInput
          ref={passwordRef}
          style={[s.inputField, { flex: 1 }]}
          placeholder={t.new_password_placeholder}
          placeholderTextColor="#c3c3cc"
          value={password}
          onChangeText={(v) => { setPassword(v); setError(null); }}
          secureTextEntry={!showPass}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <TouchableOpacity onPress={() => setShowPass((p) => !p)} style={{ padding: 4 }}>
          {showPass ? <EyeOff size={16} color="#5e5e72" /> : <Eye size={16} color="#5e5e72" />}
        </TouchableOpacity>
      </View>

      <View style={[s.inputWrap, !passwordsMatch && confirmPassword.length > 0 && s.inputWrapError]}>
        <View style={s.inputIcon}><Lock size={16} color="#5e5e72" /></View>
        <TextInput
          ref={confirmRef}
          style={[s.inputField, { flex: 1 }]}
          placeholder={t.confirm_password_placeholder}
          placeholderTextColor="#c3c3cc"
          value={confirmPassword}
          onChangeText={(v) => { setConfirmPassword(v); setError(null); }}
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handle}
        />
        <TouchableOpacity onPress={() => setShowConfirm((p) => !p)} style={{ padding: 4 }}>
          {showConfirm ? <EyeOff size={16} color="#5e5e72" /> : <Eye size={16} color="#5e5e72" />}
        </TouchableOpacity>
      </View>

      {!passwordsMatch && confirmPassword.length > 0 && (
        <View style={s.errorRow}>
          <AlertCircle size={14} color="#e53935" />
          <Text style={s.errorText}>{t.passwords_dont_match}</Text>
        </View>
      )}

      {error && (
        <View style={s.errorRow}>
          <AlertCircle size={14} color="#e53935" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {locked && lockoutRemaining > 0 && (
        <Text style={s.cooldownText}>
          Try again in {formatLockoutCountdown(lockoutRemaining)}, or request a new code below.
        </Text>
      )}

      <Pressable
        style={[s.primaryBtn, (!canSubmit || loading) && { opacity: 0.6 }]}
        onPress={handle}
        disabled={!canSubmit || loading}
      >
        {loading
          ? <ActivityIndicator color="white" size="small" />
          : <><Text style={s.primaryBtnText}>{t.reset_password_btn}</Text><ArrowRight size={16} color="white" /></>
        }
      </Pressable>

      <TouchableOpacity style={s.resendRow} onPress={onResend} activeOpacity={0.7}>
        <Text style={s.resendText}>{t.didnt_receive_code} </Text>
        <Text style={s.resendLink}>{t.resend_link}</Text>
      </TouchableOpacity>
    </View>
  );
}

function DoneStep({ onGoToLogin }: { onGoToLogin: () => void }) {
  const { t } = useI18n();
  return (
    <View style={[s.form, s.doneForm]}>
      <View style={s.doneIcon}>
        <CheckCircle2 size={40} color="#1e1e28" />
      </View>
      <Text style={s.doneTitle}>{t.password_reset_title}</Text>
      <Text style={s.doneSub}>{t.password_reset_sub}</Text>
      <Pressable style={s.primaryBtn} onPress={onGoToLogin}>
        <Text style={s.primaryBtnText}>{t.go_to_sign_in}</Text>
        <ArrowRight size={16} color="white" />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1e1e28',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  scroll: { flexGrow: 1, paddingHorizontal: 20, gap: 20, justifyContent: 'center' },
  logoBlock: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, paddingBottom: 4 },
  logoIcon: {
    width: 48, height: 48, borderRadius: 16, backgroundColor: '#1e1e28',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8,
  },
  wordmark: { fontSize: 26, fontWeight: '700', color: '#1e1e28', letterSpacing: -1, fontFamily: 'Inter_700Bold' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
    shadowColor: '#1e1e28',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  form: { padding: 24, gap: 12 },
  formHeader: { gap: 6, marginBottom: 4 },
  formTitle: { fontSize: 22, fontWeight: '700', color: '#1e1e28', letterSpacing: -0.5, fontFamily: 'Inter_700Bold' },
  formSub: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular', lineHeight: 19 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f5',
    borderRadius: 18,
    height: 54,
    paddingHorizontal: 16,
    gap: 10,
  },
  inputWrapError: {
    borderWidth: 1.5,
    borderColor: '#e53935',
    backgroundColor: '#fff5f5',
  },
  inputWrapLocked: {
    opacity: 0.5,
  },
  inputIcon: { width: 28, alignItems: 'center' },
  inputField: { flex: 1, fontSize: 14, color: '#1e1e28', fontFamily: 'Inter_400Regular' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e5ea' },
  dividerText: { fontSize: 11, color: '#a0a0b8', fontFamily: 'Inter_500Medium', letterSpacing: 0.5 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  errorText: { fontSize: 12, color: '#e53935', fontFamily: 'Inter_400Regular', flex: 1 },
  cooldownText: { fontSize: 12, color: '#5e5e72', fontFamily: 'Inter_400Regular', paddingHorizontal: 4 },
  primaryBtn: {
    height: 56,
    borderRadius: 20,
    backgroundColor: '#1e1e28',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    shadowColor: '#1e1e28',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  primaryBtnText: { color: 'white', fontSize: 15, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 4 },
  resendText: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
  resendLink: { fontSize: 13, color: '#1e1e28', fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  doneForm: { alignItems: 'center', paddingVertical: 32 },
  doneIcon: {
    width: 80,
    height: 80,
    borderRadius: 28,
    backgroundColor: '#f0f0fa',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  doneTitle: { fontSize: 24, fontWeight: '700', color: '#1e1e28', fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  doneSub: { fontSize: 14, color: '#5e5e72', fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 21, paddingHorizontal: 8, marginBottom: 8 },
});
