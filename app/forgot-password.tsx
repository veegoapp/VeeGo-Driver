import {
  Navigation, Phone, Lock, Eye, EyeOff,
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Mail,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState, useRef } from 'react';
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
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints, ApiError } from '@/lib/api';

type Step = 'request' | 'reset' | 'done';

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'Cannot reach the server. Please check your connection.';
    if (err.status === 404) return 'No account found with this email or phone number.';
    if (err.status === 400) return 'Invalid code. Please check and try again.';
    if (err.status === 410) return 'This code has expired. Please request a new one.';
    if (err.status === 429) return 'Too many attempts. Please wait and try again.';
    if (err.status >= 500) return 'Server error. Please try again later.';
    const body = err.body as { error?: string } | null;
    if (body?.error) return body.error;
  }
  if (err instanceof TypeError) return 'Cannot reach the server. Please check your connection.';
  return 'Something went wrong. Please try again.';
}

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('request');
  const [credential, setCredential] = useState('');

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
                onSuccess={(cred) => {
                  setCredential(cred);
                  setStep('reset');
                }}
              />
            )}
            {step === 'reset' && (
              <ResetStep
                credential={credential}
                onResend={() => setStep('request')}
                onSuccess={() => setStep('done')}
              />
            )}
            {step === 'done' && (
              <DoneStep onGoToLogin={() => router.replace('/login')} />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function RequestStep({ onSuccess }: { onSuccess: (credential: string) => void }) {
  const [credential, setCredential] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = credential.trim().length > 3;

  const handle = async () => {
    if (!canSubmit || loading) return;
    setError(null);
    setLoading(true);
    try {
      await endpoints.auth.forgotPassword(credential.trim());
      onSuccess(credential.trim());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.form}>
      <View style={s.formHeader}>
        <Text style={s.formTitle}>Forgot password?</Text>
        <Text style={s.formSub}>
          Enter the email or phone number linked to your account. We'll send you a reset code.
        </Text>
      </View>

      <View style={s.inputWrap}>
        <View style={s.inputIcon}><Phone size={16} color="#5e5e72" /></View>
        <TextInput
          style={s.inputField}
          placeholder="Email or phone number"
          placeholderTextColor="#c3c3cc"
          value={credential}
          onChangeText={(v) => { setCredential(v); setError(null); }}
          keyboardType="email-address"
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

      <Pressable
        style={[s.primaryBtn, (!canSubmit || loading) && { opacity: 0.6 }]}
        onPress={handle}
        disabled={!canSubmit || loading}
      >
        {loading
          ? <ActivityIndicator color="white" size="small" />
          : <><Text style={s.primaryBtnText}>Send reset code</Text><ArrowRight size={16} color="white" /></>
        }
      </Pressable>
    </View>
  );
}

function ResetStep({
  credential,
  onResend,
  onSuccess,
}: {
  credential: string;
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

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    code.trim().length >= 4 &&
    password.length >= 8 &&
    confirmPassword.length >= 8 &&
    passwordsMatch;

  const handle = async () => {
    if (!canSubmit || loading) return;
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await endpoints.auth.resetPassword(credential, code.trim(), password);
      onSuccess();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const maskedCredential =
    credential.includes('@')
      ? credential.replace(/^(.{2})(.+)(@.+)$/, (_, a, b, c) => `${a}${'*'.repeat(Math.min(b.length, 4))}${c}`)
      : credential.replace(/^(\+?\d{2,3})\d+(\d{3})$/, '$1****$2');

  return (
    <View style={s.form}>
      <View style={s.formHeader}>
        <Text style={s.formTitle}>Enter reset code</Text>
        <Text style={s.formSub}>
          We sent a code to{' '}
          <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#1e1e28' }}>{maskedCredential}</Text>.
          Enter it below along with your new password.
        </Text>
      </View>

      <View style={s.inputWrap}>
        <View style={s.inputIcon}><Mail size={16} color="#5e5e72" /></View>
        <TextInput
          style={[s.inputField, { letterSpacing: 4, fontSize: 16 }]}
          placeholder="Reset code"
          placeholderTextColor="#c3c3cc"
          value={code}
          onChangeText={(v) => { setCode(v.replace(/\D/g, '')); setError(null); }}
          keyboardType="number-pad"
          maxLength={8}
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
      </View>

      <View style={s.divider}>
        <View style={s.dividerLine} />
        <Text style={s.dividerText}>New password</Text>
        <View style={s.dividerLine} />
      </View>

      <View style={s.inputWrap}>
        <View style={s.inputIcon}><Lock size={16} color="#5e5e72" /></View>
        <TextInput
          ref={passwordRef}
          style={[s.inputField, { flex: 1 }]}
          placeholder="New password (min 8 chars)"
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
          placeholder="Confirm new password"
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
          <Text style={s.errorText}>Passwords do not match.</Text>
        </View>
      )}

      {error && (
        <View style={s.errorRow}>
          <AlertCircle size={14} color="#e53935" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        style={[s.primaryBtn, (!canSubmit || loading) && { opacity: 0.6 }]}
        onPress={handle}
        disabled={!canSubmit || loading}
      >
        {loading
          ? <ActivityIndicator color="white" size="small" />
          : <><Text style={s.primaryBtnText}>Reset password</Text><ArrowRight size={16} color="white" /></>
        }
      </Pressable>

      <TouchableOpacity style={s.resendRow} onPress={onResend} activeOpacity={0.7}>
        <Text style={s.resendText}>Didn't receive the code? </Text>
        <Text style={s.resendLink}>Resend</Text>
      </TouchableOpacity>
    </View>
  );
}

function DoneStep({ onGoToLogin }: { onGoToLogin: () => void }) {
  return (
    <View style={[s.form, s.doneForm]}>
      <View style={s.doneIcon}>
        <CheckCircle2 size={40} color="#1e1e28" />
      </View>
      <Text style={s.doneTitle}>Password reset!</Text>
      <Text style={s.doneSub}>
        Your password has been updated successfully. You can now sign in with your new password.
      </Text>
      <Pressable style={s.primaryBtn} onPress={onGoToLogin}>
        <Text style={s.primaryBtnText}>Go to sign in</Text>
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
  inputIcon: { width: 28, alignItems: 'center' },
  inputField: { flex: 1, fontSize: 14, color: '#1e1e28', fontFamily: 'Inter_400Regular' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e5ea' },
  dividerText: { fontSize: 11, color: '#a0a0b8', fontFamily: 'Inter_500Medium', letterSpacing: 0.5 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  errorText: { fontSize: 12, color: '#e53935', fontFamily: 'Inter_400Regular', flex: 1 },
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
