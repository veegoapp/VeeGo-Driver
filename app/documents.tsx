import { CheckCircle2, Camera, CreditCard, Car, FileText, Info, Award, Shield, AlertCircle, Clock, ArrowLeft } from 'lucide-react-native';

const DOC_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  card: CreditCard,
  filetext: FileText,
  award: Award,
  car: Car,
  shield: Shield,
};
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { useI18n } from '@/lib/i18nContext';
import { useColors } from '@/hooks/useColors';

type DocSlot = {
  id: string;
  label: string;
  hint: string;
  required: boolean;
  icon: string;
};

type ApiDocument = {
  id: string;
  title: string;
  status: 'verified' | 'approved' | 'pending' | 'expiring' | 'expired' | 'rejected';
  expires?: string;
};

const MANDATORY_IDS = ['id_front', 'id_back', 'vlic_front', 'vlic_back', 'dlic_front', 'dlic_back', 'car_front', 'car_back', 'car_left', 'car_right'];

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const colors = useColors();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const queryClient = useQueryClient();

  const SECTIONS: { title: string; slots: DocSlot[] }[] = [
    {
      title: t.doc_national_id,
      slots: [
        { id: 'id_front', label: t.doc_front_side, hint: t.doc_front_hint, required: true, icon: 'card' },
        { id: 'id_back', label: t.doc_back_side, hint: t.doc_back_hint, required: true, icon: 'card' },
      ],
    },
    {
      title: t.doc_vehicle_license,
      slots: [
        { id: 'vlic_front', label: t.doc_front_side, hint: t.doc_lic_front_hint, required: true, icon: 'filetext' },
        { id: 'vlic_back', label: t.doc_back_side, hint: t.doc_lic_back_hint, required: true, icon: 'filetext' },
      ],
    },
    {
      title: t.doc_driving_license,
      slots: [
        { id: 'dlic_front', label: t.doc_front_side, hint: t.doc_lic_front_hint, required: true, icon: 'award' },
        { id: 'dlic_back', label: t.doc_back_side, hint: t.doc_lic_back_hint, required: true, icon: 'award' },
      ],
    },
    {
      title: t.doc_vehicle_photos,
      slots: [
        { id: 'car_front', label: t.doc_front_view, hint: t.doc_front_view_hint, required: true, icon: 'car' },
        { id: 'car_back', label: t.doc_back_view, hint: t.doc_back_view_hint, required: true, icon: 'car' },
        { id: 'car_left', label: t.doc_left_side, hint: t.doc_left_hint, required: true, icon: 'car' },
        { id: 'car_right', label: t.doc_right_side, hint: t.doc_right_hint, required: true, icon: 'car' },
      ],
    },
    {
      title: t.doc_criminal_record,
      slots: [
        { id: 'criminal', label: t.doc_criminal_label, hint: t.doc_criminal_hint, required: false, icon: 'shield' },
      ],
    },
  ];

  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const { data: apiDocs, isLoading, error } = useQuery<ApiDocument[]>({
    queryKey: ['documents'],
    queryFn: () => endpoints.driver.documents() as Promise<ApiDocument[]>,
  });

  const apiStatusMap: Record<string, ApiDocument> = {};
  if (Array.isArray(apiDocs)) {
    for (const doc of apiDocs) {
      apiStatusMap[doc.id] = doc;
    }
  }

  const captureDoc = async (slot: DocSlot) => {
    const apiDoc = apiStatusMap[slot.id];
    const isApproved = apiDoc?.status === 'verified' || apiDoc?.status === 'approved';
    if (isApproved) return;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    let result: ImagePicker.ImagePickerResult;
    if (status === 'granted') {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [4, 3],
      });
    } else {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (lib.status !== 'granted') {
        Alert.alert(t.doc_permission_title, t.doc_permission_msg);
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [4, 3],
      });
    }
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhotos(prev => ({ ...prev, [slot.id]: asset.uri }));
      setUploading(prev => ({ ...prev, [slot.id]: true }));
      try {
        const formData = new FormData();
        formData.append('file', { uri: asset.uri, type: 'image/jpeg', name: `${slot.id}.jpg` } as unknown as Blob);
        const { fileUrl } = await endpoints.driver.uploadFile(formData);
        await endpoints.driver.registerDocument(slot.id, fileUrl);
        await queryClient.invalidateQueries({ queryKey: ['documents'] });
      } catch {
        // best-effort: local preview stays, upload can be retried
      } finally {
        setUploading(prev => ({ ...prev, [slot.id]: false }));
      }
    }
  };

  const slotDone = (slot: DocSlot) => {
    if (photos[slot.id]) return true;
    const status = apiStatusMap[slot.id]?.status;
    return status === 'verified' || status === 'approved';
  };
  const totalDone = SECTIONS.flatMap(s => s.slots).filter(sl => slotDone(sl)).length;
  const totalSlots = SECTIONS.flatMap(s => s.slots).length;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: 40, paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]} activeOpacity={0.7}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </TouchableOpacity>

        <View style={s.header}>
          <Text style={[s.title, { color: colors.foreground }]}>{t.docs_profile_title}</Text>
          <Text style={[s.sub, { color: colors.mutedForeground }]}>{t.docs_profile_sub}</Text>
        </View>

        {isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <ActivityIndicator color="#1e1e28" />
            <Text style={[s.sub, { marginTop: 8, textAlign: 'center' }]}>{t.docs_loading}</Text>
          </View>
        ) : error ? (
          <View style={[s.noteBox, { backgroundColor: '#fff0f0' }]}>
            <AlertCircle size={16} color="#c0392b" />
            <Text style={[s.noteText, { color: '#c0392b' }]}>{t.docs_load_error}</Text>
          </View>
        ) : null}

        <View style={s.progress}>
          <View style={[s.progressBar, { backgroundColor: colors.secondary }]}>
            <View style={[s.progressFill, { width: `${(totalDone / totalSlots) * 100}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={[s.progressText, { color: colors.mutedForeground }]}>{t.docs_progress.replace('{done}', String(totalDone)).replace('{total}', String(totalSlots))}</Text>
        </View>

        <View style={s.sections}>
          {SECTIONS.map((section) => (
            <View key={section.title} style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
              <View style={s.slotsRow}>
                {section.slots.map((slot) => {
                  const uri = photos[slot.id];
                  const apiDoc = apiStatusMap[slot.id];
                  const isUploading = uploading[slot.id];
                  const docStatus = apiDoc?.status;
                  const isVerified = docStatus === 'verified' || docStatus === 'approved';
                  const isExpiring = docStatus === 'expiring';
                  const isPending = docStatus === 'pending';
                  const isRejected = docStatus === 'rejected';
                  const isExpired = docStatus === 'expired';

                  return (
                    <TouchableOpacity
                      key={slot.id}
                      style={[
                        s.slot,
                        (uri || isVerified) && s.slotDone,
                        isExpiring && s.slotExpiring,
                        (isRejected || isExpired) && s.slotRejected,
                        section.slots.length === 1 && s.slotFull,
                      ]}
                      onPress={() => !isVerified ? captureDoc(slot) : undefined}
                      activeOpacity={isVerified ? 1 : 0.85}
                    >
                      {uri ? (
                        <>
                          <Image source={{ uri }} style={[s.slotImg, section.slots.length === 1 && s.slotImgFull]} />
                          {isUploading ? (
                            <View style={s.slotDoneBadge}>
                              <ActivityIndicator size="small" color="white" />
                            </View>
                          ) : (
                            <View style={s.slotDoneBadge}>
                              <CheckCircle2 size={20} color="white" />
                            </View>
                          )}
                          <TouchableOpacity style={s.slotRetake} onPress={() => captureDoc(slot)} activeOpacity={0.8}>
                            <Camera size={12} color="#1e1e28" />
                            <Text style={s.slotRetakeText}>{t.doc_retake_photo}</Text>
                          </TouchableOpacity>
                        </>
                      ) : isVerified ? (
                        <View style={s.slotEmpty}>
                          <View style={[s.slotIconBox, { backgroundColor: '#e6f9f0' }]}>
                            <CheckCircle2 size={22} color="#27ae60" />
                          </View>
                          <Text style={s.slotLabel}>{slot.label}</Text>
                          <View style={[s.statusBadge, { backgroundColor: '#e6f9f0' }]}>
                            <CheckCircle2 size={10} color="#27ae60" />
                            <Text style={[s.statusText, { color: '#27ae60' }]}>{docStatus === 'approved' ? t.doc_status_approved : t.doc_status_verified_badge}</Text>
                          </View>
                          {apiDoc?.expires && (
                            <Text style={[s.slotHint, { marginTop: 2 }]}>{t.doc_expires_label}: {apiDoc.expires}</Text>
                          )}
                        </View>
                      ) : isExpiring ? (
                        <View style={s.slotEmpty}>
                          <View style={[s.slotIconBox, { backgroundColor: '#fff3e0' }]}>
                            <Clock size={22} color="#e67e22" />
                          </View>
                          <Text style={s.slotLabel}>{slot.label}</Text>
                          <View style={[s.statusBadge, { backgroundColor: '#fff3e0' }]}>
                            <Clock size={10} color="#e67e22" />
                            <Text style={[s.statusText, { color: '#e67e22' }]}>{t.doc_status_expiring}</Text>
                          </View>
                          {apiDoc?.expires && (
                            <Text style={[s.slotHint, { marginTop: 2 }]}>{t.doc_expires_label}: {apiDoc.expires}</Text>
                          )}
                          <View style={s.cameraBtn}>
                            <Camera size={14} color="white" />
                            <Text style={s.cameraBtnText}>{t.doc_renew}</Text>
                          </View>
                        </View>
                      ) : isRejected ? (
                        <View style={s.slotEmpty}>
                          <View style={[s.slotIconBox, { backgroundColor: '#fdecea' }]}>
                            <AlertCircle size={22} color="#c0392b" />
                          </View>
                          <Text style={s.slotLabel}>{slot.label}</Text>
                          <View style={[s.statusBadge, { backgroundColor: '#fdecea' }]}>
                            <AlertCircle size={10} color="#c0392b" />
                            <Text style={[s.statusText, { color: '#c0392b' }]}>{t.doc_status_rejected}</Text>
                          </View>
                          <View style={s.cameraBtn}>
                            <Camera size={14} color="white" />
                            <Text style={s.cameraBtnText}>{t.doc_reupload}</Text>
                          </View>
                        </View>
                      ) : isExpired ? (
                        <View style={s.slotEmpty}>
                          <View style={[s.slotIconBox, { backgroundColor: '#fdecea' }]}>
                            <AlertCircle size={22} color="#c0392b" />
                          </View>
                          <Text style={s.slotLabel}>{slot.label}</Text>
                          <View style={[s.statusBadge, { backgroundColor: '#fdecea' }]}>
                            <AlertCircle size={10} color="#c0392b" />
                            <Text style={[s.statusText, { color: '#c0392b' }]}>{t.doc_status_expired}</Text>
                          </View>
                          {apiDoc?.expires && (
                            <Text style={[s.slotHint, { marginTop: 2 }]}>{t.doc_expires_label}: {apiDoc.expires}</Text>
                          )}
                          <View style={s.cameraBtn}>
                            <Camera size={14} color="white" />
                            <Text style={s.cameraBtnText}>{t.doc_reupload}</Text>
                          </View>
                        </View>
                      ) : isPending ? (
                        <View style={s.slotEmpty}>
                          <View style={[s.slotIconBox, { backgroundColor: '#f2f2f5' }]}>
                            <Clock size={22} color="#5e5e72" />
                          </View>
                          <Text style={s.slotLabel}>{slot.label}</Text>
                          <View style={[s.statusBadge, { backgroundColor: '#f2f2f5' }]}>
                            <Clock size={10} color="#5e5e72" />
                            <Text style={[s.statusText, { color: '#5e5e72' }]}>{t.doc_status_under_review}</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={s.slotEmpty}>
                          <View style={s.slotIconBox}>
                            {(() => { const Icon = DOC_ICONS[slot.icon] ?? FileText; return <Icon size={22} color="#5e5e72" />; })()}
                          </View>
                          <Text style={s.slotLabel}>{slot.label}</Text>
                          <Text style={s.slotHint}>{slot.hint}</Text>
                          {!slot.required && (
                            <View style={s.optionalBadge}>
                              <Text style={s.optionalText}>{t.doc_optional_badge}</Text>
                            </View>
                          )}
                          <View style={s.cameraBtn}>
                            <Camera size={14} color="white" />
                            <Text style={s.cameraBtnText}>{t.doc_take_photo}</Text>
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

        <View style={s.noteBox}>
          <Info size={16} color="#5e5e72" />
          <Text style={s.noteText}>{t.doc_criminal_required_note}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  header: { marginTop: 20, marginBottom: 20, gap: 8 },
  step: { fontSize: 12, fontWeight: '600', color: '#5e5e72', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Inter_600SemiBold' },
  title: { fontSize: 34, fontWeight: '700', color: '#1e1e28', letterSpacing: -1.2, lineHeight: 40, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 14, color: '#5e5e72', lineHeight: 20, fontFamily: 'Inter_400Regular' },
  progress: { marginBottom: 24, gap: 8 },
  progressBar: { height: 4, backgroundColor: '#e8e8ee', borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#1e1e28', borderRadius: 99 },
  progressText: { fontSize: 12, color: '#5e5e72', fontFamily: 'Inter_500Medium' },
  sections: { gap: 24 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1e1e28', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Inter_700Bold' },
  slotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: {
    width: '47.5%', aspectRatio: 4 / 3,
    backgroundColor: 'white', borderRadius: 18,
    borderWidth: 1.5, borderColor: '#e5e5ea', borderStyle: 'dashed',
    overflow: 'hidden',
    position: 'relative',
  },
  slotFull: { width: '100%' },
  slotDone: { borderStyle: 'solid', borderColor: '#1e1e28' },
  slotExpiring: { borderStyle: 'solid', borderColor: '#e67e22' },
  slotRejected: { borderStyle: 'solid', borderColor: '#c0392b' },
  slotImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  slotImgFull: { height: 160 },
  slotDoneBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#1e1e28',
    alignItems: 'center', justifyContent: 'center',
  },
  slotRetake: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 99,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#e5e5ea',
  },
  slotRetakeText: { fontSize: 10, fontWeight: '600', color: '#1e1e28' },
  slotEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 12 },
  slotIconBox: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#f2f2f5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  slotLabel: { fontSize: 12, fontWeight: '700', color: '#1e1e28', textAlign: 'center', fontFamily: 'Inter_700Bold' },
  slotHint: { fontSize: 10, color: '#5e5e72', textAlign: 'center', lineHeight: 14 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3,
  },
  statusText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  optionalBadge: {
    backgroundColor: 'rgba(30,30,40,0.07)', borderRadius: 99,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  optionalText: { fontSize: 9, fontWeight: '700', color: '#1e1e28', letterSpacing: 0.5 },
  cameraBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#1e1e28', borderRadius: 99,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 4,
  },
  cameraBtnText: { fontSize: 10, fontWeight: '600', color: 'white' },
  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#f2f2f5', borderRadius: 14, padding: 14, marginTop: 16,
  },
  noteText: { flex: 1, fontSize: 12, color: '#5e5e72', lineHeight: 18, fontFamily: 'Inter_400Regular' },
});
