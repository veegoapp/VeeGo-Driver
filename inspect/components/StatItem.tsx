import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Typography } from '@/constants/typography';

// Extracted verbatim from app/(shuttle)/home.tsx — pure presentational
// single stat cell used in the stats row on the home screen.
export function StatItem({
  label, value, highlight, colors,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
      <Text style={[styles.statValue, { color: highlight ? '#2d2d42' : colors.foreground, fontFamily: 'Inter_700Bold' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  statValue: { fontSize: Typography.size.sm, marginTop: 2 },
});
