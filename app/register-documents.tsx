import {
  CheckCircle2, Camera, CreditCard, Car, FileText,
  Award, AlertCircle, ArrowRight, User, Settings,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

type DocSlot = {
  id: string;
  backendType: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size: number; color: string }>;
};

const SECTIONS: { title: string; slots: DocSlot[] }[] = [
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
    title: 'Profile Photo',
    slots: [
      { id: 'profile_photo', backendType: 'profile_photo', label: 'Profile photo', hint: 'Clear face photo', icon: User },
    ],
  },
];

const ALL_IDS = SECTIONS.flatMap(s => s.slots.map(sl => sl.id));

export default function RegisterDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useI18n();

  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [uploaded, setUploaded] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);

  const allDone = ALL_IDS.every(id => uploaded[id]);
  const doneCount = ALL_IDS.filter(id => uploaded[id]).length;

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
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: 'image/jpeg',
        name: `${slot.backendType}.jpg`,
      } as unknown as Blob);
      formData.append('type', slot.backendType);
      await endpoints.driver.uploadDocument(formData);
      setUploaded(prev => ({ ...prev, [slot.id]: true }));
    } catch {
      setFailed(prev => ({ ...prev, [slot.id]: true }));
    } finally {
      setUploading(prev => ({ ...prev, [slot.id]: false }));
    }
  };

  const handleSubmit = async () => {
    if (!allDone || submitting) return;
    setSubmitting(true);
    router.replace('/pending-approval');
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
          <Text style={s.step}>Step 3 of 3</Text>
          <Text style={s.title}>Upload your{'\n'}documents</Text>
          <Text style={s.sub}>
            Upload all required documents to complete your registration. Your account will be reviewed by our team.
          </Text>
        </View>

        <View style={s.progress}>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${(doneCount / ALL_IDS.length) * 100}%` }]} />
          </View>
          <Text style={s.progressText}>{doneCount} / {ALL_IDS.length} uploaded</Text>
        </View>

        <View style={s.sections}>
          {SECTIONS.map((section) => (
            <View key={section.title} style={s.section}>
              <Text style={s.sectionTitle}>{section.title}</Text>
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
              All {ALL_IDS.length} documents are required to complete registration. Upload each one then tap Submit.
            </Text>
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
  progressFill: { height: '100%', backgroundColor: '#3D52D5', borderRadius: 99 },
  progressText: { fontSize: 12, color: '#5e5e72', fontFamily: 'Inter_500Medium' },
  sections: { gap: 24 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#1e1e28', letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Inter_700Bold' },
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
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 24, paddingTop: 16,
    backgroundColor: 'rgba(250,250,253,0.95)',
    borderTopWidth: 1, borderTopColor: '#e5e5ea',
  },
  submitBtn: {
    height: 56, borderRadius: 20, backgroundColor: '#3D52D5',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#3D52D5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '600', fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
});
