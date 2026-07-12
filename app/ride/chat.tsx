import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Send } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useSocket } from '@/lib/socketContext';
import { endpoints, type RideMessage } from '@/lib/api';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { useI18n } from '@/lib/i18nContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export default function RideChatScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { socket } = useSocket();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const queryClient = useQueryClient();

  const { data: messagesData, isLoading } = useQuery({
    queryKey: ['ride-messages', rideId],
    queryFn: () => endpoints.rides.messages(rideId ?? ''),
    enabled: !!rideId,
  });

  const messages: RideMessage[] = messagesData?.data ?? [];

  useEffect(() => {
    if (!socket || !rideId) return;
    const handleNewMessage = (msg: RideMessage) => {
      if (String(msg.rideId) !== String(rideId)) return;
      queryClient.setQueryData<{ data: RideMessage[]; total: number }>(
        ['ride-messages', rideId],
        old =>
          old
            ? { data: [...old.data, msg], total: old.total + 1 }
            : { data: [msg], total: 1 },
      );
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };
    socket.on(SOCKET_EVENTS.RIDE_MESSAGE_NEW, handleNewMessage);
    return () => { socket.off(SOCKET_EVENTS.RIDE_MESSAGE_NEW, handleNewMessage); };
  }, [socket, rideId, queryClient]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!text.trim() || !rideId || sending) return;
    const msgText = text.trim();
    setText('');
    setSending(true);
    try {
      await endpoints.rides.sendMessage(rideId, msgText);
    } catch {
      setText(msgText);
    } finally {
      setSending(false);
    }
  };

  const topPad = insets.top + 8;
  const botPad = insets.bottom + 8;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.message_rider_title}</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{t.no_messages_hint}</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={m => String(m.id)}
          contentContainerStyle={{ padding: Spacing.lg, gap: 10 }}
          renderItem={({ item }) => {
            const isDriver = item.senderRole === 'driver';
            return (
              <View style={[styles.bubbleWrap, isDriver ? styles.bubbleRight : styles.bubbleLeft]}>
                <GlassView
                  strong={isDriver}
                  borderRadius={16}
                  style={[styles.bubble, { backgroundColor: isDriver ? colors.primary + '22' : colors.secondary }]}
                >
                  <Text style={[styles.bubbleText, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>{item.text}</Text>
                  <Text style={[styles.bubbleTime, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </GlassView>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: botPad, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, fontFamily: 'Inter_400Regular' }]}
          value={text}
          onChangeText={setText}
          placeholder={t.type_message}
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={handleSend}
          disabled={!text.trim() || sending}
          style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: (!text.trim() || sending) ? 0.5 : 1 }]}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Send size={18} color="#fff" strokeWidth={2} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerTitle: { fontSize: Typography.size.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: Typography.size.sm },
  bubbleWrap: { maxWidth: '80%' },
  bubbleLeft: { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end' },
  bubble: { padding: Spacing.md, gap: Spacing.xs },
  bubbleText: { fontSize: Typography.size.sm },
  bubbleTime: { fontSize: 10, alignSelf: 'flex-end' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: Spacing.lg, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: Spacing.lg, paddingVertical: 10, fontSize: Typography.size.sm, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
