import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import {
  AlertCircle, ArrowLeft,
} from 'lucide-react-native';
import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import { rtlIconStyle } from '@/lib/rtlUtils';
import { endpoints } from '@/lib/api';
import type { DriverProfileEnriched } from '@/lib/api';
import { compressImage } from '@/lib/imageCompression';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { DocCard, type DocRecord } from '@/components/DocCard';

// ─── Static config ────────────────────────────────────────────────────────────

const HIDDEN_TYPES = new Set(['trip_selfie']);

const SECTIONS: { sectionKey: 'identity' | 'vehicle' | 'other'; types: string[] }[] = [
  {
    sectionKey: 'identity',
    types: ['national_id_front', 'national_id_back', 'driving_license_front', 'driving_license_back'],
  },
  {
    sectionKey: 'vehicle',
    types: ['vehicle_license_front', 'vehicle_license_back', 'vehicle_photo'],
  },
  {
    sectionKey: 'other',
    types: ['profile_photo', 'criminal_record'],
  },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DocumentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();
  const queryClient = useQueryClient();

  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  // ── uploading state per doc type ─────────────────────────────────────────
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, ok });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  // ── Queries ──────────────────────────────────────────────────────────────
  const {
    data: rawDocs,
    isLoading: docsLoading,
    isError: docsError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['documents'],
    queryFn: () => endpoints.driver.documents(),
  });

  const { data: profile } = useQuery<DriverProfileEnriched>({
    queryKey: ['driver', 'profile'],
    queryFn: endpoints.driver.profile,
    retry: 1,
  });
  const trips = profile?.trips ?? 0;

  // ── Normalize API response (may be bare array or { data: [...] }) ────────
  const allDocs: DocRecord[] = useMemo(() => {
    if (Array.isArray(rawDocs)) return rawDocs as DocRecord[];
    const wrapped = rawDocs as { data?: DocRecord[] } | null;
    if (Array.isArray(wrapped?.data)) return wrapped!.data;
    return [];
  }, [rawDocs]);

  // ── Group by type: keep only the latest upload per type ──────────────────
  const latestByType = useMemo(() => {
    const map = new Map<string, DocRecord>();
    for (const doc of allDocs) {
      if (HIDDEN_TYPES.has(doc.type)) continue;
      const existing = map.get(doc.type);
      if (!existing || doc.uploadedAt > existing.uploadedAt) {
        map.set(doc.type, doc);
      }
    }
    return map;
  }, [allDocs]);

  // ── Upload flow ──────────────────────────────────────────────────────────
  const uploadDoc = async (docType: string, asset: ImagePicker.ImagePickerAsset) => {
    setUploading(prev => ({ ...prev, [docType]: true }));
    try {
      const compressed = await compressImage(asset.uri, docType);
      const formData = new FormData();
      formData.append('file', {
        uri: compressed.uri,
        name: compressed.fileName,
        type: compressed.mimeType,
      } as unknown as Blob);
      const { fileUrl } = await endpoints.driver.uploadFile(formData);
      await endpoints.driver.registerDocument(docType, fileUrl, compressed.mimeType);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      showToast(t.doc_upload_success, true);
    } catch {
      showToast(t.doc_upload_error, false);
    } finally {
      setUploading(prev => ({ ...prev, [docType]: false }));
    }
  };

  const pickAndUpload = async (docType: string, source: 'camera' | 'gallery') => {
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t.doc_permission_title, t.doc_permission_msg);
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [4, 3],
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t.doc_permission_title, t.doc_permission_msg);
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [4, 3],
      });
    }
    if (!result.canceled && result.assets[0]) {
      await uploadDoc(docType, result.assets[0]);
    }
  };

  const handleUploadPress = (docType: string) => {
    Alert.alert(t.doc_upload_btn, undefined, [
      { text: t.doc_take_photo, onPress: () => pickAndUpload(docType, 'camera') },
      { text: t.doc_choose_gallery, onPress: () => pickAndUpload(docType, 'gallery') },
      { text: t.cancel, style: 'cancel' },
    ]);
  };

  // ── Type → label ─────────────────────────────────────────────────────────
  const typeLabel = (type: string): string => ({
    national_id_front: t.doc_type_national_id_front,
    national_id_back: t.doc_type_national_id_back,
    driving_license_front: t.doc_type_driving_license_front,
    driving_license_back: t.doc_type_driving_license_back,
    vehicle_license_front: t.doc_type_vehicle_license_front,
    vehicle_license_back: t.doc_type_vehicle_license_back,
    vehicle_photo: t.doc_type_vehicle_photo,
    profile_photo: t.doc_type_profile_photo,
    criminal_record: t.doc_criminal_record,
  }[type] ?? type);

  const sectionLabel = (key: 'identity' | 'vehicle' | 'other'): string => ({
    identity: t.doc_section_identity,
    vehicle: t.doc_section_vehicle,
    other: t.doc_section_other,
  }[key]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toast && (
        <View
          style={[
            styles.toast,
            { backgroundColor: toast.ok ? '#16a34a' : '#dc2626', top: topPad + 12 },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
      >
        {/* Back */}
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} style={rtlIconStyle(isRTL)} />
        </Pressable>

        {/* Title */}
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
          {t.docs_profile_title}
        </Text>
        <Text style={[styles.pageSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
          {t.docs_profile_sub}
        </Text>

        {/* Loading */}
        {docsLoading && (
          <View style={styles.center}>
            <AppLoader />
          </View>
        )}

        {/* Error */}
        {docsError && !docsLoading && (
          <View style={[styles.errorBox, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
            <AlertCircle size={16} color="#dc2626" strokeWidth={2} />
            <Text style={[styles.errorText, { fontFamily: 'Inter_400Regular' }]}>{t.docs_load_error}</Text>
          </View>
        )}

        {/* Sections */}
        {!docsLoading && (
          <View style={styles.sections}>
            {SECTIONS.map(({ sectionKey, types }) => (
              <View key={sectionKey} style={styles.section}>
                <Text style={[styles.sectionHeader, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
                  {sectionLabel(sectionKey)}
                </Text>
                <View style={styles.cards}>
                  {types.map(docType => (
                    <DocCard
                      key={docType}
                      docType={docType}
                      label={typeLabel(docType)}
                      record={latestByType.get(docType) ?? null}
                      trips={trips}
                      isUploading={!!uploading[docType]}
                      onUpload={() => handleUploadPress(docType)}
                      colors={colors}
                      t={t}
                      isRTL={isRTL}
                      R={R}
                      TA={TA}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  pageTitle: { fontSize: 24, marginTop: Spacing.xl },
  pageSub: { fontSize: 13, marginTop: Spacing.xs, marginBottom: Spacing.xl, lineHeight: 20 },
  center: { alignItems: 'center', paddingVertical: 40 },
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    borderWidth: 1, borderRadius: Radius.md, padding: 14, marginBottom: Spacing.lg,
  },
  errorText: { flex: 1, fontSize: 13, color: '#dc2626', lineHeight: 18 },
  sections: { gap: Spacing.xl },
  section: { gap: 10 },
  sectionHeader: {
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 2,
  },
  cards: { gap: 10 },

  // Toast
  toast: {
    position: 'absolute', left: 20, right: 20, zIndex: 100,
    borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  toastText: {
    color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center',
  },
});
