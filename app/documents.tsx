import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import {
  AlertCircle, ArrowLeft, Camera, CheckCircle2, Clock, ImageIcon, Shield, Upload,
} from 'lucide-react-native';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import type { DriverProfileEnriched } from '@/lib/api';
import { compressImage } from '@/lib/imageCompression';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

// ─── Types ───────────────────────────────────────────────────────────────────

type DocRecord = {
  id: string;
  type: string;
  fileUrl: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  adminNotes?: string | null;
  uploadedAt: string;
};

// ─── Static config ────────────────────────────────────────────────────────────

const CRIMINAL_REQUIRED_AT = 30;
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
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
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
            <ActivityIndicator size="large" color={colors.primary} />
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

// ─── DocCard ─────────────────────────────────────────────────────────────────

type Colors = ReturnType<typeof useColors>;
type T = ReturnType<typeof useI18n>['t'];

function DocCard({
  docType, label, record, trips, isUploading, onUpload, colors, t, isRTL, R, TA,
}: {
  docType: string;
  label: string;
  record: DocRecord | null;
  trips: number;
  isUploading: boolean;
  onUpload: () => void;
  colors: Colors;
  t: T;
  isRTL: boolean;
  R: 'row' | 'row-reverse';
  TA: 'left' | 'right';
}) {
  const isCriminal = docType === 'criminal_record';
  const status = record?.verificationStatus ?? null;

  const isLocked = status === 'approved' || status === 'pending';
  const isRejected = status === 'rejected';
  const isNotUploaded = record === null;
  const canUpload = !isLocked && (isRejected || isNotUploaded);

  // Criminal urgent: no record + trips >= CRIMINAL_REQUIRED_AT
  const isCriminalUrgent = isCriminal && isNotUploaded && trips >= CRIMINAL_REQUIRED_AT;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: getBorderColor(status, isCriminalUrgent, colors) }]}>
      <View style={[styles.cardInner, { flexDirection: R }]}>
        {/* Thumbnail / Placeholder — hidden for approved docs */}
        {status !== 'approved' && (
          <View style={[styles.thumbWrap, { backgroundColor: colors.secondary }]}>
            {record?.fileUrl && status === 'pending' ? (
              <Image source={{ uri: record.fileUrl }} style={styles.thumb} contentFit="cover" />
            ) : isCriminal ? (
              <Shield size={28} color={colors.mutedForeground} strokeWidth={1.5} />
            ) : (
              <ImageIcon size={28} color={colors.mutedForeground} strokeWidth={1.5} />
            )}
            {isUploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </View>
        )}

        {/* Content */}
        <View style={styles.cardContent}>
          {/* Name + Status Badge */}
          <View style={[styles.nameBadgeRow, { flexDirection: R }]}>
            <Text style={[styles.cardLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: TA }]} numberOfLines={2}>
              {label}
            </Text>
            <StatusBadge status={status} isCriminalUrgent={isCriminalUrgent} t={t} />
          </View>

          {/* Admin notes (rejected) */}
          {isRejected && record?.adminNotes ? (
            <Text style={[styles.adminNotes, { color: '#dc2626', fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={3}>
              {t.doc_admin_reason} {record.adminNotes}
            </Text>
          ) : null}

          {/* Criminal urgent warning */}
          {isCriminalUrgent && (
            <Text style={[styles.urgentText, { color: '#dc2626', fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
              {t.doc_criminal_urgent}
            </Text>
          )}

          {/* Not uploaded label */}
          {isNotUploaded && !isCriminal && (
            <Text style={[styles.notUploaded, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
              {t.doc_not_uploaded}
            </Text>
          )}

          {/* Upload / Update button */}
          {canUpload && (
            <Pressable
              onPress={onUpload}
              disabled={isUploading}
              style={({ pressed }) => [
                styles.uploadBtn,
                {
                  backgroundColor: isRejected ? '#dc2626' : colors.primary,
                  opacity: pressed || isUploading ? 0.7 : 1,
                  flexDirection: R,
                },
              ]}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Camera size={13} color="#fff" strokeWidth={2} />
                  <Text style={[styles.uploadBtnText, { fontFamily: 'Inter_600SemiBold' }]}>
                    {isRejected ? t.doc_update_btn : t.doc_upload_btn}
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>

      {/* Criminal grace period bar */}
      {isCriminal && !isLocked && (
        <View style={[styles.graceWrap, { borderTopColor: colors.border }]}>
          <View style={[styles.graceBar, { backgroundColor: colors.secondary }]}>
            <View
              style={[
                styles.graceFill,
                {
                  width: `${Math.min((trips / CRIMINAL_REQUIRED_AT) * 100, 100)}%` as `${number}%`,
                  backgroundColor: trips >= CRIMINAL_REQUIRED_AT ? '#dc2626' : colors.primary,
                },
              ]}
            />
          </View>
          <Text style={[styles.graceText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
            {t.doc_criminal_grace.replace('{current}', String(trips))}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({
  status, isCriminalUrgent, t,
}: {
  status: 'pending' | 'approved' | 'rejected' | null;
  isCriminalUrgent: boolean;
  t: T;
}) {
  if (status === 'approved') {
    return (
      <View style={[styles.badge, { backgroundColor: '#dcfce7' }]}>
        <CheckCircle2 size={10} color="#16a34a" strokeWidth={2} />
        <Text style={[styles.badgeText, { color: '#16a34a', fontFamily: 'Inter_700Bold' }]}>{t.doc_status_approved}</Text>
      </View>
    );
  }
  if (status === 'pending') {
    return (
      <View style={[styles.badge, { backgroundColor: '#fef9c3' }]}>
        <Clock size={10} color="#b45309" strokeWidth={2} />
        <Text style={[styles.badgeText, { color: '#b45309', fontFamily: 'Inter_700Bold' }]}>{t.doc_status_under_review}</Text>
      </View>
    );
  }
  if (status === 'rejected' || isCriminalUrgent) {
    return (
      <View style={[styles.badge, { backgroundColor: '#fee2e2' }]}>
        <AlertCircle size={10} color="#dc2626" strokeWidth={2} />
        <Text style={[styles.badgeText, { color: '#dc2626', fontFamily: 'Inter_700Bold' }]}>{t.doc_action_required}</Text>
      </View>
    );
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBorderColor(
  status: 'pending' | 'approved' | 'rejected' | null,
  urgent: boolean,
  colors: Colors,
): string {
  if (status === 'approved') return '#86efac';
  if (status === 'rejected' || urgent) return '#fca5a5';
  if (status === 'pending') return '#fde68a';
  return colors.border;
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

  // Card
  card: {
    borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden',
  },
  cardInner: {
    gap: Spacing.md, padding: 14, alignItems: 'center',
  },
  thumbWrap: {
    width: 72, height: 72, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
  },
  thumb: { width: 72, height: 72 },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardContent: { flex: 1, gap: 6 },
  nameBadgeRow: { alignItems: 'flex-start', gap: Spacing.sm, flexWrap: 'wrap' },
  cardLabel: { fontSize: Typography.size.sm, lineHeight: 20 },
  adminNotes: { fontSize: Typography.size.xs, lineHeight: 17 },
  urgentText: { fontSize: Typography.size.xs },
  notUploaded: { fontSize: Typography.size.xs },
  uploadBtn: {
    alignSelf: 'flex-start', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: 10,
  },
  uploadBtnText: { color: '#fff', fontSize: Typography.size.xs },

  // Grace period
  graceWrap: {
    borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: Spacing.md, paddingTop: 10, gap: 6,
  },
  graceBar: { height: 5, borderRadius: 4, overflow: 'hidden' },
  graceFill: { height: 5, borderRadius: 4 },
  graceText: { fontSize: 11 },

  // Badge
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: 99,
  },
  badgeText: { fontSize: 10, letterSpacing: 0.3 },

  // Toast
  toast: {
    position: 'absolute', left: 20, right: 20, zIndex: 100,
    borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  toastText: {
    color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center',
  },
});
