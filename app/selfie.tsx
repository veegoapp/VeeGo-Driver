import { ArrowLeft, Camera, Check, CheckCircle, CheckCircle2, Settings } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { useService } from '@/lib/serviceContext';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

export default function SelfieScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const { serviceType } = useService();
  const { t } = useI18n();
  const [photo, setPhoto] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);

  // Shuttle check-in params
  const params = useLocalSearchParams<{ tripId?: string; deadlineMinutes?: string }>();
  const shuttleCheckinMode = !!params.tripId;
  const deadlineSecs = shuttleCheckinMode
    ? Math.max(1, parseInt(params.deadlineMinutes ?? '10', 10)) * 60
    : 0;

  const [secondsLeft, setSecondsLeft] = useState(deadlineSecs);
  const [timedOut, setTimedOut] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!shuttleCheckinMode) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setTimedOut(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [shuttleCheckinMode]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const takeSelfie = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setCameraBlocked(true);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
      cameraType: ImagePicker.CameraType.front,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleConfirm = async () => {
    if (!photo || isUploading) return;
    if (shuttleCheckinMode && timedOut) {
      Alert.alert(t.timeout_alert_title, t.timeout_alert_body);
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri: photo, type: 'image/jpeg', name: 'selfie.jpg' } as unknown as Blob);
      formData.append('type', 'selfie');

      if (shuttleCheckinMode && params.tripId) {
        formData.append('tripId', params.tripId);
        const response = await endpoints.driver.checkin(formData);
        if (!response.ok) throw new Error('Checkin failed');
        if (intervalRef.current) clearInterval(intervalRef.current);
        setConfirmed(true);
        setTimeout(() => router.back(), 1200);
      } else {
        await endpoints.driver.uploadDocument(formData);
        setConfirmed(true);
        setTimeout(() => {
          router.replace(serviceType === 'SHUTTLE' ? '/(shuttle)' : '/(tabs)');
        }, 1200);
      }
    } catch {
      Alert.alert('Upload failed', 'Could not upload your selfie. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  if (cameraBlocked) {
    return (
      <View style={[s.root, s.blockedRoot, { backgroundColor: '#fafafd' }]}>
        <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { position: 'absolute', top: topPad + 16, left: 24 }]} activeOpacity={0.7}>
          <ArrowLeft size={20} color="#1e1e28" strokeWidth={2} />
        </TouchableOpacity>
        <View style={s.blockedCard}>
          <View style={s.blockedIconBox}>
            <Camera size={36} color="#5e5e72" strokeWidth={1.5} />
          </View>
          <Text style={s.blockedTitle}>{t.camera_required}</Text>
          <Text style={s.blockedSub}>{t.camera_required_sub}</Text>
          <TouchableOpacity style={s.settingsBtn} onPress={() => Linking.openSettings()} activeOpacity={0.85}>
            <Settings size={16} color="white" strokeWidth={2} />
            <Text style={s.settingsBtnText}>{t.open_settings}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.retryPermBtn}
            onPress={async () => {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status === 'granted') setCameraBlocked(false);
            }}
            activeOpacity={0.7}
          >
            <Text style={s.retryPermText}>I've granted permission — try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (confirmed) {
    return (
      <View style={[s.root, s.successRoot]}>
        <View style={s.successIcon}>
          <CheckCircle2 size={72} color="#1e1e28" />
        </View>
        <Text style={s.successTitle}>
          {shuttleCheckinMode ? t.verified_title_checkin : "You're all set!"}
        </Text>
        <Text style={s.successSub}>
          {shuttleCheckinMode
            ? t.verified_sub_checkin
            : 'Your account is being reviewed. You can start accepting trips shortly.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: '#fafafd' }]}>
      <View style={{ paddingTop: topPad + 16, paddingHorizontal: 24 }}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color="#1e1e28" strokeWidth={2} />
        </TouchableOpacity>

        <View style={s.header}>
          {shuttleCheckinMode ? (
            <>
              <Text style={s.step}>{t.selfie_checkin_step}</Text>
              <Text style={s.title}>{t.selfie_checkin_title}</Text>
              <Text style={s.sub}>{t.selfie_checkin_sub}</Text>
            </>
          ) : (
            <>
              <Text style={s.step}>Step 4 of 4</Text>
              <Text style={s.title}>Face{'\n'}verification</Text>
              <Text style={s.sub}>Take a clear selfie so we can verify your identity. Make sure your face is well-lit.</Text>
            </>
          )}
        </View>

        {shuttleCheckinMode && (
          <View style={[
            s.timerBox,
            timedOut ? { backgroundColor: '#fee2e2', borderColor: '#fca5a5' } : { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
          ]}>
            {timedOut ? (
              <Text style={[s.timerText, { color: '#dc2626', fontFamily: 'Inter_700Bold' }]}>
                {t.checkin_timed_out_msg}
              </Text>
            ) : (
              <>
                <Text style={[s.timerLabel, { color: '#92400e', fontFamily: 'Inter_400Regular' }]}>{t.time_remaining}</Text>
                <Text style={[s.timerCount, { color: secondsLeft <= 60 ? '#dc2626' : '#c2410c', fontFamily: 'Inter_700Bold' }]}>
                  {formatCountdown(secondsLeft)}
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      <View style={s.faceArea}>
        {photo ? (
          <View style={s.previewBox}>
            <Image source={{ uri: photo }} style={s.previewImg} />
            <View style={s.previewOverlay}>
              <Svg width="240" height="300" viewBox="0 0 240 300">
                <Ellipse
                  cx="120" cy="150" rx="100" ry="130"
                  stroke="#1e1e28" strokeWidth="3"
                  fill="none"
                  strokeDasharray="8 6"
                />
              </Svg>
            </View>
          </View>
        ) : (
          <View style={s.ovalGuide}>
            <Svg width="240" height="300" viewBox="0 0 240 300">
              <Ellipse
                cx="120" cy="150" rx="100" ry="130"
                stroke="#1e1e28" strokeWidth="2.5"
                fill="rgba(30,30,40,0.04)"
                strokeDasharray="8 6"
              />
              <Path
                d="M120 60 C80 60 50 90 50 130 C50 175 80 220 120 240 C160 220 190 175 190 130 C190 90 160 60 120 60"
                fill="#e8e8ee"
                opacity="0.6"
              />
              <Ellipse cx="120" cy="115" rx="28" ry="28" fill="#c3c3cc" opacity="0.7" />
              <Path
                d="M70 240 C70 200 170 200 170 240"
                fill="#c3c3cc" opacity="0.7"
              />
            </Svg>
            <View style={s.ovalHint}>
              <Text style={s.ovalHintText}>{t.face_in_oval}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={[s.footer, { paddingBottom: botPad + 28, paddingHorizontal: 24 }]}>
        {photo ? (
          <View style={s.actionRow}>
            <TouchableOpacity
              style={s.retakeBtn}
              onPress={() => setPhoto(null)}
              activeOpacity={0.8}
              disabled={isUploading}
            >
              <Camera size={18} color="#1e1e28" />
              <Text style={s.retakeBtnText}>{t.retake_photo}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.confirmBtn, { flex: 2, opacity: (isUploading || (shuttleCheckinMode && timedOut)) ? 0.6 : 1 }]}
              onPress={handleConfirm}
              activeOpacity={0.9}
              disabled={isUploading || (shuttleCheckinMode && timedOut)}
            >
              {isUploading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Text style={s.confirmBtnText}>{shuttleCheckinMode ? t.confirm_checkin : 'Confirm & finish'}</Text>
                  <Check size={18} color="white" strokeWidth={2} />
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.confirmBtn, { opacity: (shuttleCheckinMode && timedOut) ? 0.5 : 1 }]}
            onPress={takeSelfie}
            activeOpacity={0.9}
            disabled={shuttleCheckinMode && timedOut}
          >
            <Camera size={20} color="white" />
            <Text style={s.confirmBtnText}>{t.take_photo_btn}</Text>
          </TouchableOpacity>
        )}

        {!shuttleCheckinMode && (
          <View style={s.tipsRow}>
            {[t.tip_good_lighting, t.tip_face_centered, t.tip_no_glasses].map((tip) => (
              <View key={tip} style={s.tip}>
                <CheckCircle size={13} color="#5e5e72" />
                <Text style={s.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafd' },
  blockedRoot: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  blockedCard: {
    backgroundColor: 'white', borderRadius: 28, padding: 28,
    alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#e5e5ea',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 16, elevation: 4,
    width: '100%',
  },
  blockedIconBox: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: '#f2f2f5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  blockedTitle: { fontSize: 20, fontWeight: '700', color: '#1e1e28', textAlign: 'center', fontFamily: 'Inter_700Bold' },
  blockedSub: { fontSize: 14, color: '#5e5e72', lineHeight: 21, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  settingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1e1e28', borderRadius: 16, height: 48,
    paddingHorizontal: 24, marginTop: 8,
  },
  settingsBtnText: { color: 'white', fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  retryPermBtn: { paddingVertical: 8 },
  retryPermText: { fontSize: 13, color: '#5e5e72', fontFamily: 'Inter_400Regular', textDecorationLine: 'underline' },
  successRoot: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  successIcon: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: '#f2f2f5',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  successTitle: { fontSize: 32, fontWeight: '700', color: '#1e1e28', letterSpacing: -1, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  successSub: { fontSize: 15, color: '#5e5e72', lineHeight: 22, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: 'white',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e5e5ea',
  },
  header: { marginTop: 20, gap: 8 },
  step: { fontSize: 12, fontWeight: '600', color: '#5e5e72', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Inter_600SemiBold' },
  title: { fontSize: 34, fontWeight: '700', color: '#1e1e28', letterSpacing: -1.2, lineHeight: 40, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 14, color: '#5e5e72', lineHeight: 20, fontFamily: 'Inter_400Regular' },
  timerBox: {
    marginTop: 12, borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center',
  },
  timerLabel: { fontSize: 11, letterSpacing: 0.5 },
  timerCount: { fontSize: 28, letterSpacing: 2, marginTop: 2 },
  timerText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  faceArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ovalGuide: { alignItems: 'center', gap: 16 },
  ovalHint: {
    backgroundColor: 'rgba(30,30,40,0.06)', borderRadius: 99,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  ovalHintText: { fontSize: 13, color: '#1e1e28', fontWeight: '500', fontFamily: 'Inter_500Medium' },
  previewBox: { width: 240, height: 300, borderRadius: 120, overflow: 'hidden', position: 'relative' },
  previewImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  previewOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingTop: 16, gap: 14 },
  actionRow: { flexDirection: 'row', gap: 10 },
  retakeBtn: {
    flex: 1, height: 56, borderRadius: 20,
    backgroundColor: '#f2f2f5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: '#e5e5ea',
  },
  retakeBtnText: { fontSize: 14, fontWeight: '600', color: '#1e1e28', fontFamily: 'Inter_600SemiBold' },
  confirmBtn: {
    height: 56, borderRadius: 20, backgroundColor: '#1e1e28',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#1e1e28', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8,
  },
  confirmBtnText: { color: 'white', fontSize: 15, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  tipsRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tipText: { fontSize: 11, color: '#5e5e72', fontFamily: 'Inter_400Regular' },
});
