import { ChevronRight, Users } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { type ShuttleLine, formatDate } from '@/lib/shuttleContext';
import { useSplitColors, type SplitColors } from '@/lib/splitTheme';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

// One card per individual trip (not per weekly booking) — each trip has its
// own date, passengers, and activation status, so each gets its own card.
// Split-panel (C) layout: dark left rail carries the departure identity
// (time + from/to), the light right block carries route details + status.
export function UpcomingTripCard({
  line,
  colors,
  isRTL,
  onPress,
}: {
  line: ShuttleLine;
  colors: ReturnType<typeof useColors>;
  isRTL: boolean;
  onPress: () => void;
}) {
  const { t, language } = useI18n();
  const S = useSplitColors();
  const styles = useMemo(() => makeStyles(S), [S]);
  // Matches the locale convention already used in history.tsx/history-detail.tsx.
  const dateLocale = language === 'ar' ? 'ar-EG' : 'en-GB';
  const TA = isRTL ? 'right' as const : 'left' as const;
  const R = 'row' as const;
  // Only a confirmed thresholdMet === true counts as "Active" — when the
  // field is simply absent from the response, that used to fall through to
  // the green "Active" badge on a trip that hasn't actually met its minimum
  // and may still auto-cancel. Default to the safer "pending" state instead.
  const isPending = line.thresholdMet !== true;
  const statusColor = isPending ? '#F5A623' : S.teal;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
    >
      <View style={styles.card}>
        {/* Dark left rail — departure identity */}
        <View style={styles.rail}>
          <View style={[styles.statusRow, { flexDirection: R }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusLabel, { color: statusColor, fontFamily: 'Inter_800ExtraBold' }]}>
              {(isPending ? t.status_pending : t.active).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.railCap, { fontFamily: 'Inter_700Bold' }]}>{t.departure_time_label.toUpperCase()}</Text>
          <Text style={[styles.railTime, { fontFamily: 'Inter_800ExtraBold' }]} numberOfLines={1}>
            {line.departure}
          </Text>
          <Text style={[styles.railDate, { fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
            {formatDate(line.departureIso, dateLocale)}
          </Text>
          <View style={styles.railRoute}>
            <View style={[styles.railRouteRow, { flexDirection: R }]}>
              <View style={[styles.railDotFilled, { backgroundColor: S.teal }]} />
              <Text style={[styles.railRouteText, { color: '#C7CBD3', fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                {line.from}
              </Text>
            </View>
            <View style={styles.railConnector} />
            <View style={[styles.railRouteRow, { flexDirection: R }]}>
              <View style={styles.railDotHollow} />
              <Text style={[styles.railRouteText, { color: S.capOnDark, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                {line.to}
              </Text>
            </View>
          </View>
        </View>

        {/* Light right block — route details + status */}
        <View style={styles.body}>
          <Text style={[styles.routeName, { color: S.ink, fontFamily: 'Inter_800ExtraBold', textAlign: TA }]} numberOfLines={1}>
            {line.name}
          </Text>
          {!!line.direction && (
            <Text style={[styles.direction, { color: S.cap, fontFamily: 'Inter_600SemiBold', textAlign: TA }]} numberOfLines={1}>
              {line.direction === 'outbound' ? t.direction_outbound
                : line.direction === 'return' ? t.direction_return
                : line.direction}
            </Text>
          )}
          {line.vehicleType !== 'Unknown' && (
            <View style={[styles.vehicleBadge, { flexDirection: R, backgroundColor: S.surfaceMuted }]}>
              <Text style={[styles.vehicleBadgeText, { color: S.ink, fontFamily: 'Inter_600SemiBold' }]}>
                {line.vehicleType} · {line.lineNumber}
              </Text>
            </View>
          )}
          {line.totalSeats > 0 && (
            <View style={[styles.paxBarWrap, { flexDirection: R }]}>
              <View style={[styles.paxBarTrack, { backgroundColor: S.surfaceMuted }]}>
                <View
                  style={[
                    styles.paxBarFill,
                    {
                      width: `${Math.min(100, Math.round((line.bookedSeats / line.totalSeats) * 100))}%` as any,
                      backgroundColor: statusColor,
                    },
                  ]}
                />
              </View>
              <View style={[styles.paxLabelRow, { flexDirection: R }]}>
                <Users size={11} color={S.cap} strokeWidth={2} />
                <Text style={[styles.paxBarLabel, { color: S.cap, fontFamily: 'Inter_600SemiBold' }]}>
                  {line.bookedSeats}/{line.totalSeats}
                </Text>
              </View>
            </View>
          )}
          <View style={[styles.footerRow, { flexDirection: R }]}>
            <View />
            <ChevronRight size={16} color={S.cap} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
    card: { flexDirection: 'row', backgroundColor: S.card, borderRadius: Radius.lg + 2, overflow: 'hidden' },
    rail: { width: 128, flexShrink: 0, backgroundColor: S.panel, padding: 14 },
    statusRow: { alignItems: 'center', gap: 5 },
    statusDot: { width: 5, height: 5, borderRadius: 3 },
    statusLabel: { fontSize: 9, letterSpacing: 0.5 },
    railCap: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: S.capOnDark, marginTop: 10 },
    railTime: { fontSize: 20, color: '#fff', marginTop: 2 },
    railDate: { fontSize: 11, color: S.capOnDark, marginTop: 2 },
    railRoute: { marginTop: 12 },
    railRouteRow: { alignItems: 'center', gap: 6 },
    railDotFilled: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
    railDotHollow: { width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: S.capOnDark, flexShrink: 0 },
    railRouteText: { fontSize: 10, flexShrink: 1 },
    railConnector: { width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.18)', marginLeft: 2.5, marginVertical: 1 },
    body: { flex: 1, minWidth: 0, padding: 14 },
    routeName: { fontSize: Typography.size.sm },
    direction: { fontSize: Typography.size.xs, marginTop: 2 },
    vehicleBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: Spacing.xs, borderRadius: Radius.sm, marginTop: 8 },
    vehicleBadgeText: { fontSize: 11, letterSpacing: 0.5 },
    paxBarWrap: { alignItems: 'center', gap: 8, marginTop: 10 },
    paxBarTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
    paxBarFill: { height: '100%', borderRadius: 3 },
    paxLabelRow: { alignItems: 'center', gap: 3, flexShrink: 0 },
    paxBarLabel: { fontSize: 10 },
    footerRow: { alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  });
}
