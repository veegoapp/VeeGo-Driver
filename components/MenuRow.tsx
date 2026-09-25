import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

// Extracted verbatim from app/(shuttle)/profile.tsx — pure presentational
// menu list row with icon, label, optional sub-label, and chevron.
export function MenuRow({
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

const styles = StyleSheet.create({
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
});
