import { showAlert } from '@/lib/alert';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft, Camera, Check, ChevronDown, ChevronUp,
  MapPin, Send, X,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { getToken, getUserIdFromToken } from '@/lib/auth';
import { compressImage } from '@/lib/imageCompression';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import type { RideHistoryItem } from '@/lib/api/types';

type SupportCategory = 'payment' | 'safety' | 'quality' | 'refund' | 'lost_found' | 'other';
type TopicKey = 'payments' | 'account' | 'trip' | 'vehicle' | 'safety' | 'app';
type TicketStep = 0 | 1 | 2 | 3;

type Attachment = { localId: string; uri: string; status: 'idle' | 'uploading' | 'done' | 'error' };

const MAX_ATTACHMENTS = 5;

export default function SupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const topPad = insets.top;
  const R  = 'row' as const;
  const TA = isRTL ? 'right' as const      : 'left' as const;

  // ── FAQ accordion ──────────────────────────────────────────────
  const [expandedFaq, setExpandedFaq] = useState<TopicKey | null>(null);

  // ── Ticket multi-step state ────────────────────────────────────
  const [ticketStep,       setTicketStep]       = useState<TicketStep>(0);
  const [selectedTripId,   setSelectedTripId]   = useState<string | 'none' | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SupportCategory | null>(null);
  const [description,      setDescription]      = useState('');
  const [attachments,      setAttachments]      = useState<Attachment[]>([]);
  const [failedCount,      setFailedCount]      = useState(0);
  const [isSubmitting,     setIsSubmitting]     = useState(false);
  const [submitted,        setSubmitted]        = useState(false);

  // ── Recent rides for trip-selection step ──────────────────────
  const { data: ridesRaw, isLoading: ridesLoading } = useQuery({
    queryKey: ['rides-history-support'],
    queryFn: () => endpoints.rides.history(1, 10),
    enabled: ticketStep === 1,
    staleTime: 60_000,
  });
  const recentRides: RideHistoryItem[] = Array.isArray((ridesRaw as { data?: RideHistoryItem[] } | undefined)?.data)
    ? (ridesRaw as { data: RideHistoryItem[] }).data
    : [];

  // ── Static definitions (after hook calls) ─────────────────────
  const FAQ_DEFS: { key: TopicKey; label: string; answer: string }[] = [
    { key: 'payments', label: t.support_topic_payments, answer: t.support_faq_a_payments },
    { key: 'account',  label: t.support_topic_account,  answer: t.support_faq_a_account  },
    { key: 'trip',     label: t.support_topic_trip,     answer: t.support_faq_a_trip     },
    { key: 'vehicle',  label: t.support_topic_vehicle,  answer: t.support_faq_a_vehicle  },
    { key: 'safety',   label: t.support_topic_safety,   answer: t.support_faq_a_safety   },
    { key: 'app',      label: t.support_topic_app,      answer: t.support_faq_a_app      },
  ];

  const CATEGORY_DEFS: { key: SupportCategory; label: string }[] = [
    { key: 'payment',   label: t.support_cat_payment   },
    { key: 'safety',    label: t.support_cat_safety    },
    { key: 'quality',   label: t.support_cat_quality   },
    { key: 'refund',    label: t.support_cat_refund    },
    { key: 'lost_found',label: t.support_cat_lost_found},
    { key: 'other',     label: t.support_cat_other     },
  ];

  const canSubmit = selectedCategory !== null && description.trim().length > 0;

  // ── Photo handlers ─────────────────────────────────────────────
  const handleAddPhoto = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert(t.camera_required, t.camera_required_sub);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      setAttachments(prev => [
        ...prev,
        { localId: `${Date.now()}-${prev.length}`, uri: result.assets[0].uri, status: 'idle' },
      ]);
    }
  };

  const removeAttachment = (localId: string) =>
    setAttachments(prev => prev.filter(a => a.localId !== localId));

  // ── Submit ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit || !selectedCategory || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const driverId = getUserIdFromToken(await getToken());
      const tripRef  = selectedTripId && selectedTripId !== 'none' ? selectedTripId : undefined;
      const catLabel = CATEGORY_DEFS.find(c => c.key === selectedCategory)?.label ?? selectedCategory;

      const { id: ticketId } = await endpoints.support.submitTicket({
        subject:  catLabel,
        message:  description.trim(),
        type:     'driver',
        priority: 'medium',
        category: selectedCategory,
        driverId: driverId ?? '',
        ...(tripRef ? { rideId: tripRef } : {}),
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

      setFailedCount(failed);
      setSubmitted(true);
    } catch {
      showAlert(t.error, t.support_err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetTicket = () => {
    setTicketStep(0);
    setSelectedTripId(null);
    setSelectedCategory(null);
    setDescription('');
    setAttachments([]);
    setFailedCount(0);
    setSubmitted(false);
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 60, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </Pressable>

        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', marginTop: Spacing.xl }]}>
          {t.help_support}
        </Text>

        {/* ── FAQ Section ─────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: Spacing.xl, textAlign: TA }]}>
          {t.support_faq_header}
        </Text>

        <GlassView style={{ marginTop: Spacing.sm }} borderRadius={20}>
          {FAQ_DEFS.map((faq, i) => {
            const isExpanded = expandedFaq === faq.key;
            return (
              <View key={faq.key} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
                <Pressable
                  onPress={() => setExpandedFaq(isExpanded ? null : faq.key)}
                  style={({ pressed }) => [
                    styles.faqRow,
                    { flexDirection: R },
                    pressed && { backgroundColor: colors.secondary + '55' },
                  ]}
                >
                  <Text style={[styles.faqLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: TA }]}>
                    {faq.label}
                  </Text>
                  {isExpanded
                    ? <ChevronUp   size={16} color={colors.mutedForeground} strokeWidth={2} />
                    : <ChevronDown size={16} color={colors.mutedForeground} strokeWidth={2} />
                  }
                </Pressable>
                {isExpanded && (
                  <View style={[styles.faqAnswer, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <Text style={[styles.faqAnswerText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
                      {faq.answer}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </GlassView>

        {/* ── Submit Ticket Section ────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', marginTop: Spacing.xxl, textAlign: TA }]}>
          {t.support_submit_ticket_title}
        </Text>

        {/* Step 0 — collapsed entry point */}
        {ticketStep === 0 && !submitted && (
          <Pressable onPress={() => setTicketStep(1)} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
            <GlassView style={[styles.openTicketCard, { flexDirection: R }]} borderRadius={20}>
              <Send size={20} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.openTicketLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: TA }]}>
                {t.support_open_ticket}
              </Text>
              <ChevronDown size={16} color={colors.mutedForeground} strokeWidth={2} />
            </GlassView>
          </Pressable>
        )}

        {/* Success */}
        {submitted && (
          <GlassView style={styles.successCard} borderRadius={20}>
            <View style={[styles.successIcon, { backgroundColor: '#16a34a22' }]}>
              <Check size={28} color="#16a34a" strokeWidth={2.5} />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }]}>
              {t.support_ticket_submitted}
            </Text>
            <Text style={[styles.successSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
              {failedCount > 0
                ? t.support_attachments_partial_note.replace('{n}', String(failedCount))
                : t.support_ticket_response}
            </Text>
            <Pressable
              onPress={resetTicket}
              style={({ pressed }) => [styles.newTicketBtn, { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.newTicketText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {t.support_submit_another}
              </Text>
            </Pressable>
          </GlassView>
        )}

        {/* Step 1 — Select a Trip */}
        {ticketStep === 1 && (
          <GlassView style={styles.stepCard} borderRadius={20}>
            <Text style={[styles.stepTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              {t.support_ticket_step_trip}
            </Text>
            <Text style={[styles.stepSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]}>
              {t.support_ticket_step_trip_sub}
            </Text>

            {/* "No specific trip" option */}
            <Pressable
              onPress={() => setSelectedTripId(selectedTripId === 'none' ? null : 'none')}
              style={[
                styles.tripRow,
                { flexDirection: R, borderColor: selectedTripId === 'none' ? colors.primary : colors.border, backgroundColor: selectedTripId === 'none' ? colors.primary + '15' : 'transparent' },
              ]}
            >
              <Text style={[styles.tripTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: TA }]}>
                {t.support_no_specific_trip}
              </Text>
              {selectedTripId === 'none' && <Check size={16} color={colors.primary} strokeWidth={2.5} />}
            </Pressable>

            {/* Recent rides list */}
            {ridesLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: Spacing.lg }}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={[styles.stepSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: Spacing.sm, textAlign: 'center' }]}>
                  {t.support_loading_trips}
                </Text>
              </View>
            ) : recentRides.length === 0 ? (
              <Text style={[styles.stepSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: Spacing.lg }]}>
                {t.support_no_trips_found}
              </Text>
            ) : (
              <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
                {recentRides.map(ride => {
                  const isSelected = selectedTripId === ride.id;
                  const dateStr    = ride.completedAt
                    ? new Date(ride.completedAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-EG')
                    : '';
                  return (
                    <Pressable
                      key={ride.id}
                      onPress={() => setSelectedTripId(isSelected ? null : ride.id)}
                      style={[
                        styles.tripRow,
                        { flexDirection: R, borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary + '15' : 'transparent' },
                      ]}
                    >
                      <MapPin size={14} color={colors.mutedForeground} strokeWidth={2} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.tripTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]} numberOfLines={1}>
                          {ride.pickupAddress}
                        </Text>
                        <Text style={[styles.tripSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA }]} numberOfLines={1}>
                          → {ride.dropoffAddress}
                        </Text>
                        {dateStr ? (
                          <Text style={[styles.tripDate, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                            {dateStr}
                          </Text>
                        ) : null}
                      </View>
                      {isSelected && <Check size={16} color={colors.primary} strokeWidth={2.5} />}
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Pressable
              onPress={() => { if (selectedTripId !== null) setTicketStep(2); }}
              disabled={selectedTripId === null}
              style={({ pressed }) => [
                styles.continueBtn,
                { backgroundColor: selectedTripId !== null ? colors.primary : colors.secondary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.continueBtnText, { color: selectedTripId !== null ? colors.primaryForeground : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                {t.support_continue}
              </Text>
            </Pressable>
          </GlassView>
        )}

        {/* Step 2 — Select Category */}
        {ticketStep === 2 && (
          <GlassView style={styles.stepCard} borderRadius={20}>
            <Text style={[styles.stepTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              {t.support_ticket_step_category}
            </Text>

            <View style={styles.categoryGrid}>
              {CATEGORY_DEFS.map(cat => {
                const isSelected = selectedCategory === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    onPress={() => setSelectedCategory(isSelected ? null : cat.key)}
                    style={[
                      styles.categoryChip,
                      { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary + '15' : colors.glass },
                    ]}
                  >
                    {isSelected && <Check size={12} color={colors.primary} strokeWidth={2.5} />}
                    <Text style={[styles.categoryChipText, { color: isSelected ? colors.primary : colors.foreground, fontFamily: isSelected ? 'Inter_700Bold' : 'Inter_600SemiBold' }]}>
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.stepActions, { flexDirection: R }]}>
              <Pressable onPress={() => setTicketStep(1)} style={[styles.backStepBtn, { borderColor: colors.border, backgroundColor: colors.glass }]}>
                <Text style={[styles.backStepText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{t.back}</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (selectedCategory) setTicketStep(3); }}
                disabled={!selectedCategory}
                style={({ pressed }) => [
                  styles.continueBtn,
                  { flex: 1, backgroundColor: selectedCategory ? colors.primary : colors.secondary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.continueBtnText, { color: selectedCategory ? colors.primaryForeground : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                  {t.support_continue}
                </Text>
              </Pressable>
            </View>
          </GlassView>
        )}

        {/* Step 3 — Describe & Attach */}
        {ticketStep === 3 && (
          <GlassView style={styles.stepCard} borderRadius={20}>
            <Text style={[styles.stepTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              {t.support_ticket_step_describe}
            </Text>

            <TextInput
              style={[
                styles.descriptionInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary + '66', fontFamily: 'Inter_400Regular', textAlign: TA },
              ]}
              placeholder={t.support_description_placeholder}
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={5}
              value={description}
              onChangeText={setDescription}
            />

            {/* Photos */}
            <Text style={[styles.attachLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
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
                      <Check size={10} color="#fff" strokeWidth={3} />
                    </View>
                  )}
                  {att.status === 'error' && (
                    <View style={[styles.attachmentBadge, { backgroundColor: '#dc2626' }]}>
                      <X size={10} color="#fff" strokeWidth={3} />
                    </View>
                  )}
                  {att.status === 'idle' && !isSubmitting && (
                    <Pressable onPress={() => removeAttachment(att.localId)} style={styles.attachmentRemoveBtn} accessibilityLabel={t.support_attachment_remove}>
                      <X size={10} color="#fff" strokeWidth={3} />
                    </Pressable>
                  )}
                </View>
              ))}
              {attachments.length < MAX_ATTACHMENTS && !isSubmitting && (
                <Pressable onPress={handleAddPhoto} style={[styles.attachmentAddBtn, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                  <Camera size={20} color={colors.mutedForeground} strokeWidth={2} />
                </Pressable>
              )}
            </View>

            <View style={[styles.stepActions, { flexDirection: R }]}>
              <Pressable onPress={() => setTicketStep(2)} style={[styles.backStepBtn, { borderColor: colors.border, backgroundColor: colors.glass }]}>
                <Text style={[styles.backStepText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{t.back}</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit || isSubmitting}
                style={({ pressed }) => [
                  styles.continueBtn,
                  { flex: 1, flexDirection: R, backgroundColor: canSubmit ? colors.primary : colors.secondary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                {isSubmitting
                  ? <ActivityIndicator color={canSubmit ? colors.primaryForeground : colors.mutedForeground} size="small" />
                  : <>
                    <Send size={16} color={canSubmit ? colors.primaryForeground : colors.mutedForeground} strokeWidth={2} />
                    <Text style={[styles.continueBtnText, { color: canSubmit ? colors.primaryForeground : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                      {t.support_send_ticket}
                    </Text>
                  </>
                }
              </Pressable>
            </View>
          </GlassView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1 },
  backBtn:            { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageTitle:          { fontSize: 24 },
  sectionLabel:       { fontSize: Typography.size.xs, textTransform: 'uppercase', letterSpacing: 0.8 },
  // FAQ
  faqRow:             { alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  faqLabel:           { fontSize: Typography.size.sm },
  faqAnswer:          { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, paddingTop: Spacing.md },
  faqAnswerText:      { fontSize: Typography.size.sm, lineHeight: 22 },
  // Entry card
  openTicketCard:     { alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, marginTop: Spacing.sm },
  openTicketLabel:    { fontSize: Typography.size.sm },
  // Success
  successCard:        { marginTop: Spacing.sm, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  successIcon:        { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  successTitle:       { fontSize: Typography.size.lg },
  successSub:         { fontSize: Typography.size.sm, lineHeight: 20 },
  newTicketBtn:       { marginTop: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.lg },
  newTicketText:      { fontSize: Typography.size.sm },
  // Steps
  stepCard:           { padding: Spacing.lg, marginTop: Spacing.sm },
  stepTitle:          { fontSize: Typography.size.md, marginBottom: Spacing.xs },
  stepSub:            { fontSize: Typography.size.sm, marginBottom: Spacing.md },
  tripRow:            { alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, marginTop: Spacing.sm },
  tripTitle:          { fontSize: Typography.size.sm },
  tripSub:            { fontSize: Typography.size.xs, marginTop: 2 },
  tripDate:           { fontSize: 11, marginTop: 2 },
  continueBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.lg },
  continueBtnText:    { fontSize: Typography.size.sm },
  categoryGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  categoryChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1.5 },
  categoryChipText:   { fontSize: Typography.size.xs },
  stepActions:        { gap: Spacing.sm, marginTop: Spacing.lg },
  backStepBtn:        { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backStepText:       { fontSize: Typography.size.sm },
  // Description
  descriptionInput:   { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg, minHeight: 120, textAlignVertical: 'top', fontSize: Typography.size.sm },
  attachLabel:        { fontSize: Typography.size.xs, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },
  // Attachments
  attachmentsRow:     { flexWrap: 'wrap', gap: 10, marginBottom: Spacing.sm },
  attachmentThumb:    { width: 64, height: 64, borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  attachmentImg:      { width: '100%', height: '100%' },
  attachmentOverlay:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  attachmentBadge:    { position: 'absolute', bottom: 3, right: 3, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  attachmentRemoveBtn:{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  attachmentAddBtn:   { width: 64, height: 64, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
