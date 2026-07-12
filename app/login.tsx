// Task 5: replaced OTP flow with credential (email/phone) + password login
// Sign In → endpoints.auth.driverLogin({ credential, password })
// Sign Up → endpoints.auth.driverRegister({ name, email, phone, password, licenseNumber?, nationalId? })

import { Navigation, User, Mail, Phone, Lock, Eye, EyeOff, AlertCircle, ArrowRight, CheckSquare, Square } from 'lucide-react-native';
import { router as expoRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState, useEffect } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18nContext';
import { useAuth } from '@/lib/authContext';
import { endpoints, ApiError } from '@/lib/api';
import { TermsModal } from '@/components/TermsModal';

const TERMS_VERSION_KEY = 'driver_terms_accepted_version';

type Tab = 'signin' | 'signup';

function getErrorMessage(err: unknown, t: ReturnType<typeof useI18n>['t']): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t.err_no_connection;
    if (err.status === 401 || err.status === 400) return t.err_invalid_credentials;
    if (err.status === 404) return t.err_account_not_found;
    if (err.status === 409) return t.err_account_exists;
    if (err.status === 429) return t.err_server_busy;
    if (err.status >= 500) return t.err_server_error;
    const body = err.body as { error?: string } | null;
    if (body?.error) return body.error;
  }
  if (err instanceof TypeError) return t.err_no_connection;
  return t.err_generic;
}

export default function LoginScreen() {
  const [tab, setTab] = useState<Tab>('signin');
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const { login } = useAuth();
  // Prefilled after a successful password reset (see app/forgot-password.tsx DoneStep).
  const { credential: credentialParam } = useLocalSearchParams<{ credential?: string }>();
  const initialCredential = credentialParam ? decodeURIComponent(credentialParam) : undefined;

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const { setLanguage, language } = useI18n();

  const handleSignInSuccess = async (
    accessToken: string,
    refreshToken: string,
    _status: 'pending' | 'approved',
    _serviceType: string | null,
  ) => {
    await login(accessToken, refreshToken);
    // _layout.tsx watches the token and calls navigateAfterAuth — no need to navigate here.
  };

  const handleOtpRequired = (phone: string, maskedPhone?: string, retryAfter?: number) => {
    expoRouter.replace({
      pathname: '/verify-otp',
      params: {
        phone: encodeURIComponent(phone),
        maskedPhone: maskedPhone ?? phone,
        ...(retryAfter ? { retryAfter: String(retryAfter) } : {}),
      },
    } as any);
  };

  return (
    <LinearGradient colors={['#f4f4fb', '#ededf4'] as const} style={s.root}>
      <View style={[s.langBar, { top: insets.top + 12, flexDirection: R }]}>
        <TouchableOpacity onPress={() => setLanguage('ar')} style={[s.langChip, language === 'ar' && s.langChipActive]} activeOpacity={0.8}>
          <Text style={[s.langText, language === 'ar' && s.langTextActive]}>AR</Text>
        </TouchableOpacity>
        <View style={s.langSep} />
        <TouchableOpacity onPress={() => setLanguage('en')} style={[s.langChip, (language === 'en' || !language) && s.langChipActive]} activeOpacity={0.8}>
          <Text style={[s.langText, (language === 'en' || !language) && s.langTextActive]}>EN</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.logoBlock}>
            <View style={s.logoIcon}>
              <Navigation size={32} color="#ffffff" />
            </View>
            <Text style={s.wordmark}>Vee<Text style={{ color: '#55c49a' }}>Go</Text></Text>
            <View style={s.driverPill}>
              <Text style={s.driverPillText}>DRIVER</Text>
            </View>
          </View>

          <View style={s.card}>
            <View style={[s.tabs, { flexDirection: R }]}>
              {(['signin', 'signup'] as Tab[]).map((tabKey) => (
                <TouchableOpacity
                  key={tabKey}
                  onPress={() => setTab(tabKey)}
                  style={[s.tabBtn, tab === tabKey && s.tabBtnActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[s.tabText, tab === tabKey && s.tabTextActive]}>
                    {tabKey === 'signin' ? t.sign_in : t.sign_up}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === 'signin' ? (
              <SignInForm isRTL={isRTL} onSuccess={(at, rt, status, serviceType) => handleSignInSuccess(at, rt, status, serviceType)} onOtpRequired={handleOtpRequired} initialCredential={initialCredential} />
            ) : (
              <SignUpForm isRTL={isRTL} onOtpRequired={handleOtpRequired} />
            )}
          </View>

          <Text style={[s.terms, { textAlign: 'center' }]}>
            {t.driver_terms_prefix}{' '}
            <Text style={s.termsLink}>{t.driver_terms_link}</Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function SignInForm({ isRTL, onSuccess, onOtpRequired, initialCredential }: {
  isRTL: boolean;
  onSuccess: (at: string, rt: string, status: 'pending' | 'approved', serviceType: string | null) => void;
  onOtpRequired: (phone: string, maskedPhone?: string, retryAfter?: number) => void;
  initialCredential?: string;
}) {
  const { t } = useI18n();
  const [credential, setCredential] = useState(initialCredential ?? '');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const handle = async () => {
    if (!credential.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const result = await endpoints.auth.driverLogin(credential.trim(), password);
      onSuccess(result.accessToken, result.refreshToken, result.status, result.serviceType);
    } catch (err) {
      // Account exists but phone isn't verified yet — backend already auto-sent
      // a fresh OTP, so route to verification instead of showing a login error.
      if (err instanceof ApiError && (err.body as { requiresOtp?: boolean } | null)?.requiresOtp === true) {
        const body = err.body as { phone: string; maskedPhone?: string; retryAfter?: number };
        onOtpRequired(body.phone, body.maskedPhone, body.retryAfter);
        return;
      }
      setError(getErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.form}>
      <View style={s.formHeader}>
        <Text style={[s.formTitle, { textAlign: TA }]}>{t.login_welcome_back}</Text>
        <Text style={[s.formSub, { textAlign: TA }]}>{t.login_signin_sub}</Text>
      </View>

      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><Phone size={16} color="#5e5e72" /></View>
        <TextInput
          style={[s.inputField, { textAlign: TA }]}
          placeholder={t.email_or_phone}
          placeholderTextColor="#c3c3cc"
          value={credential}
          onChangeText={v => { setCredential(v); setError(null); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><Lock size={16} color="#5e5e72" /></View>
        <TextInput
          style={[s.inputField, { textAlign: TA, flex: 1 }]}
          placeholder={t.password}
          placeholderTextColor="#c3c3cc"
          value={password}
          onChangeText={v => { setPassword(v); setError(null); }}
          secureTextEntry={!showPass}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity onPress={() => setShowPass(p => !p)} style={{ padding: 4 }}>
          {showPass ? <EyeOff size={16} color="#5e5e72" /> : <Eye size={16} color="#5e5e72" />}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={s.errorRow}>
          <AlertCircle size={14} color="#e53935" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <Pressable style={[s.primaryBtn, { flexDirection: R }, (!credential.trim() || !password || loading) && { opacity: 0.6 }]} onPress={handle} disabled={!credential.trim() || !password || loading}>
        {loading ? <ActivityIndicator color="white" size="small" /> : (
          <><Text style={s.primaryBtnText}>{t.sign_in}</Text><ArrowRight size={16} color="white" /></>
        )}
      </Pressable>

      <TouchableOpacity
        style={s.forgotBtn}
        onPress={() => expoRouter.push('/forgot-password')}
        activeOpacity={0.7}
      >
        <Text style={s.forgotText}>{t.forgot_password_title}</Text>
      </TouchableOpacity>

    </View>
  );
}

type TermsData = { id: number; version: number; contentAr: string; contentEn: string; updatedAt: string };

function SignUpForm({ isRTL, onOtpRequired }: { isRTL: boolean; onOtpRequired: (phone: string, maskedPhone?: string, retryAfter?: number) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [termsData, setTermsData] = useState<TermsData | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  useEffect(() => {
    endpoints.terms.fetchDriver().then(setTermsData).catch(() => {/* fail silently */});
  }, []);

  const canSubmit = name.trim().length > 1 && email.trim().length > 3 && phone.trim().length > 7 && password.length >= 8 && termsChecked;

  const handle = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    if (__DEV__) console.log('[SIGNUP] ▶ Register button pressed');
    try {
      if (__DEV__) console.log('[SIGNUP] Calling endpoints.auth.driverRegister ...');
      const result = await endpoints.auth.driverRegister({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      if (__DEV__) console.log('[SIGNUP] ✅ Register succeeded');
      // Accept terms silently after registration — token arrives after OTP
      // so we store the pending version to accept once we have the token
      if (termsData) {
        try {
          await AsyncStorage.setItem('driver_terms_pending_version', String(termsData.version));
          if (__DEV__) console.log('[SIGNUP] Terms pending version saved:', termsData.version);
        } catch { /* ignore */ }
      }
      // Phase 2: register returns requiresOtp, not tokens
      if (__DEV__) console.log('[SIGNUP] → Navigating to OTP screen');
      onOtpRequired(result.phone, result.maskedPhone);
    } catch (err) {
      if (__DEV__) console.log('[SIGNUP] ❌ Error during register:', err);
      if (__DEV__ && err instanceof ApiError) {
        console.log('[SIGNUP] ApiError status:', err.status, '| body:', JSON.stringify(err.body));
      }
      setError(getErrorMessage(err, t));
    } finally {
      setLoading(false);
      if (__DEV__) console.log('[SIGNUP] ■ Register flow finished (loading=false)');
    }
  };

  const handleTermsAcceptFromModal = () => {
    setTermsChecked(true);
    setTermsModalVisible(false);
  };

  return (
    <View style={s.form}>
      <View style={s.formHeader}>
        <Text style={[s.formTitle, { textAlign: TA }]}>{t.sign_up}</Text>
        <Text style={[s.formSub, { textAlign: TA }]}>{t.driver_signup_sub}</Text>
      </View>

      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><User size={16} color="#5e5e72" /></View>
        <TextInput style={[s.inputField, { textAlign: TA }]} placeholder={t.full_name} placeholderTextColor="#c3c3cc" value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false} />
      </View>

      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><Mail size={16} color="#5e5e72" /></View>
        <TextInput style={[s.inputField, { textAlign: TA }]} placeholder={t.email_address} placeholderTextColor="#c3c3cc" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      </View>

      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><Phone size={16} color="#5e5e72" /></View>
        <TextInput style={[s.inputField, { textAlign: TA }]} placeholder={t.phone} placeholderTextColor="#c3c3cc" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" />
      </View>

      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><Lock size={16} color="#5e5e72" /></View>
        <TextInput style={[s.inputField, { textAlign: TA, flex: 1 }]} placeholder={t.password_min_8} placeholderTextColor="#c3c3cc" value={password} onChangeText={setPassword} secureTextEntry={!showPass} autoCapitalize="none" autoCorrect={false} />
        <TouchableOpacity onPress={() => setShowPass(p => !p)} style={{ padding: 4 }}>
          {showPass ? <EyeOff size={16} color="#5e5e72" /> : <Eye size={16} color="#5e5e72" />}
        </TouchableOpacity>
      </View>

      {/* Terms checkbox */}
      <TouchableOpacity
        onPress={() => setTermsChecked(v => !v)}
        style={[s.termsCheckRow, { flexDirection: R }]}
        activeOpacity={0.7}
      >
        {termsChecked
          ? <CheckSquare size={20} color="#1e1e28" strokeWidth={2} />
          : <Square size={20} color="#5e5e72" strokeWidth={2} />
        }
        <Text style={[s.termsCheckText, { textAlign: TA }]}>
          {t.terms_agree_checkbox}{' '}
          <Text
            style={s.termsCheckLink}
            onPress={() => setTermsModalVisible(true)}
          >
            {t.terms_agree_link}
          </Text>
        </Text>
      </TouchableOpacity>

      {error && (
        <View style={s.errorRow}>
          <AlertCircle size={14} color="#e53935" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <Pressable style={[s.primaryBtn, { flexDirection: R }, (!canSubmit || loading) && { opacity: 0.6 }]} onPress={handle} disabled={!canSubmit || loading}>
        {loading ? <ActivityIndicator color="white" size="small" /> : (
          <><Text style={s.primaryBtnText}>{t.sign_up}</Text><ArrowRight size={16} color="white" /></>
        )}
      </Pressable>

      {termsData && (
        <TermsModal
          visible={termsModalVisible}
          contentEn={termsData.contentEn}
          contentAr={termsData.contentAr}
          showAcceptButton
          onAccept={handleTermsAcceptFromModal}
          onClose={() => setTermsModalVisible(false)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  langBar: {
    position: 'absolute', right: 20, zIndex: 20, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 4, gap: 2,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  langChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  langChipActive: { backgroundColor: '#1e1e28' },
  langText: { fontSize: 12, fontWeight: '600', color: '#5e5e72' },
  langTextActive: { color: 'white' },
  langSep: { width: 1, height: 14, backgroundColor: '#e5e5ea' },
  scroll: { flexGrow: 1, paddingHorizontal: 20, gap: 20, justifyContent: 'center' },
  logoBlock: { alignItems: 'center', gap: 10, paddingBottom: 4 },
  logoIcon: {
    width: 64, height: 64, borderRadius: 22, backgroundColor: '#1e1e28',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.22, shadowRadius: 30, elevation: 10,
  },
  wordmark: { fontSize: 30, fontWeight: '700', color: '#1e1e28', letterSpacing: -1.2, fontFamily: 'Inter_700Bold' },
  driverPill: { backgroundColor: 'rgba(30,30,40,0.08)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
  driverPillText: { fontSize: 10, fontWeight: '700', color: '#1e1e28', letterSpacing: 2 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden', shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 18, elevation: 4,
  },
  tabs: { borderBottomWidth: 1, borderBottomColor: '#e5e5ea' },
  tabBtn: { flex: 1, paddingVertical: 18, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#1e1e28', marginBottom: -1 },
  tabText: { fontSize: 13, fontWeight: '500', color: '#5e5e72' },
  tabTextActive: { color: '#1e1e28', fontWeight: '700', fontFamily: 'Inter_700Bold' },
  form: { padding: 24, gap: 12 },
  formHeader: { gap: 4, marginBottom: 4 },
  formTitle: { fontSize: 22, fontWeight: '700', color: '#1e1e28', letterSpacing: -0.5, fontFamily: 'Inter_700Bold' },
  formSub: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
  inputWrap: { alignItems: 'center', backgroundColor: '#f2f2f5', borderRadius: 18, height: 54, paddingHorizontal: 16, gap: 10 },
  inputIcon: { width: 28, alignItems: 'center' },
  inputField: { flex: 1, fontSize: 14, color: '#1e1e28', fontFamily: 'Inter_400Regular' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  errorText: { fontSize: 12, color: '#e53935', fontFamily: 'Inter_400Regular', flex: 1 },
  primaryBtn: {
    height: 56, borderRadius: 20, backgroundColor: '#1e1e28',
    alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 6,
  },
  primaryBtnText: { color: 'white', fontSize: 15, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  optionalToggle: { alignItems: 'center', gap: 6, paddingVertical: 4 },
  optionalToggleText: { fontSize: 12, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
  termsCheckRow: { alignItems: 'center', gap: 10, paddingVertical: 4 },
  termsCheckText: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 20 },
  termsCheckLink: { color: '#1e1e28', fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
  terms: { fontSize: 11, color: '#5e5e72', lineHeight: 16 },
  termsLink: { color: '#1e1e28', fontWeight: '600' },
  forgotBtn: { alignItems: 'center', paddingVertical: 4 },
  forgotText: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular', textDecorationLine: 'underline' },
});
