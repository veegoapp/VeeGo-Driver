import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, Bell, InboxIcon } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
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
  const queryClient = useQueryClient();

  const { data: notifications, isLoading, isError } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => endpoints.notifications.list() as Promise<Notification[]>,
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
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Messages</Text>

        {isLoading && (
          <View style={styles.centeredState}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        )}

        {isError && (
          <GlassView style={styles.centeredState} borderRadius={20}>
            <Bell size={32} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.stateTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              Could not load messages
            </Text>
            <Text style={[styles.stateSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Pull down to retry.
            </Text>
          </GlassView>
        )}

        {!isLoading && !isError && (!notifications || notifications.length === 0) && (
          <GlassView style={styles.centeredState} borderRadius={20}>
            <InboxIcon size={32} color={colors.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.stateTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              No messages yet
            </Text>
            <Text style={[styles.stateSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Announcements and notifications will appear here.
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
  pageTitle: { fontSize: 24, marginTop: 24 },
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
