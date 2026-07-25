import { Image } from 'expo-image';
import {
  AlertCircle, Camera, CheckCircle2, Clock, ImageIcon, Shield,
} from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

// Extracted verbatim from app/documents.tsx — pure presentational document
// card and its status badge. No behavior change.

export type DocRecord = {
  id: string;
  type: string;
  fileUrl: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  adminNotes?: string | null;
  uploadedAt: string;
};

const CRIMINAL_REQUIRED_AT = 30;

function getBorderColor(
  status: 'pending' | 'approved' | 'rejected' | null,
  urgent: boolean,
  colors: ReturnType<typeof useColors>,
): string {
  if (status === 'approved') return '#86efac';
  if (status === 'rejected' || urgent) return '#fca5a5';
  if (status === 'pending') return '#fde68a';
  return colors.border;
}

export function StatusBadge({
  status, isCriminalUrgent, t,
}: {
  status: 'pending' | 'approved' | 'rejected' | null;
  isCriminalUrgent: boolean;
  t: ReturnType<typeof useI18n>['t'];
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

export function DocCard({
  docType, label, record, trips, isUploading, onUpload, colors, t, isRTL, R, TA,
}: {
  docType: string;
  label: string;
  record: DocRecord | null;
  trips: number;
  isUploading: boolean;
  onUpload: () => void;
  colors: ReturnType<typeof useColors>;
  t: ReturnType<typeof useI18n>['t'];
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

const styles = StyleSheet.create({
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
  graceWrap: {
    borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: Spacing.md, paddingTop: 10, gap: 6,
  },
  graceBar: { height: 5, borderRadius: 4, overflow: 'hidden' },
  graceFill: { height: 5, borderRadius: 4 },
  graceText: { fontSize: 11 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: 99,
  },
  badgeText: { fontSize: 10, letterSpacing: 0.3 },
});
