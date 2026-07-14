import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GlassView } from '@/components/GlassView';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

type TimelineStation = {
  id: string | number;
  name: string;
  eta?: string;
};

type TimelineColors = {
  border: string;
  secondary: string;
  foreground: string;
  mutedForeground: string;
};

// Extracted verbatim from the duplicated station-timeline JSX in
// app/shuttle/history-detail.tsx and app/shuttle/trip-details.tsx.
// Preserves the exact structure, styles, rendering conditions, and RTL
// behavior of both original blocks.
export function StationTimeline({
  stations,
  colors,
  R,
  TA,
  t,
}: {
  stations: TimelineStation[];
  colors: TimelineColors;
  R: 'row' | 'row-reverse';
  TA: 'left' | 'right';
  t: { from: string; to: string };
}) {
  return (
    <GlassView style={{ marginTop: Spacing.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg }} borderRadius={16}>
      {stations.map((st, idx) => (
        <View
          key={String(st.id)}
          style={[
            styles.stationRow,
            { flexDirection: R },
            idx < stations.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
          ]}
        >
          {/* Timeline indicator */}
          <View style={styles.stationIndicator}>
            <View style={[
              styles.stationDot,
              {
                backgroundColor: idx === 0 || idx === stations.length - 1 ? '#1e1e28' : colors.secondary,
                borderColor: '#1e1e2840',
              },
            ]} />
            {idx < stations.length - 1 && (
              <View style={[styles.stationLine, { backgroundColor: colors.border }]} />
            )}
          </View>

          {/* Station name + ETA */}
          <View style={{ flex: 1, paddingVertical: Spacing.md }}>
            <Text style={[{ fontSize: Typography.size.sm, color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: TA }]}>
              {st.name}
            </Text>
            {st.eta ? (
              <Text style={[{ fontSize: Typography.size.xs, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: TA }]}>
                {st.eta}
              </Text>
            ) : null}
          </View>

          {/* Terminal badge */}
          {(idx === 0 || idx === stations.length - 1) && (
            <View style={[
              styles.terminalBadge,
              {
                backgroundColor: idx === 0 ? '#1e1e2812' : '#dcfce7',
                borderColor: idx === 0 ? '#1e1e2825' : '#86efac',
              },
            ]}>
              <Text style={[{ fontSize: 10, fontFamily: 'Inter_700Bold', color: idx === 0 ? '#2d2d42' : '#16a34a' }]}>
                {idx === 0 ? t.from.toUpperCase() : t.to.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      ))}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  stationRow: { gap: Spacing.md, alignItems: 'flex-start' },
  stationIndicator: { width: 20, alignItems: 'center', paddingTop: 14 },
  stationDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  stationLine: { width: 2, flex: 1, minHeight: 16, marginTop: Spacing.xs },
  terminalBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'center',
  },
});
