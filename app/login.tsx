// Task 5: replaced OTP flow with credential (email/phone) + password login
// Sign In → endpoints.auth.driverLogin({ credential, password })
// Sign Up → endpoints.auth.driverRegister({ name, email, phone, password, licenseNumber?, nationalId? })

import { Navigation, User, Mail, Phone, Lock, Eye, EyeOff, AlertCircle, ArrowLeft, ArrowRight, CreditCard } from 'lucide-react-native';
import { router as expoRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
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
import { useI18n } from '@/lib/i18nContext';
import { useAuth } from '@/lib/authContext';
import { endpoints, ApiError } from '@/lib/api';
import { api } from '@/lib/api';
import { saveToken } from '@/lib/auth';
import { navigateAfterAuth } from '@/lib/postAuthRouter';

type Tab = 'signin' | 'signup';

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'Cannot reach the server. Please check your connection.';
    if (err.status === 401 || err.status === 400) return 'Invalid credentials. Please check and try again.';
    if (err.status === 404) return 'Account not found. Please sign up first.';
    if (err.status === 409) return 'An account with this email or phone already exists.';
    if (err.status === 429) return 'Server is unavailable right now. Please try again later.';
    if (err.status >= 500) return 'Server error. Please try again later.';
    const body = err.body as { error?: string } | null;
    if (body?.error) return body.error;
  }
  if (err instanceof TypeError) return 'Cannot reach the server. Please check your connection.';
  return 'Something went wrong. Please try again.';
}

export default function LoginScreen() {
  const [tab, setTab] = useState<Tab>('signin');
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const { login } = useAuth();

  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  const handleSignInSuccess = async (
    accessToken: string,
    refreshToken: string,
    isActive: boolean,
  ) => {
    await login(accessToken, refreshToken);
    if (!isActive) {
      expoRouter.replace('/pending-approval');
      return;
    }
    await navigateAfterAuth(accessToken);
  };

  const handleRegisterSuccess = async (accessToken: string, refreshToken: string) => {
    await login(accessToken, refreshToken);
    expoRouter.replace('/register-documents');
  };

  return (
    <LinearGradient colors={['#f4f4fb', '#ededf4'] as const} style={s.root}>
      <View style={[s.langBar, { top: insets.top + 12, flexDirection: R }]}>
        <TouchableOpacity style={s.langChip} activeOpacity={0.8}>
          <Text style={s.langText}>AR</Text>
        </TouchableOpacity>
        <View style={s.langSep} />
        <TouchableOpacity style={[s.langChip, s.langChipActive]} activeOpacity={0.8}>
          <Text style={[s.langText, s.langTextActive]}>EN</Text>
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
            <Text style={s.wordmark}>Vee<Text style={{ color: '#3D52D5' }}>Go</Text></Text>
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
              <SignInForm isRTL={isRTL} onSuccess={(at, rt, active) => handleSignInSuccess(at, rt, active)} />
            ) : (
              <SignUpForm isRTL={isRTL} onSuccess={(at, rt) => handleRegisterSuccess(at, rt)} />
            )}
          </View>

          <Text style={[s.terms, { textAlign: 'center' }]}>
            By continuing you agree to VeeGo's{' '}
            <Text style={s.termsLink}>Driver Terms & Privacy Policy</Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// Task 5: credential + password sign-in form
function SignInForm({ isRTL, onSuccess }: { isRTL: boolean; onSuccess: (at: string, rt: string, isActive: boolean) => void }) {
  const [credential, setCredential] = useState('');
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
      const at = (result.accessToken ?? result.token) as string;
      const rt = result.refreshToken as string;
      // Check isActive — pending drivers see the approval screen instead of the dashboard.
      let isActive = true;
      try {
        await saveToken(at);
        const me = await api.get<{ isActive?: boolean }>('/driver/me');
        isActive = me?.isActive !== false;
      } catch {
        // If the check fails, assume active so login still works
      }
      onSuccess(at, rt, isActive);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.form}>
      <View style={s.formHeader}>
        <Text style={[s.formTitle, { textAlign: TA }]}>Welcome back</Text>
        <Text style={[s.formSub, { textAlign: TA }]}>Sign in with your email or phone number</Text>
      </View>

      {/* credential field */}
      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><Phone size={16} color="#5e5e72" /></View>
        <TextInput
          style={[s.inputField, { textAlign: TA }]}
          placeholder="Email or phone number"
          placeholderTextColor="#c3c3cc"
          value={credential}
          onChangeText={v => { setCredential(v); setError(null); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* password field */}
      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><Lock size={16} color="#5e5e72" /></View>
        <TextInput
          style={[s.inputField, { textAlign: TA, flex: 1 }]}
          placeholder="Password"
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
          <><Text style={s.primaryBtnText}>Sign in</Text><ArrowRight size={16} color="white" /></>
        )}
      </Pressable>

      <TouchableOpacity
        style={s.forgotBtn}
        onPress={() => expoRouter.push('/forgot-password')}
        activeOpacity={0.7}
      >
        <Text style={s.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

    </View>
  );
}

// Task 5: full registration form using POST /driver/auth/register
function SignUpForm({ isRTL, onSuccess }: { isRTL: boolean; onSuccess: (at: string, rt: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const canSubmit = name.trim().length > 1 && email.trim().length > 3 && phone.trim().length > 7 && password.length >= 8;

  const handle = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const result = await endpoints.auth.driverRegister({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        licenseNumber: licenseNumber.trim() || undefined,
        nationalId: nationalId.trim() || undefined,
      });
      onSuccess((result.accessToken ?? result.token) as string, result.refreshToken as string);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.form}>
      <View style={s.formHeader}>
        <Text style={[s.formTitle, { textAlign: TA }]}>Create account</Text>
        <Text style={[s.formSub, { textAlign: TA }]}>Fill in your details to get started</Text>
      </View>

      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><User size={16} color="#5e5e72" /></View>
        <TextInput style={[s.inputField, { textAlign: TA }]} placeholder="Full name" placeholderTextColor="#c3c3cc" value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false} />
      </View>

      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><Mail size={16} color="#5e5e72" /></View>
        <TextInput style={[s.inputField, { textAlign: TA }]} placeholder="Email address" placeholderTextColor="#c3c3cc" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      </View>

      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><Phone size={16} color="#5e5e72" /></View>
        <TextInput style={[s.inputField, { textAlign: TA }]} placeholder="Phone number" placeholderTextColor="#c3c3cc" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" />
      </View>

      <View style={[s.inputWrap, { flexDirection: R }]}>
        <View style={s.inputIcon}><Lock size={16} color="#5e5e72" /></View>
        <TextInput style={[s.inputField, { textAlign: TA, flex: 1 }]} placeholder="Password (min 8 chars)" placeholderTextColor="#c3c3cc" value={password} onChangeText={setPassword} secureTextEntry={!showPass} autoCapitalize="none" autoCorrect={false} />
        <TouchableOpacity onPress={() => setShowPass(p => !p)} style={{ padding: 4 }}>
          {showPass ? <EyeOff size={16} color="#5e5e72" /> : <Eye size={16} color="#5e5e72" />}
        </TouchableOpacity>
      </View>

      {/* Optional fields toggle */}
      <TouchableOpacity onPress={() => setShowOptional(v => !v)} style={[s.optionalToggle, { flexDirection: R }]}>
        <CreditCard size={14} color="#5e5e72" />
        <Text style={s.optionalToggleText}>{showOptional ? 'Hide' : 'Add'} license & national ID (optional)</Text>
        {isRTL ? <ArrowLeft size={14} color="#5e5e72" /> : <ArrowRight size={14} color="#5e5e72" />}
      </TouchableOpacity>

      {showOptional && (
        <>
          <View style={[s.inputWrap, { flexDirection: R }]}>
            <View style={s.inputIcon}><CreditCard size={16} color="#5e5e72" /></View>
            <TextInput style={[s.inputField, { textAlign: TA }]} placeholder="License number" placeholderTextColor="#c3c3cc" value={licenseNumber} onChangeText={setLicenseNumber} autoCapitalize="characters" autoCorrect={false} />
          </View>
          <View style={[s.inputWrap, { flexDirection: R }]}>
            <View style={s.inputIcon}><CreditCard size={16} color="#5e5e72" /></View>
            <TextInput style={[s.inputField, { textAlign: TA }]} placeholder="National ID" placeholderTextColor="#c3c3cc" value={nationalId} onChangeText={setNationalId} autoCapitalize="characters" autoCorrect={false} />
          </View>
        </>
      )}

      {error && (
        <View style={s.errorRow}>
          <AlertCircle size={14} color="#e53935" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <Pressable style={[s.primaryBtn, { flexDirection: R }, (!canSubmit || loading) && { opacity: 0.6 }]} onPress={handle} disabled={!canSubmit || loading}>
        {loading ? <ActivityIndicator color="white" size="small" /> : (
          <><Text style={s.primaryBtnText}>Create account</Text><ArrowRight size={16} color="white" /></>
        )}
      </Pressable>
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
  terms: { fontSize: 11, color: '#5e5e72', lineHeight: 16 },
  termsLink: { color: '#1e1e28', fontWeight: '600' },
  forgotBtn: { alignItems: 'center', paddingVertical: 4 },
  forgotText: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular', textDecorationLine: 'underline' },
});
