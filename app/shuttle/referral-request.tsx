import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronLeft, Send, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';

type Params = {
  bookingId: string;
  routeName: string;
  routeNameAr?: string;
  departureTime: string;
  fromStation: string;
  toStation: string;
};

export default function ReferralRequestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { bookingId, routeName: routeNameRaw, routeNameAr, departureTime, fromStation, toStation } =
    useLocalSearchParams<Params>();
  const routeName = (isRTL && routeNameAr) ? routeNameAr : (routeNameRaw ?? '—');

  const { socket } = useSocket();
  const [driverCode, setDriverCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pendingReferralId, setPendingReferralId] = useState('');
  const [referralResult, setReferralResult] = useState<'accepted' | 'declined' | null>(null);

  const DRIVER_CODE_REGEX = /^VGO-[0-9A-Z]{1,4}$/;
  const isValidCode = DRIVER_CODE_REGEX.test(driverCode.trim());

  const handleSubmit = async () => {
    if (!driverCode.trim() || !isValidCode) {
      Alert.alert('', t.referral_code_placeholder);
      return;
    }
    setLoading(true);
    try {
      const result = await endpoints.shuttle.referTrip(bookingId!, driverCode.trim());
      if (result?.referralId) setPendingReferralId(String(result.referralId));
      setSubmitted(true);
    } catch {
      Alert.alert('', t.referral_send_failed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!socket || !submitted) return;

    const handleAccepted = (data: { referralId?: number | string; bookingId?: number | string }) => {
      const matchById = pendingReferralId && String(data.referralId) === pendingReferralId;
      const matchByBooking = !pendingReferralId && String(data.bookingId) === String(bookingId);
      if (matchById || matchByBooking) setReferralResult('accepted');
    };

    const handleDeclined = (data: { referralId?: number | string }) => {
      if (!pendingReferralId || String(data.referralId) === pendingReferralId) {
        setReferralResult('declined');
      }
    };

    socket.on(SOCKET_EVENTS.REFERRAL_ACCEPTED, handleAccepted);
    socket.on(SOCKET_EVENTS.REFERRAL_DECLINED, handleDeclined);
    return () => {
      socket.off(SOCKET_EVENTS.REFERRAL_ACCEPTED, handleAccepted);
      socket.off(SOCKET_EVENTS.REFERRAL_DECLINED, handleDeclined);
    };
  }, [socket, submitted, pendingReferralId, bookingId]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <ChevronLeft
              size={24}
              color={colors.foreground}
              strokeWidth={2}
              style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}
            />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {t.referral_form_title}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          {/* Trip summary */}
          <GlassView style={[styles.tripSummary, { marginTop: 24 }]} borderRadius={16}>
            <Text style={[{ fontSize: 15, color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              {routeName}
            </Text>
            <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 4, textAlign: TA }]}>
              {departureTime ?? '—'} · {fromStation ?? '—'} → {toStation ?? '—'}
            </Text>
          </GlassView>

          {referralResult === 'accepted' ? (
            <View style={styles.pendingWrap}>
              <View style={[styles.pendingIcon, { backgroundColor: '#dcfce7' }]}>
                <Check size={36} color="#16a34a" strokeWidth={2.5} />
              </View>
              <Text style={[styles.pendingTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {t.referral_accepted_title}
              </Text>
              <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 }]}>
                {t.referral_request_accepted_sub}
              </Text>
              <Pressable
                onPress={() => router.replace('/(shuttle)/home' as any)}
                style={[styles.doneBtn, { backgroundColor: '#16a34a' }]}
              >
                <Text style={[styles.doneBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.return_home}</Text>
              </Pressable>
            </View>
          ) : referralResult === 'declined' ? (
            <View style={styles.pendingWrap}>
              <View style={[styles.pendingIcon, { backgroundColor: '#FEF2F2' }]}>
                <X size={36} color="#DC2626" strokeWidth={2.5} />
              </View>
              <Text style={[styles.pendingTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {t.referral_declined_title}
              </Text>
              <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 }]}>
                {t.referral_request_declined_sub}
              </Text>
              <Pressable
                onPress={() => router.replace('/(shuttle)/home' as any)}
                style={[styles.doneBtn, { backgroundColor: '#1e1e28' }]}
              >
                <Text style={[styles.doneBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.return_home}</Text>
              </Pressable>
            </View>
          ) : submitted ? (
            /* Pending state */
            <View style={styles.pendingWrap}>
              <View style={[styles.pendingIcon, { backgroundColor: '#1e1e2810' }]}>
                <Text style={{ fontSize: 40 }}>⏳</Text>
              </View>
              <Text style={[styles.pendingTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {t.referral_pending_msg}
              </Text>
              <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 }]}>
                {t.referral_notification_sub}
              </Text>
              <Pressable
                onPress={() => router.replace('/(shuttle)/home' as any)}
                style={[styles.doneBtn, { backgroundColor: '#1e1e28' }]}
              >
                <Text style={[styles.doneBtnText, { fontFamily: 'Inter_700Bold' }]}>{t.return_home}</Text>
              </Pressable>
            </View>
          ) : (
            /* Input form */
            <View style={{ marginTop: 28 }}>
              <Text style={[styles.inputLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
                {t.referral_code_label}
              </Text>
              <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA, marginTop: 4, marginBottom: 12 }]}>
                {t.driver_code_hint}
              </Text>
              <GlassView style={[styles.inputWrap, { borderColor: colors.border }]} borderRadius={14}>
                <TextInput
                  value={driverCode}
                  onChangeText={setDriverCode}
                  placeholder="VGO-XXXX"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                  returnKeyType="send"
                  onSubmitEditing={handleSubmit}
                />
              </GlassView>

              <Pressable
                onPress={handleSubmit}
                disabled={loading || !isValidCode}
                style={({ pressed }) => [
                  styles.submitBtn,
                  {
                    backgroundColor: isValidCode ? '#1e1e28' : colors.secondary,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Send size={16} color={isValidCode ? '#fff' : colors.mutedForeground} strokeWidth={2} />
                    <Text style={[
                      styles.submitBtnText,
                      { color: isValidCode ? '#fff' : colors.mutedForeground, fontFamily: 'Inter_700Bold' },
                    ]}>
                      {t.referral_submit}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17 },
  tripSummary: { padding: 16 },
  inputLabel: { fontSize: 14 },
  inputWrap: { borderWidth: 1.5, paddingHorizontal: 14 },
  input: { height: 52, fontSize: 16 },
  submitBtn: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  submitBtnText: { fontSize: 15 },
  pendingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40, gap: 16 },
  pendingIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  pendingTitle: { fontSize: 16, textAlign: 'center' },
  doneBtn: { marginTop: 8, height: 50, paddingHorizontal: 32, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { color: '#fff', fontSize: 14 },
});
