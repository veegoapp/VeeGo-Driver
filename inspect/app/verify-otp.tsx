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
import { useCodeLockout, formatLockoutCountdown } from '@/hooks/useCodeLockout';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const { phone: phoneParam, maskedPhone: maskedPhoneParam, retryAfter: retryAfterParam } = useLocalSearchParams<{ phone: string; maskedPhone?: string; retryAfter?: string }>();
  const phone = phoneParam ? decodeURIComponent(phoneParam) : '';
  const { login } = useAuth();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { locked, lockoutRemaining, lock, clear: clearLockout } = useCodeLockout();
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(retryAfterParam ? Number(retryAfterParam) : RESEND_COOLDOWN);
  const [availableChannels, setAvailableChannels] = useState<Array<'whatsapp' | 'sms'>>(['whatsapp']);
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const inputRef = useRef<TextInput>(null);

  // Fetch which OTP delivery channels are enabled (admin-configurable), so
  // resend can offer a channel picker without hardcoding availability.
  useEffect(() => {
    endpoints.auth.otpChannels()
      .then((res) => {
        const channels: Array<'whatsapp' | 'sms'> = [];
        if (res.whatsappEnabled) channels.push('whatsapp');
        if (res.smsEnabled) channels.push('sms');
        if (channels.length > 0) setAvailableChannels(channels);
        setChannel(res.defaultChannel);
      })
      .catch(() => {});
  }, []);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (otp.length === OTP_LENGTH && !locked) handleVerify();
  }, [otp]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = async () => {
    if (otp.length !== OTP_LENGTH || loading || locked) return;
    setError(null);
    setLoading(true);
    if (__DEV__) console.log('[OTP] ▶ Calling verifyOtp');
    try {
      const result = await endpoints.auth.verifyOtp(phone, otp);
      if (__DEV__) console.log('[OTP] ✅ verifyOtp succeeded');

      await login(result.accessToken, result.refreshToken);
      if (__DEV__) console.log('[OTP] ✅ login() done → calling navigateAfterOtp');

      // Sync any pending terms acceptance (recorded during signup) to the
      // backend now that we have a real access token. Local AsyncStorage
      // behavior is kept as-is; the pending flag is only cleared once the
      // backend confirms acceptance so a failure here doesn't get lost.
      try {
        const pendingVersion = await AsyncStorage.getItem('driver_terms_pending_version');
        if (pendingVersion) {
          try {
            await endpoints.terms.accept(Number(pendingVersion));
            await AsyncStorage.setItem('driver_terms_accepted_version', pendingVersion);
            await AsyncStorage.removeItem('driver_terms_pending_version');
          } catch (acceptErr) {
            // Do not silently ignore — log so backend never-received-acceptance
            // is visible, but don't block login/navigation on it.
            console.error('[OTP] Failed to sync terms acceptance to backend:', acceptErr);
          }
        }
      } catch { /* AsyncStorage read failed — nothing to sync */ }

      await navigateAfterOtp(result.accessToken);
    } catch (err) {
      if (__DEV__) console.log('[OTP] ❌ verifyOtp error:', err);
      let justLocked = false;
      if (err instanceof ApiError) {
        if (__DEV__) console.log('[OTP] status:', err.status, '| body:', JSON.stringify(err.body));
        const body = err.body as { error?: string; attemptsRemaining?: number; retryAfter?: number } | null;
        if (err.status === 429) {
          justLocked = true;
          lock(body?.retryAfter);
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
      await endpoints.auth.sendOtp(phone, channel);
      setCountdown(RESEND_COOLDOWN);
      // A fresh OTP clears any lockout and resets the attempt counter server-side.
      clearLockout();
      setOtp('');
      inputRef.current?.focus();
    } catch (err) {
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
              <Text style={s.wordmark}>Vee<Text style={{ color: '#55c49a' }}>Go</Text></Text>
            </View>
            <View style={{ width: 38 }} />
          </View>

          {/* Card */}
          <View style={s.card}>
            <View style={s.iconWrap}>
              <LinearGradient colors={['#eef0fd', '#dde1fb']} style={s.iconCircle}>
                <MessageCircle size={34} color="#55c49a" strokeWidth={1.8} />
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
              <Text style={s.lockoutText}>Try again in {formatLockoutCountdown(lockoutRemaining)}</Text>
            )}

            {loading && (
              <View style={s.loadingRow}>
                <ActivityIndicator size="small" color="#55c49a" />
                <Text style={s.loadingText}>Verifying…</Text>
              </View>
            )}

            {availableChannels.length > 1 && (
              <View style={s.channelRow}>
                {availableChannels.map((ch) => (
                  <TouchableOpacity
                    key={ch}
                    style={[s.channelChip, channel === ch && s.channelChipActive]}
                    onPress={() => setChannel(ch)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.channelChipText, channel === ch && s.channelChipTextActive]}>
                      {ch === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={s.resendRow}>
              {countdown > 0 ? (
                <Text style={s.resendCooldown}>Resend code in <Text style={s.resendCount}>{countdown}s</Text></Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={resending} activeOpacity={0.7}>
                  {resending
                    ? <ActivityIndicator size="small" color="#55c49a" />
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
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  backBtn: {
    width: 38, height: 38, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1e1e28', alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontSize: 20, fontWeight: Typography.weight.bold, color: '#1e1e28', letterSpacing: -0.8, fontFamily: 'Inter_700Bold' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    padding: 28, gap: Spacing.lg, alignItems: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 18, elevation: Shadows.medium.elevation,
  },
  iconWrap: { marginBottom: Spacing.xs },
  iconCircle: { width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: Typography.weight.bold, color: '#1e1e28', letterSpacing: -0.6, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  sub: { fontSize: Typography.size.sm, color: '#5e5e72', textAlign: 'center', lineHeight: 22, fontFamily: 'Inter_400Regular' },
  phoneBold: { fontWeight: Typography.weight.bold, color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  otpWrap: { flexDirection: 'row', gap: 10, marginVertical: Spacing.sm },
  otpBox: {
    width: 46, height: 56, borderRadius: Radius.lg,
    backgroundColor: '#f2f2f5', borderWidth: 1.5, borderColor: '#e5e5ea',
    alignItems: 'center', justifyContent: 'center',
  },
  otpBoxFilled: { backgroundColor: 'white', borderColor: '#55c49a' },
  otpBoxActive: { borderColor: '#55c49a', backgroundColor: 'white' },
  otpBoxError: { borderColor: '#e53935', backgroundColor: '#fff5f5' },
  otpBoxLocked: { opacity: 0.5 },
  otpChar: { fontSize: Typography.size.xl, fontWeight: Typography.weight.bold, color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  errorText: { fontSize: 13, color: '#e53935', textAlign: 'center', fontFamily: 'Inter_400Regular' },
  lockoutText: { fontSize: 13, color: '#5e5e72', textAlign: 'center', fontFamily: 'Inter_500Medium' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  loadingText: { fontSize: 13, color: '#55c49a', fontFamily: 'Inter_500Medium' },
  channelRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: -Spacing.xs },
  channelChip: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.lg, borderWidth: 1.5, borderColor: '#e5e5ea',
    backgroundColor: '#f2f2f5',
  },
  channelChipActive: { borderColor: '#55c49a', backgroundColor: '#1e1e28' },
  channelChipText: { fontSize: 13, fontWeight: Typography.weight.medium, color: '#5e5e72', fontFamily: 'Inter_500Medium' },
  channelChipTextActive: { color: 'white', fontWeight: Typography.weight.semibold, fontFamily: 'Inter_600SemiBold' },
  resendRow: { alignItems: 'center', marginTop: Spacing.xs },
  resendCooldown: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
  resendCount: { fontWeight: Typography.weight.bold, color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  resendBtn: { fontSize: Typography.size.sm, color: '#55c49a', fontWeight: Typography.weight.semibold, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
  hint: { fontSize: Typography.size.xs, color: '#9e9ea8', textAlign: 'center', lineHeight: 18, paddingHorizontal: Spacing.sm },
});
