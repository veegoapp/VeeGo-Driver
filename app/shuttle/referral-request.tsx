import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Send } from 'lucide-react-native';
import React, { useState } from 'react';
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

type Params = {
  bookingId: string;
  routeName: string;
  departureTime: string;
  fromStation: string;
  toStation: string;
};

export default function ReferralRequestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;

  const { bookingId, routeName, departureTime, fromStation, toStation } =
    useLocalSearchParams<Params>();

  const [driverCode, setDriverCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!driverCode.trim()) {
      Alert.alert('', t.referral_code_placeholder);
      return;
    }
    setLoading(true);
    try {
      // TODO: Backend Integration - POST /shuttle/route-bookings/:id/refer
      // Body: { driverCode } — submits referral request; backend will send push notification to the target driver
      await endpoints.shuttle.referTrip(bookingId!, driverCode.trim());
      setSubmitted(true);
    } catch {
      // TODO: Backend Integration - Surface specific error codes (driver not found, already booked, etc.)
      Alert.alert('', t.referral_send_failed);
    } finally {
      setLoading(false);
    }
  };

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
              {/* TODO: Use translated backend fields (routeNameAr, fromAr, toAr) here */}
              {routeName ?? '—'}
            </Text>
            <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 4, textAlign: TA }]}>
              {departureTime ?? '—'} · {fromStation ?? '—'} → {toStation ?? '—'}
            </Text>
          </GlassView>

          {submitted ? (
            /* Pending state */
            <View style={styles.pendingWrap}>
              <View style={[styles.pendingIcon, { backgroundColor: '#1e1e2810' }]}>
                <Text style={{ fontSize: 40 }}>⏳</Text>
              </View>
              <Text style={[styles.pendingTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {t.referral_pending_msg}
              </Text>
              <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 }]}>
                {/* TODO: Backend Integration - Subscribe to referral:accepted / referral:declined socket events to update this state */}
                {t.referral_notification_sub}
              </Text>
              <Pressable
                onPress={() => router.navigate('/(shuttle)' as any)}
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
                {/* TODO: Backend Integration - Driver code format to be confirmed from backend (e.g., VGO-XXXX) */}
                {t.driver_code_hint}
              </Text>
              <GlassView style={[styles.inputWrap, { borderColor: colors.border }]} borderRadius={14}>
                <TextInput
                  value={driverCode}
                  onChangeText={setDriverCode}
                  placeholder={t.referral_code_placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSubmit}
                />
              </GlassView>

              <Pressable
                onPress={handleSubmit}
                disabled={loading || !driverCode.trim()}
                style={({ pressed }) => [
                  styles.submitBtn,
                  {
                    backgroundColor: driverCode.trim() ? '#1e1e28' : colors.secondary,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Send size={16} color={driverCode.trim() ? '#fff' : colors.mutedForeground} strokeWidth={2} />
                    <Text style={[
                      styles.submitBtnText,
                      { color: driverCode.trim() ? '#fff' : colors.mutedForeground, fontFamily: 'Inter_700Bold' },
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
