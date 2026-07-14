import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import {
  Camera,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Gift,
  GitBranch,
  HelpCircle,
  Inbox,
  Lock,
  LogOut,
  MessageSquare,
  Shield,
  Star,
  Target,
  TrendingUp,
  Truck,
  User,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import type { Language } from '@/lib/i18nContext';
import { LanguageSwitchOverlay } from '@/components/LanguageSwitchOverlay';
import { useAuth } from '@/lib/authContext';
import { useService } from '@/lib/serviceContext';
import { endpoints } from '@/lib/api';
import type { DriverProfileEnriched } from '@/lib/api';
import { compressImage } from '@/lib/imageCompression';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

const TAB_BAR_HEIGHT = 96;
const CARD_RADIUS = 16;
const BORDER_COLOR = 'rgba(0,0,0,0.08)';

const LANGUAGES: { label: string; value: Language }[] = [
  { label: 'English', value: 'en' },
  { label: 'العربية', value: 'ar' },
];

// ─── Fallback base profile from GET /driver/me ────────────────────────────
type BaseProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  rating: number;
  avatar?: string | null;
  trips: number;
  vehicle?: { make: string; model: string; plate: string } | null;
};

export default function ShuttleProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL, language, setLanguage, isSwitchingLanguage } = useI18n();
  const { logout } = useAuth();
  const { isDarkMode, setIsDarkMode } = useService();

  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  const [copied, setCopied] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarReason, setAvatarReason] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [avatarSubmitting, setAvatarSubmitting] = useState(false);

  // ── Primary: GET /driver/profile (enriched) ────────────────────────────
  // Falls back gracefully to GET /driver/me if endpoint returns an error.
  const {
    data: enriched,
    isLoading: enrichedLoading,
    isError: enrichedError,
  } = useQuery<DriverProfileEnriched>({
    queryKey: ['driver', 'profile'],
    queryFn: endpoints.driver.profile,
    retry: 1,
  });

  // ── Fallback: GET /driver/me ───────────────────────────────────────────
  const {
    data: base,
    isLoading: baseLoading,
  } = useQuery<BaseProfile>({
    queryKey: ['driver'],
    queryFn: endpoints.driver.me as () => Promise<BaseProfile>,
    enabled: enrichedError,
  });

  const isLoading = enrichedLoading || (enrichedError && baseLoading);

  const { data: driverReferralInfo } = useQuery({
    queryKey: ['driver-referral-info'],
    queryFn: endpoints.driver.referralProgram,
    retry: 1,
  });

  // Merge: prefer enriched, degrade to base
  const id = enriched?.id ?? base?.id ?? null;
  const name = enriched?.name ?? base?.name ?? null;
  const phone = enriched?.phone ?? base?.phone ?? null;
  const rating = enriched?.rating ?? base?.rating ?? null;
  const avatar = enriched?.avatar ?? base?.avatar ?? null;
  const trips = enriched?.trips ?? base?.trips ?? null;
  const vehicle = enriched?.vehicle ?? base?.vehicle ?? null;
  const documentStatus = enriched?.documentStatus ?? null;
  // bonusTargets no longer shown inline — kept for potential future use
  // const bonusTargets = enriched?.bonusTargets ?? [];

  const referralCode: string = enriched?.referralCode
    ?? (id ? `VGO-${String(id).slice(0, 4).toUpperCase()}` : 'VGO-XXXX');

  const avatarUri = avatar
    ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(name ?? 'Driver')}&background=1e1e28&color=fff&size=256`;

  // ── Clipboard ─────────────────────────────────────────────────────────
  const handleCopyCode = async () => {
    try {
      await Clipboard.setStringAsync(referralCode);
    } catch {
      // Clipboard unavailable — code is visible on screen; no blocking alert needed
    }
    // Show the inline "Copied" indicator regardless so the driver gets feedback
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── Avatar change request flow ────────────────────────────────────────
  const handleOpenAvatarModal = () => {
    setAvatarReason('');
    setSelectedImageUri(null);
    setShowAvatarModal(true);
  };

  const handleSelectPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t.camera_required, t.camera_required_sub);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets.length > 0) {
      setSelectedImageUri(result.assets[0].uri);
    }
  };

  const handleSubmitAvatarRequest = async () => {
    if (!avatarReason.trim() || avatarReason.trim().length < 5) {
      Alert.alert('', t.change_photo_reason_label);
      return;
    }
    if (!selectedImageUri) {
      Alert.alert('', t.select_new_photo);
      return;
    }

    setAvatarSubmitting(true);
    try {
      const compressed = await compressImage(selectedImageUri, 'avatar');
      const formData = new FormData();
      formData.append('changeReason', avatarReason.trim());
      formData.append('newAvatarImage', {
        uri: compressed.uri,
        name: compressed.fileName,
        type: compressed.mimeType,
      } as unknown as Blob);

      await endpoints.driver.requestAvatarChange(formData);
      setShowAvatarModal(false);
      Alert.alert('', t.avatar_request_sent);
    } catch {
      Alert.alert('', t.avatar_request_error);
    } finally {
      setAvatarSubmitting(false);
    }
  };

  // ── Document status label & colour ────────────────────────────────────
  const docStatusLabel = (() => {
    if (documentStatus === 'accepted') return t.verification_accepted;
    if (documentStatus === 'rejected') return t.verification_rejected;
    if (documentStatus === 'pending') return t.verification_pending;
    return '—';
  })();
  const docStatusColor = (() => {
    if (documentStatus === 'accepted') return '#16a34a';
    if (documentStatus === 'rejected') return colors.destructive;
    return colors.mutedForeground;
  })();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 8,
          paddingBottom: TAB_BAR_HEIGHT + 24,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Page title */}
        <Text style={[styles.pageTitle, { color: colors.foreground, textAlign: TA }]}>
          {t.profile_title}
        </Text>

        {/* ── GROUP 1: Master Driver Card ─────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {isLoading ? (
            <AppLoader style={{ marginVertical: Spacing.xxl }} />
          ) : (
            <>
              {/* Avatar + edit trigger */}
              <View style={styles.avatarRow}>
                <Pressable onPress={handleOpenAvatarModal} style={styles.avatarWrap} hitSlop={4}>
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                  <View style={[styles.cameraOverlay, { backgroundColor: colors.primary }]}>
                    <Camera size={14} color="#fff" strokeWidth={2.5} />
                  </View>
                </Pressable>
              </View>

              {/* Name — read-only */}
              <Text style={[styles.driverName, { color: colors.foreground, textAlign: 'center' }]}>
                {name ?? '—'}
              </Text>

              {/* Service + trip count */}
              <Text style={[styles.driverMeta, { color: colors.mutedForeground, textAlign: 'center' }]}>
                {t.shuttle_service}
                {trips !== null ? ` · ${trips} ${t.trips}` : ''}
              </Text>

              {/* Rating pill */}
              <View style={[styles.ratingPill, { backgroundColor: colors.secondary, flexDirection: R }]}>
                <Star size={13} color={colors.accent} fill={colors.accent} strokeWidth={2} />
                <Text style={[styles.ratingText, { color: colors.foreground }]}>
                  {rating !== null ? rating.toFixed(2) : '—'}
                </Text>
                <Text style={[styles.ratingLabel, { color: colors.mutedForeground }]}>
                  {t.rating_stat}
                </Text>
              </View>

              {/* Driver ID — read-only */}
              {id && (
                <View style={[styles.lockedRow, { flexDirection: R, borderTopColor: BORDER_COLOR }]}>
                  <Lock size={13} color={colors.mutedForeground} strokeWidth={2} />
                  <Text style={[styles.lockedLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                    {t.driver_id_label}
                  </Text>
                  <Text style={[styles.lockedValue, { color: colors.foreground, textAlign: TA }]}>
                    #{String(id).slice(0, 8).toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Phone — read-only */}
              {phone && (
                <View style={[styles.lockedRow, { flexDirection: R, borderTopColor: BORDER_COLOR }]}>
                  <Lock size={13} color={colors.mutedForeground} strokeWidth={2} />
                  <Text style={[styles.lockedLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                    {t.personal_info}
                  </Text>
                  <Text style={[styles.lockedValue, { color: colors.foreground, textAlign: TA }]}>
                    {phone}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Referral Code (كود الإحالة للسائق) ─────────────────────── */}
        <View style={[styles.card, styles.referralCard, { flexDirection: R, backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.referralIconWrap, { backgroundColor: colors.secondary }]}>
            <GitBranch size={20} color={colors.primary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.referralTitle, { color: colors.mutedForeground, textAlign: TA }]}>
              {t.referral_code_section}
            </Text>
            <Text style={[styles.referralCode, { color: colors.foreground, textAlign: TA }]}>
              {referralCode}
            </Text>
            <Text style={[styles.referralHint, { color: colors.mutedForeground, textAlign: TA }]}>
              {t.referral_code_copy_hint}
            </Text>
          </View>
          <Pressable
            onPress={handleCopyCode}
            hitSlop={8}
            style={({ pressed }) => [
              styles.copyBtn,
              { backgroundColor: pressed ? colors.secondary : 'transparent', borderColor: BORDER_COLOR },
            ]}
          >
            {copied
              ? <Check size={17} color="#16a34a" strokeWidth={2.5} />
              : <Copy size={17} color={colors.primary} strokeWidth={2} />}
          </Pressable>
        </View>
        {copied && (
          <Text style={[styles.copiedMsg, { color: '#16a34a' }]}>{t.code_copied}</Text>
        )}

        {/* ── Personal Info ───────────────────────────────────────────── */}
        <SectionHeader label={t.personal_info} colors={colors} isRTL={isRTL} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MenuRow
            icon={<User size={18} color={colors.foreground} strokeWidth={2} />}
            label={t.profile_info_label}
            onPress={() => router.push('/shuttle/profile-info' as never)}
            colors={colors}
            isRTL={isRTL}
            last
          />
        </View>

        {/* Financial Analytics */}
        <SectionHeader label={t.financial_analytics_section} colors={colors} isRTL={isRTL} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MenuRow
            icon={<TrendingUp size={18} color={colors.foreground} strokeWidth={2} />}
            label={t.earnings_commissions_label}
            sub={t.cash_commission_net}
            onPress={() => router.push('/shuttle/earnings' as never)}
            colors={colors}
            isRTL={isRTL}
            last
          />
        </View>

        {/* Vehicle & Documents */}
        <SectionHeader label={t.vehicle_documents} colors={colors} isRTL={isRTL} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MenuRow
            icon={<Truck size={18} color={colors.foreground} strokeWidth={2} />}
            label={t.vehicle_label}
            sub={vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plate}` : '—'}
            onPress={() => router.push('/vehicle')}
            colors={colors}
            isRTL={isRTL}
          />
          <View style={[styles.divider, { backgroundColor: BORDER_COLOR }]} />
          <MenuRow
            icon={<Shield size={18} color={colors.foreground} strokeWidth={2} />}
            label={t.documents_label}
            sub={documentStatus !== null ? `${t.verification_status_label}: ${docStatusLabel}` : '—'}
            subColor={documentStatus !== null ? docStatusColor : colors.mutedForeground}
            onPress={() => router.push('/documents')}
            colors={colors}
            isRTL={isRTL}
            last
          />
        </View>

        {/* Bonus Targets */}
        <SectionHeader label={t.bonus_targets} colors={colors} isRTL={isRTL} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MenuRow
            icon={<Target size={18} color={colors.foreground} strokeWidth={2} />}
            label={t.bonus_targets}
            onPress={() => router.push('/bonus-targets')}
            colors={colors}
            isRTL={isRTL}
            last
          />
        </View>

        {/* Invite a Driver — driver-invites-driver referral program (separate from the route-handoff code above) */}
        {driverReferralInfo?.config.enabled && (
          <>
            <SectionHeader label={t.driver_referral_menu_label} colors={colors} isRTL={isRTL} />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MenuRow
                icon={<Gift size={18} color={colors.foreground} strokeWidth={2} />}
                label={t.driver_referral_menu_label}
                onPress={() => router.push('/driver-referral')}
                colors={colors}
                isRTL={isRTL}
                last
              />
            </View>
          </>
        )}

        {/* Communication & Settings */}
        <SectionHeader label={t.communication_settings} colors={colors} isRTL={isRTL} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MenuRow
            icon={<Inbox size={18} color={colors.foreground} strokeWidth={2} />}
            label={t.notifications}
            onPress={() => router.push('/messages')}
            colors={colors}
            isRTL={isRTL}
          />
          <View style={[styles.divider, { backgroundColor: BORDER_COLOR }]} />
          <MenuRow
            icon={<MessageSquare size={18} color={colors.foreground} strokeWidth={2} />}
            label={t.messages_label}
            onPress={() => router.push('/messages')}
            colors={colors}
            isRTL={isRTL}
          />
          <View style={[styles.divider, { backgroundColor: BORDER_COLOR }]} />
          {/* Language inline toggle */}
          <View style={[styles.menuRow, { flexDirection: R }]}>
            <View style={[styles.menuIconWrap, { backgroundColor: colors.secondary }]}>
              <Text style={{ fontSize: Typography.size.md }}>🌐</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.foreground, textAlign: TA }]}>{t.language}</Text>
              <View style={[styles.langRow, { flexDirection: R }]}>
                {LANGUAGES.map(({ label, value }) => (
                  <Pressable
                    key={value}
                    onPress={() => setLanguage(value)}
                    style={[
                      styles.langChip,
                      {
                        backgroundColor: language === value ? colors.primary : colors.secondary,
                        borderColor: language === value ? colors.primary : BORDER_COLOR,
                      },
                    ]}
                  >
                    <Text style={[styles.langChipText, { color: language === value ? '#fff' : colors.mutedForeground }]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: BORDER_COLOR }]} />
          {/* Dark Mode toggle */}
          <View style={[styles.menuRow, { flexDirection: R }]}>
            <View style={[styles.menuIconWrap, { backgroundColor: colors.secondary }]}>
              <Text style={{ fontSize: Typography.size.md }}>{isDarkMode ? '🌙' : '☀️'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.foreground, textAlign: TA }]}>{t.dark_mode}</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground, textAlign: TA }]}>
                {isDarkMode ? t.dark_theme_active : t.light_theme_active}
              </Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={setIsDarkMode}
              trackColor={{ false: BORDER_COLOR, true: colors.primary + 'aa' }}
              thumbColor={isDarkMode ? colors.primary : '#fff'}
            />
          </View>
        </View>

        {/* Help & Safety */}
        <SectionHeader label={t.help_safety} colors={colors} isRTL={isRTL} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MenuRow
            icon={<Clock size={18} color={colors.foreground} strokeWidth={2} />}
            label={t.trip_history}
            sub={t.history_subtitle}
            onPress={() => router.push('/shuttle/history' as never)}
            colors={colors}
            isRTL={isRTL}
          />
          <View style={[styles.divider, { backgroundColor: BORDER_COLOR }]} />
          <MenuRow
            icon={<HelpCircle size={18} color={colors.foreground} strokeWidth={2} />}
            label={t.help_support}
            onPress={() => router.push('/support')}
            colors={colors}
            isRTL={isRTL}
          />
          <View style={[styles.divider, { backgroundColor: BORDER_COLOR }]} />
          <MenuRow
            icon={<Shield size={18} color={colors.foreground} strokeWidth={2} />}
            label={t.safety_toolkit}
            onPress={() => router.push('/safety')}
            colors={colors}
            isRTL={isRTL}
            last
          />
        </View>

        {/* Sign out */}
        <Pressable
          onPress={async () => { await logout(); router.replace('/login'); }}
          style={({ pressed }) => [styles.signOutBtn, { backgroundColor: pressed ? colors.destructive + '18' : colors.card, borderColor: colors.border, flexDirection: R }]}
        >
          <LogOut size={19} color={colors.destructive} strokeWidth={2} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>{t.sign_out}</Text>
        </Pressable>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          VeeGo Driver · Shuttle · v{Constants.expoConfig?.version ?? '—'}
        </Text>
      </ScrollView>

      {/* ── Avatar Change Request Modal ─────────────────────────────── */}
      <Modal
        visible={showAvatarModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAvatarModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAvatarModal(false)} />
        <View style={[styles.modalSheet, { backgroundColor: '#fff', paddingBottom: insets.bottom + 24 }]}>
          {/* Handle */}
          <View style={[styles.modalHandle, { backgroundColor: BORDER_COLOR }]} />

          <Text style={[styles.modalTitle, { color: '#0D1117', textAlign: TA }]}>
            {t.change_photo_modal_title}
          </Text>

          {/* Reason input */}
          <Text style={[styles.modalFieldLabel, { color: '#6B7280', textAlign: TA }]}>
            {t.change_photo_reason_label}
          </Text>
          <TextInput
            value={avatarReason}
            onChangeText={setAvatarReason}
            placeholder={t.change_photo_reason_placeholder}
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            textAlign={isRTL ? 'right' : 'left'}
            style={[
              styles.modalTextInput,
              { borderColor: BORDER_COLOR, color: '#0D1117', writingDirection: isRTL ? 'rtl' : 'ltr' },
            ]}
          />

          {/* Photo picker */}
          <Pressable
            onPress={handleSelectPhoto}
            style={({ pressed }) => [
              styles.photoPickerBtn,
              {
                backgroundColor: pressed ? '#F5F6F8' : '#fff',
                borderColor: selectedImageUri ? '#1e1e28' : BORDER_COLOR,
                flexDirection: R,
              },
            ]}
          >
            {selectedImageUri ? (
              <Image
                source={{ uri: selectedImageUri }}
                style={styles.selectedThumb}
                contentFit="cover"
              />
            ) : (
              <Camera size={20} color="#6B7280" strokeWidth={2} />
            )}
            <Text style={[styles.photoPickerText, { color: selectedImageUri ? '#0D1117' : '#6B7280', textAlign: TA }]}>
              {selectedImageUri ? (selectedImageUri.split('/').pop() ?? t.select_new_photo) : t.select_new_photo}
            </Text>
          </Pressable>

          {/* Submit */}
          <Pressable
            onPress={handleSubmitAvatarRequest}
            disabled={avatarSubmitting}
            style={[styles.submitBtn, { backgroundColor: '#1e1e28', opacity: avatarSubmitting ? 0.6 : 1 }]}
          >
            {avatarSubmitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.submitBtnText}>{t.submit_request}</Text>}
          </Pressable>

          {/* Cancel */}
          <Pressable onPress={() => setShowAvatarModal(false)} style={styles.cancelLink}>
            <Text style={[styles.cancelLinkText, { color: '#6B7280' }]}>{t.cancel}</Text>
          </Pressable>
        </View>
      </Modal>
      {isSwitchingLanguage && <LanguageSwitchOverlay />}
    </View>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({
  label, colors, isRTL,
}: {
  label: string;
  colors: ReturnType<typeof useColors>;
  isRTL: boolean;
}) {
  return (
    <Text style={[
      styles.sectionHeader,
      { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' },
    ]}>
      {label}
    </Text>
  );
}

function MenuRow({
  icon, label, sub, subColor, onPress, colors, isRTL, last,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  subColor?: string;
  onPress?: () => void;
  colors: ReturnType<typeof useColors>;
  isRTL: boolean;
  last?: boolean;
}) {
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        { flexDirection: R, backgroundColor: pressed ? colors.secondary + '55' : 'transparent' },
      ]}
    >
      <View style={[styles.menuIconWrap, { backgroundColor: colors.secondary }]}>
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.menuLabel, { color: colors.foreground, textAlign: TA }]} numberOfLines={1}>
          {label}
        </Text>
        {sub !== undefined && (
          <Text
            style={[styles.menuSub, { color: subColor ?? colors.mutedForeground, textAlign: TA }]}
            numberOfLines={1}
          >
            {sub}
          </Text>
        )}
      </View>
      <ChevronRight
        size={16}
        color={colors.mutedForeground}
        strokeWidth={2}
        style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}
      />
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  pageTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    marginBottom: Spacing.lg,
  },

  // Card — background supplied dynamically via inline style
  card: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },

  // Group 1 — Master Driver Card
  avatarRow: { alignItems: 'center', paddingTop: Spacing.xl, paddingBottom: Spacing.sm },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#EAEDF2',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  driverName: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    marginTop: Spacing.sm,
    paddingHorizontal: 20,
  },
  driverMeta: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  ratingPill: {
    alignSelf: 'center',
    borderRadius: Radius.xl,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 5,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  ratingText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  ratingLabel: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_400Regular',
  },

  // Read-only locked row
  lockedRow: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: 20,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  lockedLabel: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  lockedValue: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },

  // Referral code
  referralCard: {
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  referralIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralTitle: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  referralCode: {
    fontSize: Typography.size.xl,
    fontFamily: 'Inter_700Bold',
    marginTop: Spacing.xs,
    letterSpacing: 2,
  },
  referralHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 3,
  },
  copyBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  copiedMsg: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    marginTop: -4,
    marginBottom: Spacing.sm,
  },

  // Section header
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: Spacing.sm,
    marginBottom: 6,
    paddingHorizontal: Spacing.xs,
  },

  // Menu rows
  menuRow: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
  },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_600SemiBold',
  },
  menuSub: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginHorizontal: Spacing.lg,
  },

  // Language chips
  langRow: {
    gap: 6,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
  },
  langChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  langChipText: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_600SemiBold',
  },

  // Bonus targets
  bonusRow: {
    padding: Spacing.lg,
    gap: 10,
  },
  bonusTitle: {
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  bonusAmount: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  bonusSub: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
    marginBottom: Spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 4,
  },
  emptyBonus: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    padding: 20,
  },

  // Sign out
  signOutBtn: {
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(232,84,84,0.15)',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  signOutText: {
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_700Bold',
  },

  version: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: Spacing.md,
  },

  // Avatar change modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: Typography.size.lg,
    fontFamily: 'Inter_700Bold',
    marginBottom: 20,
  },
  modalFieldLabel: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
  },
  modalTextInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_400Regular',
    minHeight: 88,
    marginBottom: Spacing.lg,
  },
  photoPickerBtn: {
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    marginBottom: 20,
  },
  selectedThumb: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: '#EAEDF2',
  },
  photoPickerText: {
    flex: 1,
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_400Regular',
  },
  submitBtn: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginBottom: 10,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelLinkText: {
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_400Regular',
  },
});
