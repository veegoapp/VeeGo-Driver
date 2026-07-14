import { router } from 'expo-router';
import { ChevronLeft, Copy, Gift, Share2, Users, XCircle } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useColors } from '@/hooks/useColors';
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

const CARD_RADIUS = 16;

export default function DriverReferralScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();

  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = isRTL ? 'row-reverse' as const : 'row' as const;

  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['driver-referral-info'],
    queryFn: endpoints.driver.referralProgram,
    retry: 1,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCopy = async () => {
    if (!data?.code) return;
    await Clipboard.setStringAsync(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    if (!data?.code) return;
    try {
      await Share.share({ message: t.driver_referral_share_message.replace('{code}', data.code) });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const Header = (
    <View style={[styles.header, { paddingTop: topPad + 8, flexDirection: R, borderBottomColor: colors.border }]}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}>
        <ChevronLeft size={24} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
          {t.driver_referral_title}
        </Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <AppLoader />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <View style={[styles.stateIconWrap, { backgroundColor: 'rgba(232,84,84,0.08)' }]}>
            <XCircle size={34} color={colors.destructive} strokeWidth={1.5} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.foreground, textAlign: 'center', fontFamily: 'Inter_700Bold' }]}>
            {t.driver_referral_load_error}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={[styles.retryText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{t.driver_referral_retry_btn}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!data?.config.enabled) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <View style={[styles.stateIconWrap, { backgroundColor: colors.secondary }]}>
            <Gift size={34} color={colors.mutedForeground} strokeWidth={1.5} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.foreground, textAlign: 'center', fontFamily: 'Inter_700Bold' }]}>
            {t.driver_referral_unavailable_title}
          </Text>
          <Text style={[styles.stateSub, { color: colors.mutedForeground, textAlign: 'center', fontFamily: 'Inter_400Regular' }]}>
            {t.driver_referral_unavailable_sub}
          </Text>
        </View>
      </View>
    );
  }

  const { config, stats, code } = data;
  const rewardPct = Math.round(config.rewardCommissionRate * 100);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {Header}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Spacing.lg, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Code card */}
        <View style={[styles.codeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.codeLabel, { color: colors.mutedForeground, textAlign: 'center', fontFamily: 'Inter_600SemiBold' }]}>
            {t.driver_referral_code_label}
          </Text>
          <Text style={[styles.codeValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{code}</Text>
          <View style={[styles.codeActionsRow, { flexDirection: R }]}>
            <Pressable
              onPress={handleCopy}
              style={({ pressed }) => [styles.codeActionBtn, { backgroundColor: colors.secondary, opacity: pressed ? 0.8 : 1 }]}
            >
              <Copy size={16} color={colors.foreground} strokeWidth={2} />
              <Text style={[styles.codeActionText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {copied ? t.driver_referral_copied : t.driver_referral_copy_btn}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.codeActionBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Share2 size={16} color={colors.primaryForeground} strokeWidth={2} />
              <Text style={[styles.codeActionText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>
                {t.driver_referral_share_btn}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Explainer */}
        <View style={[styles.explainerCard, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '40' }]}>
          <Text style={{ fontSize: 20 }}>🎁</Text>
          <Text style={[styles.explainerText, { color: colors.foreground, textAlign: TA, fontFamily: 'Inter_400Regular' }]}>
            {t.driver_referral_explainer
              .replace('{requiredTrips}', String(config.requiredTrips))
              .replace('{rewardTripsCount}', String(config.rewardTripsCount))
              .replace('{rewardCommissionRate}', String(rewardPct))}
          </Text>
        </View>

        {/* Discounted trips remaining — current active benefit */}
        <View style={[styles.discountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.discountIconWrap, { backgroundColor: '#0d948818' }]}>
            <Gift size={20} color="#0d9488" strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.discountValue, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA }]}>
              {stats.discountedTripsRemaining}
            </Text>
            <Text style={[styles.discountLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
              {t.driver_referral_discounted_label}
            </Text>
          </View>
        </View>

        {/* Stats grid */}
        <View style={[styles.statsRow, { flexDirection: R }]}>
          <StatTile icon={<Users size={16} color={colors.primary} strokeWidth={2} />} value={stats.total} label={t.driver_referral_stat_total} colors={colors} />
          <StatTile value={stats.completed} label={t.driver_referral_stat_completed} colors={colors} accentColor="#0d9488" />
          <StatTile value={stats.pending} label={t.driver_referral_stat_pending} colors={colors} accentColor="#D5B23D" />
        </View>
      </ScrollView>
    </View>
  );
}

function StatTile({
  icon, value, label, colors, accentColor,
}: {
  icon?: React.ReactNode;
  value: number;
  label: string;
  colors: ReturnType<typeof useColors>;
  accentColor?: string;
}) {
  return (
    <View style={[styles.statTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {icon}
      <Text style={[styles.statValue, { color: accentColor ?? colors.foreground, fontFamily: 'Inter_700Bold' }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center', gap: Spacing.md, paddingHorizontal: 20, paddingBottom: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: Spacing.md },
  stateIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  stateTitle: { fontSize: Typography.size.md },
  stateSub: { fontSize: 13, lineHeight: 20 },
  retryBtn: { marginTop: Spacing.sm, paddingHorizontal: 28, paddingVertical: 11, borderRadius: Radius.md },
  retryText: { fontSize: Typography.size.sm },

  codeCard: {
    borderRadius: CARD_RADIUS, borderWidth: 1, padding: Spacing.xl, alignItems: 'center', gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  codeLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  codeValue: { fontSize: Typography.size.xxl, letterSpacing: 1, marginTop: Spacing.xs },
  codeActionsRow: { gap: 10, marginTop: Spacing.lg, width: '100%' },
  codeActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 46, borderRadius: Radius.md,
  },
  codeActionText: { fontSize: 13 },

  explainerCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginTop: Spacing.lg, borderRadius: 14, borderWidth: 1, padding: 14,
  },
  explainerText: { flex: 1, fontSize: 13, lineHeight: 20 },

  discountCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    marginTop: Spacing.lg, borderRadius: CARD_RADIUS, borderWidth: 1, padding: Spacing.lg,
  },
  discountIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  discountValue: { fontSize: 24 },
  discountLabel: { fontSize: Typography.size.xs, marginTop: 2 },

  statsRow: { gap: 10, marginTop: Spacing.lg },
  statTile: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: Spacing.lg, paddingHorizontal: Spacing.sm,
    borderRadius: CARD_RADIUS, borderWidth: 1,
  },
  statValue: { fontSize: 20 },
  statLabel: { fontSize: 11 },
});
