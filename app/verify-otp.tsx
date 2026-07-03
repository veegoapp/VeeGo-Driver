import { Navigation, ArrowLeft, MessageCircle } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/lib/authContext';
import { endpoints, ApiError } from '@/lib/api';
import { navigateAfterOtp } from '@/lib/postAuthRouter';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

function formatLockout(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const { phone: phoneParam, maskedPhone: maskedPhoneParam, retryAfter: retryAfterParam } = useLocalSearchParams<{ phone: string; maskedPhone?: string; retryAfter?: string }>();
  const phone = phoneParam ? decodeURIComponent(phoneParam) : '';
  const { login } = useAuth();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(retryAfterParam ? Number(retryAfterParam) : RESEND_COOLDOWN);
  const inputRef = useRef<TextInput>(null);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Countdown timer for the post-lockout window; unlocks automatically once it elapses.
  useEffect(() => {
    if (!locked) return;
    if (lockoutRemaining <= 0) {
      setLocked(false);
      return;
    }
    const t = setTimeout(() => setLockoutRemaining(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [locked, lockoutRemaining]);

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (otp.length === OTP_LENGTH && !locked) handleVerify();
  }, [otp]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = async () => {
    if (otp.length !== OTP_LENGTH || loading || locked) return;
    setError(null);
    setLoading(true);
    console.log('[OTP] ▶ Calling verifyOtp | phone:', phone, '| otp:', otp);
    try {
      const result = await endpoints.auth.verifyOtp(phone, otp);
      console.log('[OTP] ✅ verifyOtp response:', JSON.stringify(result));

      // Accept any pending terms now that we have a real token
      AsyncStorage.getItem('driver_terms_pending_version').then(async (pendingVersion) => {
        if (!pendingVersion) return;
        try {
          await AsyncStorage.setItem('driver_terms_accepted_version', pendingVersion);
          await AsyncStorage.removeItem('driver_terms_pending_version');
        } catch { /* ignore */ }
      }).catch(() => {});

      await login(result.accessToken, result.refreshToken);
      console.log('[OTP] ✅ login() done → calling navigateAfterOtp');
      await navigateAfterOtp(result.accessToken);
    } catch (err) {
      console.log('[OTP] ❌ verifyOtp error:', err);
      let justLocked = false;
      if (err instanceof ApiError) {
        console.log('[OTP] status:', err.status, '| body:', JSON.stringify(err.body));
        const body = err.body as { error?: string; attemptsRemaining?: number; retryAfter?: number } | null;
        if (err.status === 429) {
          justLocked = true;
          setLocked(true);
          setLockoutRemaining(typeof body?.retryAfter === 'number' ? body.retryAfter : 900);
          setError(body?.error ?? 'Too many incorrect attempts. Please request a new code.');
        } else if (err.status === 400 || err.status === 401) {
          const remaining = typeof body?.attemptsRemaining === 'number' ? body.attemptsRemaining : null;
          setError(
            remaining !== null
              ? `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
              : 'Invalid or expired OTP. Please try again.'
          );
        } else {
          setError('Something went wrong. Please try again.');
        }
      } else {
        setError('Could not connect. Check your internet and try again.');
      }
      setOtp('');
      if (!justLocked) inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      await endpoints.auth.sendOtp(phone);
      setCountdown(RESEND_COOLDOWN);
      // A fresh OTP clears any lockout and resets the attempt counter server-side.
      setLocked(false);
      setLockoutRemaining(0);
      setOtp('');
      inputRef.current?.focus();
    } catch (err) {
      console.log('[OTP] resend error:', err);
      if (err instanceof ApiError && err.status === 429) {
        const body = err.body as { error?: string; retryAfter?: number } | null;
        setError(body?.error ?? 'Failed to resend code. Please try again.');
        if (typeof body?.retryAfter === 'number') setCountdown(body.retryAfter);
      } else {
        setError('Failed to resend code. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  const maskedPhone = maskedPhoneParam || phone || '';

  return (
    <LinearGradient colors={['#f4f4fb', '#ededf4']} style={s.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={s.topRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/login')} activeOpacity={0.7}>
              <ArrowLeft size={18} color="#1e1e28" strokeWidth={2} />
            </TouchableOpacity>
            <View style={s.logoRow}>
              <View style={s.logoIcon}><Navigation size={20} color="white" /></View>
              <Text style={s.wordmark}>Vee<Text style={{ color: '#3D52D5' }}>Go</Text></Text>
            </View>
            <View style={{ width: 38 }} />
          </View>

          {/* Card */}
          <View style={s.card}>
            <View style={s.iconWrap}>
              <LinearGradient colors={['#eef0fd', '#dde1fb']} style={s.iconCircle}>
                <MessageCircle size={34} color="#3D52D5" strokeWidth={1.8} />
              </LinearGradient>
            </View>

            <Text style={s.title}>Verify your number</Text>
            <Text style={s.sub}>
              We sent a 6-digit code to{'\n'}
              <Text style={s.phoneBold}>{maskedPhone}</Text>
            </Text>

            {/* OTP boxes — single hidden input drives it */}
            <Pressable style={s.otpWrap} onPress={() => inputRef.current?.focus()} disabled={locked}>
              {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                const char = otp[i] ?? '';
                const active = otp.length === i;
                return (
                  <View key={i} style={[s.otpBox, char && s.otpBoxFilled, active && s.otpBoxActive, !!error && s.otpBoxError, locked && s.otpBoxLocked]}>
                    <Text style={s.otpChar}>{char || (active ? '|' : '')}</Text>
                  </View>
                );
              })}
            </Pressable>

            <TextInput
              ref={inputRef}
              value={otp}
              onChangeText={v => { setOtp(v.replace(/\D/g, '').slice(0, OTP_LENGTH)); setError(null); }}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              style={s.hiddenInput}
              editable={!locked}
              autoFocus
            />

            {error && <Text style={s.errorText}>{error}</Text>}
            {locked && lockoutRemaining > 0 && (
              <Text style={s.lockoutText}>Try again in {formatLockout(lockoutRemaining)}</Text>
            )}

            {loading && (
              <View style={s.loadingRow}>
                <ActivityIndicator size="small" color="#3D52D5" />
                <Text style={s.loadingText}>Verifying…</Text>
              </View>
            )}

            <View style={s.resendRow}>
              {countdown > 0 ? (
                <Text style={s.resendCooldown}>Resend code in <Text style={s.resendCount}>{countdown}s</Text></Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={resending} activeOpacity={0.7}>
                  {resending
                    ? <ActivityIndicator size="small" color="#3D52D5" />
                    : <Text style={s.resendBtn}>Resend code</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={s.hint}>Didn't receive the SMS? Check that your phone number is correct and try resending.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 20, gap: 20 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1e1e28', alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontSize: 20, fontWeight: '700', color: '#1e1e28', letterSpacing: -0.8, fontFamily: 'Inter_700Bold' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    padding: 28, gap: 16, alignItems: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 18, elevation: 4,
  },
  iconWrap: { marginBottom: 4 },
  iconCircle: { width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: '#1e1e28', letterSpacing: -0.6, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 14, color: '#5e5e72', textAlign: 'center', lineHeight: 22, fontFamily: 'Inter_400Regular' },
  phoneBold: { fontWeight: '700', color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  otpWrap: { flexDirection: 'row', gap: 10, marginVertical: 8 },
  otpBox: {
    width: 46, height: 56, borderRadius: 16,
    backgroundColor: '#f2f2f5', borderWidth: 1.5, borderColor: '#e5e5ea',
    alignItems: 'center', justifyContent: 'center',
  },
  otpBoxFilled: { backgroundColor: 'white', borderColor: '#3D52D5' },
  otpBoxActive: { borderColor: '#3D52D5', backgroundColor: 'white' },
  otpBoxError: { borderColor: '#e53935', backgroundColor: '#fff5f5' },
  otpBoxLocked: { opacity: 0.5 },
  otpChar: { fontSize: 22, fontWeight: '700', color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  errorText: { fontSize: 13, color: '#e53935', textAlign: 'center', fontFamily: 'Inter_400Regular' },
  lockoutText: { fontSize: 13, color: '#5e5e72', textAlign: 'center', fontFamily: 'Inter_500Medium' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13, color: '#3D52D5', fontFamily: 'Inter_500Medium' },
  resendRow: { alignItems: 'center', marginTop: 4 },
  resendCooldown: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
  resendCount: { fontWeight: '700', color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  resendBtn: { fontSize: 14, color: '#3D52D5', fontWeight: '600', fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
  hint: { fontSize: 12, color: '#9e9ea8', textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
});
