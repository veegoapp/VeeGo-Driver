import { X } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';

type Props = {
  visible: boolean;
  contentEn: string;
  contentAr: string;
  /** If set, shows an "updated" banner and an Accept button at the bottom. */
  showAcceptButton?: boolean;
  acceptLoading?: boolean;
  onAccept?: () => void;
  onClose: () => void;
};

export function TermsModal({ visible, contentEn, contentAr, showAcceptButton, acceptLoading, onAccept, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();
  const TA = isRTL ? 'right' as const : 'left' as const;

  const content = isRTL ? contentAr : contentEn;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Platform.OS === 'ios' ? insets.top : 16 }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.title, { color: colors.foreground, textAlign: TA }]}>{t.terms_title}</Text>
          <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.secondary }]}>
            <X size={18} color={colors.foreground} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Updated banner */}
        {showAcceptButton && (
          <View style={[styles.banner, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '55' }]}>
            <Text style={[styles.bannerText, { color: colors.foreground, textAlign: TA }]}>{t.terms_updated_banner}</Text>
          </View>
        )}

        {/* Content */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.bodyText, { color: colors.foreground, textAlign: TA }]}>{content}</Text>
        </ScrollView>

        {/* Accept button */}
        {showAcceptButton && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border, backgroundColor: colors.background }]}>
            <Pressable
              onPress={onAccept}
              disabled={acceptLoading}
              style={[styles.acceptBtn, { backgroundColor: colors.primary, opacity: acceptLoading ? 0.6 : 1 }]}
            >
              {acceptLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[styles.acceptBtnText, { color: colors.primaryForeground }]}>{t.terms_accept_btn}</Text>
              }
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold', flex: 1 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  banner: {
    marginHorizontal: 20, marginTop: 12,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  bannerText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  scrollContent: { paddingHorizontal: 20, paddingVertical: 16 },
  bodyText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 24 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
  acceptBtn: {
    height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  acceptBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
