import {
  CheckCircle2, Camera, CreditCard, Car, FileText,
  Award, AlertCircle, ArrowRight, User, Settings,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18nContext';
import { endpoints, ApiError } from '@/lib/api';
import { signupStore } from '@/lib/signupStore';
import { compressImage } from '@/lib/imageCompression';

type DocSlot = {
  id: string;
  backendType: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size: number; color: string }>;
};

// 8 mandatory docs for ALL service types + criminal record as optional
const SECTIONS: { title: string; slots: DocSlot[]; optional?: boolean }[] = [
  {
    title: 'Profile Photo',
    slots: [
      { id: 'profile_photo', backendType: 'profile_photo', label: 'Profile photo', hint: 'Clear face photo, look at camera', icon: User },
    ],
  },
  {
    title: 'National ID',
    slots: [
      { id: 'national_id_front', backendType: 'national_id_front', label: 'Front side', hint: 'Clear photo of front', icon: CreditCard },
      { id: 'national_id_back', backendType: 'national_id_back', label: 'Back side', hint: 'Clear photo of back', icon: CreditCard },
    ],
  },
  {
    title: 'Driving License',
    slots: [
      { id: 'driving_license_front', backendType: 'driving_license_front', label: 'Front side', hint: 'License front page', icon: Award },
      { id: 'driving_license_back', backendType: 'driving_license_back', label: 'Back side', hint: 'License back page', icon: Award },
    ],
  },
  {
    title: 'Vehicle License',
    slots: [
      { id: 'vehicle_license_front', backendType: 'vehicle_license_front', label: 'Front side', hint: 'License front page', icon: FileText },
      { id: 'vehicle_license_back', backendType: 'vehicle_license_back', label: 'Back side', hint: 'License back page', icon: FileText },
    ],
  },
  {
    title: 'Vehicle Photo',
    slots: [
      { id: 'vehicle_photo', backendType: 'vehicle_photo', label: 'Vehicle photo', hint: 'Clear photo of the full vehicle', icon: Car },
    ],
  },
  {
    title: 'Criminal Record',
    optional: true,
    slots: [
      { id: 'criminal_record', backendType: 'criminal_record', label: 'Criminal record', hint: 'Official police clearance certificate', icon: FileText },
    ],
  },
];

// Only mandatory IDs (not criminal_record) must be uploaded to proceed
const MANDATORY_IDS = SECTIONS.filter(sec => !sec.optional).flatMap(sec => sec.slots.map(sl => sl.id));
const ALL_IDS = SECTIONS.flatMap(s => s.slots.map(sl => sl.id));

export default function RegisterDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const botPad = insets.bottom;
  const { t } = useI18n();

  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [uploaded, setUploaded] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [referralCode, setReferralCode] = useState('');

  // Driver-invites-driver referral program — the driver already has a JWT at this
  // signup step, so this is safe to call here. Hidden entirely if config.enabled is false.
  const { data: referralInfo } = useQuery({
    queryKey: ['driver-referral-info'],
    queryFn: endpoints.driver.referralProgram,
    retry: 1,
  });
  const referralEnabled = !!referralInfo?.config.enabled;
  const trimmedReferralCode = referralCode.trim();
  const referralCodeLooksOff = trimmedReferralCode.length > 0 && !trimmedReferralCode.toUpperCase().startsWith('VGD-');

  const allDone = MANDATORY_IDS.every(id => uploaded[id]);
  const doneCount = MANDATORY_IDS.filter(id => uploaded[id]).length;

  const captureDoc = async (slot: DocSlot) => {
    if (uploading[slot.id]) return;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setCameraBlocked(true);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: slot.id === 'profile_photo' ? [1, 1] : [4, 3],
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setPhotos(prev => ({ ...prev, [slot.id]: asset.uri }));
    setUploading(prev => ({ ...prev, [slot.id]: true }));
    setFailed(prev => ({ ...prev, [slot.id]: false }));
    setUploaded(prev => ({ ...prev, [slot.id]: false }));

    try {
      // Step 1: compress on-device, then upload to storage → get hosted URL
      const compressed = await compressImage(asset.uri, slot.backendType);
      const formData = new FormData();
      formData.append('file', {
        uri: compressed.uri,
        type: compressed.mimeType,
        name: compressed.fileName,
      } as unknown as Blob);
      const { fileUrl } = await endpoints.driver.uploadFile(formData);

      // Step 2: store the URL locally — will be submitted in register-complete
      signupStore.addDocument({ type: slot.backendType, fileUrl, mimeType: 'image/jpeg' });

      setUploaded(prev => ({ ...prev, [slot.id]: true }));
    } catch (err) {
      console.error('[register-documents] upload failed for', slot.backendType, err);
      setFailed(prev => ({ ...prev, [slot.id]: true }));
    } finally {
      setUploading(prev => ({ ...prev, [slot.id]: false }));
    }
  };

  const handleSubmit = async () => {
    if (!allDone || submitting) return;
    setSubmitting(true);
    try {
      const data = signupStore.getAll();
      await endpoints.registration.complete({
        documents: data.documents,
        ...(trimmedReferralCode ? { referralCode: trimmedReferralCode } : {}),
      });
      signupStore.reset();
      router.replace('/pending-approval');
    } catch (err) {
      let msg = 'Failed to submit registration. Please try again.';
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        if (body?.error) msg = body.error;
      }
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (cameraBlocked) {
    return (
      <View style={[s.root, s.blockedRoot, { backgroundColor: '#fafafd' }]}>
        <View style={s.blockedCard}>
          <View style={s.blockedIconBox}>
            <Camera size={36} color="#5e5e72" strokeWidth={1.5} />
          </View>
          <Text style={s.blockedTitle}>{t.camera_required}</Text>
          <Text style={s.blockedSub}>{t.camera_required_sub}</Text>
          <TouchableOpacity
            style={s.settingsBtn}
            onPress={() => Linking.openSettings()}
            activeOpacity={0.85}
          >
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

  return (
    <View style={[s.root, { backgroundColor: '#fafafd' }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 20, paddingBottom: botPad + 120, paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Text style={s.step}>Step 4 of 4</Text>
          <Text style={s.title}>Upload your{'\n'}documents</Text>
          <Text style={s.sub}>
            Upload all required documents to complete your registration. Your account will be reviewed by our team.
          </Text>
        </View>

        <View style={s.progress}>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${(doneCount / ALL_IDS.length) * 100}%` }]} />
          </View>
          <Text style={s.progressText}>{doneCount} / {MANDATORY_IDS.length} required uploaded</Text>
        </View>

        <View style={s.sections}>
          {SECTIONS.map((section) => (
            <View key={section.title} style={s.section}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.sectionTitle}>{section.title}</Text>
                {section.optional && (
                  <View style={s.optionalBadge}><Text style={s.optionalBadgeText}>Optional</Text></View>
                )}
              </View>
              <View style={s.slotsRow}>
                {section.slots.map((slot) => {
                  const uri = photos[slot.id];
                  const isUploading = uploading[slot.id];
                  const isUploaded = uploaded[slot.id];
                  const isFailed = failed[slot.id];
                  const Icon = slot.icon;
                  const isSingle = section.slots.length === 1;

                  return (
                    <TouchableOpacity
                      key={slot.id}
                      style={[
                        s.slot,
                        isSingle && s.slotFull,
                        isUploaded && s.slotDone,
                        isFailed && s.slotFailed,
                      ]}
                      onPress={() => captureDoc(slot)}
                      activeOpacity={0.85}
                      disabled={isUploading}
                    >
                      {uri ? (
                        <>
                          <Image
                            source={{ uri }}
                            style={[s.slotImg, isSingle && s.slotImgFull]}
                          />
                          <View style={[
                            s.slotBadge,
                            isUploading && { backgroundColor: '#5e5e72' },
                            isFailed && { backgroundColor: '#c0392b' },
                            isUploaded && { backgroundColor: '#27ae60' },
                          ]}>
                            {isUploading ? (
                              <ActivityIndicator size="small" color="white" />
                            ) : isFailed ? (
                              <AlertCircle size={16} color="white" />
                            ) : (
                              <CheckCircle2 size={16} color="white" />
                            )}
                          </View>
                          {!isUploading && (
                            <TouchableOpacity style={s.retakeBtn} onPress={() => captureDoc(slot)} activeOpacity={0.8}>
                              <Camera size={11} color="#1e1e28" />
                              <Text style={s.retakeText}>{isFailed ? 'Retry' : 'Retake'}</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      ) : (
                        <View style={s.slotEmpty}>
                          <View style={s.slotIconBox}>
                            <Icon size={22} color="#5e5e72" />
                          </View>
                          <Text style={s.slotLabel}>{slot.label}</Text>
                          <Text style={s.slotHint}>{slot.hint}</Text>
                          <View style={s.cameraBtn}>
                            <Camera size={13} color="white" />
                            <Text style={s.cameraBtnText}>Take photo</Text>
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {!allDone && (
          <View style={s.noteBox}>
            <AlertCircle size={15} color="#5e5e72" />
            <Text style={s.noteText}>
              All {MANDATORY_IDS.length} required documents must be uploaded. Criminal record is optional — you can upload it later, but it will be required after 30 trips.
            </Text>
          </View>
        )}

        {referralEnabled && (
          <View style={s.referralSection}>
            <Text style={s.referralLabel}>{t.signup_referral_label}</Text>
            <TextInput
              value={referralCode}
              onChangeText={setReferralCode}
              placeholder={t.signup_referral_placeholder}
              placeholderTextColor="#9c9ca8"
              style={s.referralInput}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={16}
            />
            {referralCodeLooksOff && (
              <Text style={s.referralHint}>{t.signup_referral_format_hint}</Text>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: botPad + 20 }]}>
        <TouchableOpacity
          style={[s.submitBtn, (!allDone || submitting) && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!allDone || submitting}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Text style={s.submitBtnText}>
                {allDone
                  ? 'Submit for review'
                  : `${ALL_IDS.length - doneCount} document${ALL_IDS.length - doneCount !== 1 ? 's' : ''} remaining`}
              </Text>
              {allDone && <ArrowRight size={18} color="white" strokeWidth={2} />}
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
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
  header: { marginBottom: 20, gap: 8 },
  step: { fontSize: 12, fontWeight: '600', color: '#5e5e72', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Inter_600SemiBold' },
  title: { fontSize: 34, fontWeight: '700', color: '#1e1e28', letterSpacing: -1.2, lineHeight: 40, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 14, color: '#5e5e72', lineHeight: 20, fontFamily: 'Inter_400Regular' },
  progress: { marginBottom: 24, gap: 8 },
  progressBar: { height: 4, backgroundColor: '#e8e8ee', borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#55c49a', borderRadius: 99 },
  progressText: { fontSize: 12, color: '#5e5e72', fontFamily: 'Inter_500Medium' },
  sections: { gap: 24 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#1e1e28', letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Inter_700Bold' },
  optionalBadge: { backgroundColor: '#f2f2f5', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  optionalBadgeText: { fontSize: 10, color: '#5e5e72', fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  slotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: {
    width: '47.5%', aspectRatio: 4 / 3,
    backgroundColor: 'white', borderRadius: 18,
    borderWidth: 1.5, borderColor: '#e5e5ea', borderStyle: 'dashed',
    overflow: 'hidden', position: 'relative',
  },
  slotFull: { width: '100%' },
  slotDone: { borderStyle: 'solid', borderColor: '#27ae60' },
  slotFailed: { borderStyle: 'solid', borderColor: '#c0392b' },
  slotImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  slotImgFull: { height: 160 },
  slotBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#27ae60',
    alignItems: 'center', justifyContent: 'center',
  },
  retakeBtn: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 99,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#e5e5ea',
  },
  retakeText: { fontSize: 10, fontWeight: '600', color: '#1e1e28' },
  slotEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 12 },
  slotIconBox: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#f2f2f5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  slotLabel: { fontSize: 12, fontWeight: '700', color: '#1e1e28', textAlign: 'center', fontFamily: 'Inter_700Bold' },
  slotHint: { fontSize: 10, color: '#5e5e72', textAlign: 'center', lineHeight: 14 },
  cameraBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#1e1e28', borderRadius: 99,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 6,
  },
  cameraBtnText: { fontSize: 10, fontWeight: '600', color: 'white' },
  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#f2f2f5', borderRadius: 14, padding: 14, marginTop: 16,
  },
  noteText: { flex: 1, fontSize: 12, color: '#5e5e72', lineHeight: 18, fontFamily: 'Inter_400Regular' },
  referralSection: { marginTop: 20 },
  referralLabel: { fontSize: 13, fontWeight: '600', color: '#1e1e28', fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  referralInput: {
    height: 52, borderRadius: 14, paddingHorizontal: 16,
    backgroundColor: 'white', borderWidth: 1.5, borderColor: '#e5e5ea',
    fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#1e1e28',
  },
  referralHint: { fontSize: 11, color: '#c2410c', marginTop: 6, fontFamily: 'Inter_400Regular' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 24, paddingTop: 16,
    backgroundColor: 'rgba(250,250,253,0.95)',
    borderTopWidth: 1, borderTopColor: '#e5e5ea',
  },
  submitBtn: {
    height: 56, borderRadius: 20, backgroundColor: '#55c49a',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#55c49a', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '600', fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
});
