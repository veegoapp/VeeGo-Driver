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

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;
const MOCK_OTP = '000000';
const MOCK_ACCESS_TOKEN = 'mock-access-token-dev';
const MOCK_REFRESH_TOKEN = 'mock-refresh-token-dev';

export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const { phone: phoneParam, maskedPhone: maskedPhoneParam } = useLocalSearchParams<{ phone: string; maskedPhone?: string }>();
  const phone = phoneParam ? decodeURIComponent(phoneParam) : '';
  const { login } = useAuth();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const inputRef = useRef<TextInput>(null);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (otp.length === OTP_LENGTH) handleVerify();
  }, [otp]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = async () => {
    if (otp.length !== OTP_LENGTH || loading) return;
    setError(null);
    setLoading(true);
    console.log('[OTP] ▶ Verifying OTP:', otp, '| phone:', phone);
    try {
      console.log('[OTP] Simulating 600ms delay (mock mode) ...');
      await new Promise(r => setTimeout(r, 600));
      if (otp !== MOCK_OTP) {
        console.log('[OTP] ❌ Wrong OTP entered:', otp, '| expected:', MOCK_OTP);
        setError('Invalid or expired OTP. Please try again.');
        setOtp('');
        inputRef.current?.focus();
        return;
      }
      console.log('[OTP] ✅ OTP correct, checking driver_terms_pending_version in AsyncStorage ...');
      AsyncStorage.getItem('driver_terms_pending_version').then(async (pendingVersion) => {
        console.log('[OTP] driver_terms_pending_version =', pendingVersion);
        if (!pendingVersion) {
          console.log('[OTP] No pending terms version found, skipping terms acceptance.');
          return;
        }
        try {
          await AsyncStorage.setItem('driver_terms_accepted_version', pendingVersion);
          await AsyncStorage.removeItem('driver_terms_pending_version');
          console.log('[OTP] Terms accepted and pending version cleared.');
        } catch (e) {
          console.log('[OTP] Error saving terms acceptance:', e);
        }
      }).catch((e) => {
        console.log('[OTP] AsyncStorage error checking terms:', e);
      });
      console.log('[OTP] → Calling login() with mock tokens ...');
      console.log('[OTP]   accessToken:', MOCK_ACCESS_TOKEN, '| refreshToken:', MOCK_REFRESH_TOKEN);
      await login(MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN);
      console.log('[OTP] ✅ login() completed, navigator should redirect now.');
    } catch (e) {
      console.log('[OTP] ❌ Exception during OTP verify:', e);
      setError('Something went wrong. Please try again.');
      setOtp('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
      console.log('[OTP] ■ handleVerify finished (loading=false)');
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    setError(null);
    await new Promise(r => setTimeout(r, 500));
    setCountdown(RESEND_COOLDOWN);
    setResending(false);
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
            <Pressable style={s.otpWrap} onPress={() => inputRef.current?.focus()}>
              {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                const char = otp[i] ?? '';
                const active = otp.length === i;
                return (
                  <View key={i} style={[s.otpBox, char && s.otpBoxFilled, active && s.otpBoxActive, !!error && s.otpBoxError]}>
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
              autoFocus
            />

            {error && <Text style={s.errorText}>{error}</Text>}

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
          <Text style={[s.hint, { color: '#3D52D5', marginTop: -8 }]}>🛠 Dev mode: use code <Text style={{ fontWeight: '700' }}>000000</Text></Text>
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
  otpChar: { fontSize: 22, fontWeight: '700', color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  errorText: { fontSize: 13, color: '#e53935', textAlign: 'center', fontFamily: 'Inter_400Regular' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13, color: '#3D52D5', fontFamily: 'Inter_500Medium' },
  resendRow: { alignItems: 'center', marginTop: 4 },
  resendCooldown: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
  resendCount: { fontWeight: '700', color: '#1e1e28', fontFamily: 'Inter_700Bold' },
  resendBtn: { fontSize: 14, color: '#3D52D5', fontWeight: '600', fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
  hint: { fontSize: 12, color: '#9e9ea8', textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
});
