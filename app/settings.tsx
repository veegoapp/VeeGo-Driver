import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, FileText, Globe, HelpCircle, MessageSquare, Shield, User } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';

const SECTIONS = [
  {
    key: 'account',
    items: [
      { key: 'personal_info', icon: User, route: '/personal-info' },
      { key: 'documents', icon: FileText, route: '/documents' },
      { key: 'safety', icon: Shield, route: '/safety' },
    ],
  },
  {
    key: 'preferences',
    items: [
      { key: 'language', icon: Globe, route: '/language-select' },
      { key: 'messages', icon: MessageSquare, route: '/messages' },
    ],
  },
  {
    key: 'support',
    items: [
      { key: 'support', icon: HelpCircle, route: '/support' },
    ],
  },
];

const FALLBACKS: Record<string, string> = {
  account: 'Account',
  preferences: 'Preferences',
  support: 'Support',
  personal_info: 'Personal Info',
  documents: 'Documents',
  safety: 'Safety',
  language: 'Language',
  messages: 'Messages',
  settings: 'Settings',
};

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const label = (key: string) => (t as any)[key] ?? FALLBACKS[key] ?? key;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.navBar, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}>
          {isRTL
            ? <ChevronRight size={22} color={colors.foreground} strokeWidth={2} />
            : <ChevronLeft size={22} color={colors.foreground} strokeWidth={2} />
          }
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{label('settings')}</Text>
        <View style={styles.navBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map((section) => (
          <View key={section.key} style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold', textAlign: isRTL ? 'right' : 'left' }]}>
              {label(section.key)}
            </Text>
            <GlassView borderRadius={18}>
              {section.items.map((item, idx) => (
                <Pressable
                  key={item.key}
                  onPress={() => router.push(item.route as any)}
                  style={({ pressed }) => [
                    styles.row,
                    { flexDirection: isRTL ? 'row-reverse' : 'row', opacity: pressed ? 0.7 : 1 },
                    idx < section.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}>
                    <item.icon size={18} color={colors.foreground} strokeWidth={2} />
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.foreground, fontFamily: 'Inter_500Medium', textAlign: isRTL ? 'right' : 'left' }]}>
                    {label(item.key)}
                  </Text>
                  {isRTL
                    ? <ChevronLeft size={16} color={colors.mutedForeground} strokeWidth={2} />
                    : <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} />
                  }
                </Pressable>
              ))}
            </GlassView>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 18 },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4 },
  row: { alignItems: 'center', gap: 14, padding: 14 },
  iconBox: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15 },
});
