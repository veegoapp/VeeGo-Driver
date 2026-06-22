import { router } from 'expo-router';
import { ArrowLeft, Check, ChevronRight, MessageCircle, Phone, Search, Send } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

export default function SupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();

  const TOPICS = [
    t.support_topic_payments,
    t.support_topic_account,
    t.support_topic_trip,
    t.support_topic_vehicle,
    t.support_topic_safety,
    t.support_topic_app,
  ];
  const topPad = insets.top;

  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = !!selectedTopic && description.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await endpoints.support.submitTicket({
        subject: selectedTopic,
        message: description.trim(),
        type: 'driver',
      });
      setSubmitted(true);
      setSelectedTopic(null);
      setDescription('');
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
          <Pressable onPress={() => Alert.alert('Coming soon')} style={({ pressed }) => [{ flex: 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
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
          {TOPICS.map((topic, i) => (
            <Pressable
              key={topic}
              onPress={() => setSelectedTopic(topic === selectedTopic ? null : topic)}
              style={({ pressed }) => [
                styles.topicRow,
                { flexDirection: R },
                i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                (pressed || selectedTopic === topic) && { backgroundColor: colors.secondary + '66' },
              ]}
            >
              <Text style={[styles.topicText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: TA }]}>{topic}</Text>
              {selectedTopic === topic ? (
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
            <Pressable onPress={() => setSubmitted(false)} style={({ pressed }) => [styles.newTicketBtn, { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 }]}>
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
                <Text style={[{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 }]}>{selectedTopic}</Text>
                <Pressable onPress={() => setSelectedTopic(null)}>
                  <Text style={[{ color: colors.mutedForeground, fontSize: 12 }]}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 12 }]}>
                {t.support_tap_topic}
              </Text>
            )}

            <Text style={[styles.formLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', marginTop: 12, textAlign: TA }]}>
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
  pageTitle: { fontSize: 24, marginTop: 24, marginBottom: 16 },
  searchBar: { alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  contactGrid: { gap: 12, marginTop: 20 },
  contactCard: { padding: 16 },
  contactIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contactTitle: { fontSize: 14, marginTop: 12 },
  contactSub: { fontSize: 12, marginTop: 4 },
  sectionTitle: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: 28, marginBottom: 12 },
  topicRow: { alignItems: 'center', padding: 16 },
  topicText: { fontSize: 14 },
  selectedDot: { width: 8, height: 8, borderRadius: 4 },
  ticketForm: { padding: 16, gap: 4 },
  formLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  selectedTopicChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4,
  },
  descInput: {
    borderWidth: 1, borderRadius: 12, padding: 12,
    fontSize: 14, minHeight: 100, textAlignVertical: 'top',
    marginBottom: 4,
  },
  submitBtn: {
    height: 48, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
  },
  submitBtnText: { fontSize: 14 },
  successCard: { padding: 24, alignItems: 'center', gap: 12 },
  successIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 18 },
  successSub: { fontSize: 14, lineHeight: 20 },
  newTicketBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
});
