import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, Check, ChevronRight, MessageCircle, Phone, Search, Send, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { getToken, getUserIdFromToken } from '@/lib/auth';
import { compressImage } from '@/lib/imageCompression';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

type SupportCategory = 'payment' | 'safety' | 'quality' | 'refund' | 'lost_found' | 'other';
type TopicKey = 'payments' | 'account' | 'trip' | 'vehicle' | 'safety' | 'app';

type Attachment = { localId: string; uri: string; status: 'idle' | 'uploading' | 'done' | 'error' };

const MAX_ATTACHMENTS = 5;

export default function SupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();

  // Backend category enum doesn't map 1:1 to these topics — anything without a direct
  // match is filed as "other" (the driver's free-text message still carries the detail).
  const TOPIC_DEFS: { key: TopicKey; category: SupportCategory; label: string }[] = [
    { key: 'payments', category: 'payment', label: t.support_topic_payments },
    { key: 'account', category: 'other', label: t.support_topic_account },
    { key: 'trip', category: 'other', label: t.support_topic_trip },
    { key: 'vehicle', category: 'other', label: t.support_topic_vehicle },
    { key: 'safety', category: 'safety', label: t.support_topic_safety },
    { key: 'app', category: 'other', label: t.support_topic_app },
  ];
  const topPad = insets.top;

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const [selectedTopicKey, setSelectedTopicKey] = useState<TopicKey | null>(null);
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [failedAttachmentCount, setFailedAttachmentCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const selectedTopic = TOPIC_DEFS.find(d => d.key === selectedTopicKey) ?? null;
  const canSubmit = !!selectedTopic && description.trim().length > 0;

  const handleAddPhoto = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t.camera_required, t.camera_required_sub);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      setAttachments(prev => [...prev, { localId: `${Date.now()}-${prev.length}`, uri: result.assets[0].uri, status: 'idle' }]);
    }
  };

  const removeAttachment = (localId: string) => {
    setAttachments(prev => prev.filter(a => a.localId !== localId));
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedTopic || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const driverId = getUserIdFromToken(await getToken());
      const { id: ticketId } = await endpoints.support.submitTicket({
        subject: selectedTopic.label,
        message: description.trim(),
        type: 'driver',
        priority: 'medium',
        category: selectedTopic.category,
        driverId: driverId ?? '',
      });

      let failed = 0;
      for (const att of attachments) {
        setAttachments(prev => prev.map(a => a.localId === att.localId ? { ...a, status: 'uploading' } : a));
        try {
          const compressed = await compressImage(att.uri, 'attachment');
          const formData = new FormData();
          formData.append('file', { uri: compressed.uri, name: compressed.fileName, type: compressed.mimeType } as unknown as Blob);
          await endpoints.support.uploadAttachment(ticketId, formData);
          setAttachments(prev => prev.map(a => a.localId === att.localId ? { ...a, status: 'done' } : a));
        } catch {
          failed += 1;
          setAttachments(prev => prev.map(a => a.localId === att.localId ? { ...a, status: 'error' } : a));
        }
      }

      setFailedAttachmentCount(failed);
      setSubmitted(true);
      setSelectedTopicKey(null);
      setDescription('');
      setAttachments([]);
    } catch {
      Alert.alert(t.error, t.support_err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.how_can_we_help}</Text>

        <GlassView style={[styles.searchBar, { flexDirection: R }]} borderRadius={16}>
          <Search size={16} color={colors.mutedForeground} strokeWidth={2} />
          <TextInput
            placeholder={t.search_help}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Inter_400Regular', textAlign: TA }]}
          />
        </GlassView>

        <View style={[styles.contactGrid, { flexDirection: R }]}>
          <Pressable onPress={() => Alert.alert(t.coming_soon_badge)} style={({ pressed }) => [{ flex: 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
            <GlassView style={styles.contactCard} borderRadius={20}>
              <View style={[styles.contactIcon, { backgroundColor: colors.primary + '26' }]}>
                <MessageCircle size={20} color={colors.primary} strokeWidth={2} />
              </View>
              <Text style={[styles.contactTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.chat_with_us}</Text>
              <Text style={[styles.contactSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{t.avg_reply}</Text>
            </GlassView>
          </Pressable>
          <Pressable onPress={() => Linking.openURL('tel:19500')} style={({ pressed }) => [{ flex: 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
            <GlassView style={styles.contactCard} borderRadius={20}>
              <View style={[styles.contactIcon, { backgroundColor: colors.accent + '26' }]}>
                <Phone size={20} color={colors.accent} strokeWidth={2} />
              </View>
              <Text style={[styles.contactTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.call_support}</Text>
              <Text style={[styles.contactSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>{t.hotline}</Text>
            </GlassView>
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>{t.browse_topics}</Text>
        <GlassView borderRadius={20}>
          {TOPIC_DEFS.map((topic, i) => (
            <Pressable
              key={topic.key}
              onPress={() => setSelectedTopicKey(topic.key === selectedTopicKey ? null : topic.key)}
              style={({ pressed }) => [
                styles.topicRow,
                { flexDirection: R },
                i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                (pressed || selectedTopicKey === topic.key) && { backgroundColor: colors.secondary + '66' },
              ]}
            >
              <Text style={[styles.topicText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: TA }]}>{topic.label}</Text>
              {selectedTopicKey === topic.key ? (
                <View style={[styles.selectedDot, { backgroundColor: colors.primary }]} />
              ) : (
                <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
              )}
            </Pressable>
          ))}
        </GlassView>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: 28, textAlign: TA }]}>
          {t.support_submit_ticket_title}
        </Text>

        {submitted ? (
          <GlassView strong style={styles.successCard} borderRadius={20}>
            <View style={[styles.successIcon, { backgroundColor: colors.success + '26' }]}>
              <Check size={24} color={colors.success} strokeWidth={2.5} />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>
              {t.support_ticket_submitted}
            </Text>
            <Text style={[styles.successSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
              {t.support_ticket_response}
            </Text>
            {failedAttachmentCount > 0 && (
              <Text style={[styles.successSub, { color: '#dc2626', fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
                {t.support_attachments_partial_note.replace('{n}', String(failedAttachmentCount))}
              </Text>
            )}
            <Pressable onPress={() => { setSubmitted(false); setFailedAttachmentCount(0); }} style={({ pressed }) => [styles.newTicketBtn, { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={[{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>{t.support_submit_another}</Text>
            </Pressable>
          </GlassView>
        ) : (
          <GlassView style={styles.ticketForm} borderRadius={20}>
            <Text style={[styles.formLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
              {t.support_issue_type_label}
            </Text>
            {selectedTopic ? (
              <View style={[styles.selectedTopicChip, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
                <Text style={[{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 }]}>{selectedTopic.label}</Text>
                <Pressable onPress={() => setSelectedTopicKey(null)}>
                  <Text style={[{ color: colors.mutedForeground, fontSize: Typography.size.xs }]}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: Spacing.md }]}>
                {t.support_tap_topic}
              </Text>
            )}

            <Text style={[styles.formLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', marginTop: Spacing.md, textAlign: TA }]}>
              {t.support_description_label}
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t.support_describe_placeholder}
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              style={[styles.descInput, { color: colors.foreground, fontFamily: 'Inter_400Regular', borderColor: colors.border, textAlign: TA }]}
            />

            <Text style={[styles.formLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', marginTop: Spacing.md, textAlign: TA }]}>
              {t.support_attach_photo}
            </Text>
            <View style={[styles.attachmentsRow, { flexDirection: R }]}>
              {attachments.map(att => (
                <View key={att.localId} style={[styles.attachmentThumb, { borderColor: colors.border }]}>
                  <Image source={{ uri: att.uri }} style={styles.attachmentImg} />
                  {att.status === 'uploading' && (
                    <View style={styles.attachmentOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}
                  {att.status === 'done' && (
                    <View style={[styles.attachmentBadge, { backgroundColor: '#16a34a' }]}>
                      <Check size={12} color="#fff" strokeWidth={3} />
                    </View>
                  )}
                  {att.status === 'error' && (
                    <View style={[styles.attachmentBadge, { backgroundColor: '#dc2626' }]}>
                      <X size={12} color="#fff" strokeWidth={3} />
                    </View>
                  )}
                  {att.status === 'idle' && !isSubmitting && (
                    <Pressable
                      onPress={() => removeAttachment(att.localId)}
                      style={styles.attachmentRemoveBtn}
                      accessibilityLabel={t.support_attachment_remove}
                    >
                      <X size={12} color="#fff" strokeWidth={3} />
                    </Pressable>
                  )}
                </View>
              ))}
              {attachments.length < MAX_ATTACHMENTS && !isSubmitting && (
                <Pressable
                  onPress={handleAddPhoto}
                  style={[styles.attachmentAddBtn, { borderColor: colors.border, backgroundColor: colors.secondary }]}
                >
                  <Camera size={20} color={colors.mutedForeground} strokeWidth={2} />
                </Pressable>
              )}
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: canSubmit ? colors.primary : colors.secondary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={canSubmit ? colors.primaryForeground : colors.mutedForeground} size="small" />
              ) : (
                <>
                  <Send size={16} color={canSubmit ? colors.primaryForeground : colors.mutedForeground} strokeWidth={2} />
                  <Text style={[styles.submitBtnText, { color: canSubmit ? colors.primaryForeground : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                    {t.support_send_ticket}
                  </Text>
                </>
              )}
            </Pressable>
          </GlassView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageTitle: { fontSize: 24, marginTop: Spacing.xl, marginBottom: Spacing.lg },
  searchBar: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  searchInput: { flex: 1, fontSize: Typography.size.sm },
  contactGrid: { gap: Spacing.md, marginTop: 20 },
  contactCard: { padding: Spacing.lg },
  contactIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  contactTitle: { fontSize: Typography.size.sm, marginTop: Spacing.md },
  contactSub: { fontSize: Typography.size.xs, marginTop: Spacing.xs },
  sectionTitle: { fontSize: Typography.size.xs, letterSpacing: 2, textTransform: 'uppercase', marginTop: 28, marginBottom: Spacing.md },
  topicRow: { alignItems: 'center', padding: Spacing.lg },
  topicText: { fontSize: Typography.size.sm },
  selectedDot: { width: 8, height: 8, borderRadius: 4 },
  ticketForm: { padding: Spacing.lg, gap: Spacing.xs },
  formLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: Spacing.sm },
  selectedTopicChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.xs,
  },
  descInput: {
    borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md,
    fontSize: Typography.size.sm, minHeight: 100, textAlignVertical: 'top',
    marginBottom: Spacing.xs,
  },
  attachmentsRow: { flexWrap: 'wrap', gap: 10, marginBottom: Spacing.sm },
  attachmentThumb: { width: 64, height: 64, borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  attachmentImg: { width: '100%', height: '100%' },
  attachmentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  attachmentBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  attachmentRemoveBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  attachmentAddBtn: {
    width: 64, height: 64, borderRadius: Radius.md, borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtn: {
    height: 48, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.sm,
  },
  submitBtnText: { fontSize: Typography.size.sm },
  successCard: { padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  successIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: Typography.size.lg },
  successSub: { fontSize: Typography.size.sm, lineHeight: 20 },
  newTicketBtn: { marginTop: Spacing.xs, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
});
