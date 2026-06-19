import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, Bell, CheckCheck, InboxIcon } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

type Notification = {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
};

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading, isError } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => endpoints.notifications.list() as Promise<Notification[]>,
  });

  const hasUnread = (notifications ?? []).some(n => !n.read);

  const markAllMutation = useMutation({
    mutationFn: () => endpoints.notifications.markAllRead() as Promise<unknown>,
    onMutate: () => {
      queryClient.setQueryData<Notification[]>(['notifications'], prev =>
        prev?.map(item => ({ ...item, read: true }))
      );
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleTap = async (n: Notification) => {
    if (!n.read) {
      queryClient.setQueryData<Notification[]>(['notifications'], prev =>
        prev?.map(item => item.id === n.id ? { ...item, read: true } : item)
      );
      try {
        await endpoints.notifications.markRead(n.id);
      } catch {
        queryClient.setQueryData<Notification[]>(['notifications'], prev =>
          prev?.map(item => item.id === n.id ? { ...item, read: false } : item)
        );
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 40, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{t.messages_title}</Text>
          {hasUnread && (
            <Pressable
              onPress={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              style={({ pressed }) => [styles.markAllBtn, { backgroundColor: colors.glass, borderColor: colors.border, opacity: pressed || markAllMutation.isPending ? 0.6 : 1 }]}
            >
              {markAllMutation.isPending
                ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                : <CheckCheck size={14} color={colors.mutedForeground} strokeWidth={2} />
              }
              <Text style={[styles.markAllText, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>{t.mark_all_read}</Text>
            </Pressable>
          )}
        </View>

        {isLoading && (
          <View style={styles.centeredState}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        )}

        {isError && (
          <GlassView style={styles.centeredState} borderRadius={20}>
            <Bell size={32} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.stateTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {t.messages_load_err_title}
            </Text>
            <Text style={[styles.stateSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {t.messages_load_err_sub}
            </Text>
          </GlassView>
        )}

        {!isLoading && !isError && (!notifications || notifications.length === 0) && (
          <GlassView style={styles.centeredState} borderRadius={20}>
            <InboxIcon size={32} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.stateTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {t.messages_empty_title}
            </Text>
            <Text style={[styles.stateSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {t.messages_empty_sub}
            </Text>
          </GlassView>
        )}

        {!isLoading && !isError && notifications && notifications.length > 0 && (
          <GlassView style={{ marginTop: 20 }} borderRadius={20}>
            {notifications.map((n, i) => {
              const isSystem = !n.title.includes('@');
              return (
                <Pressable
                  key={n.id}
                  onPress={() => handleTap(n)}
                  style={({ pressed }) => [
                    styles.msgRow,
                    i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    pressed && { backgroundColor: colors.secondary + '66' },
                  ]}
                >
                  {isSystem ? (
                    <LinearGradient colors={['#2d2d42', '#1e1e28']} style={styles.avatarCircle}>
                      <Text style={[styles.avatarLetter, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>
                        {n.title[0]?.toUpperCase() ?? 'V'}
                      </Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.avatarCircle, { backgroundColor: colors.secondary }]}>
                      <Text style={[styles.avatarLetter, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                        {n.title[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.msgHeader}>
                      <Text style={[styles.msgFrom, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                        {n.title}
                      </Text>
                      <Text style={[styles.msgTime, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                        {n.time}
                      </Text>
                    </View>
                    <Text
                      style={[styles.msgPreview, { color: n.read ? colors.mutedForeground : colors.foreground, fontFamily: 'Inter_400Regular' }]}
                      numberOfLines={2}
                    >
                      {n.body}
                    </Text>
                  </View>
                  {!n.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
                </Pressable>
              );
            })}
          </GlassView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 0 },
  pageTitle: { fontSize: 24 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  markAllText: { fontSize: 12 },
  centeredState: { marginTop: 40, alignItems: 'center', padding: 32, gap: 12 },
  stateTitle: { fontSize: 16, textAlign: 'center' },
  stateSub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 14 },
  msgHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  msgFrom: { fontSize: 14, flex: 1 },
  msgTime: { fontSize: 10 },
  msgPreview: { fontSize: 12, marginTop: 2, lineHeight: 18 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
});
