import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

export type VeeGoBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface VeeGoBadgeProps {
  text: string;
  variant?: VeeGoBadgeVariant;
}

type Colors = ReturnType<typeof useColors>;

function getVariantColors(variant: VeeGoBadgeVariant, colors: Colors) {
  switch (variant) {
    case 'success':
      return { background: `${colors.success}1A`, foreground: colors.success };
    case 'warning':
      return { background: `${colors.warning}1A`, foreground: colors.warning };
    case 'error':
      return { background: `${colors.error}1A`, foreground: colors.error };
    case 'info':
      return { background: `${colors.info}1A`, foreground: colors.info };
    case 'neutral':
    default:
      return { background: colors.muted, foreground: colors.mutedForeground };
  }
}

export function VeeGoBadge({ text, variant = 'neutral' }: VeeGoBadgeProps) {
  const colors = useColors();
  const { background, foreground } = getVariantColors(variant, colors);

  return (
    <View style={[styles.base, { backgroundColor: background }]}>
      <Text style={[styles.text, { color: foreground, fontWeight: Typography.weight.semibold }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    borderRadius: Radius.full,
  },
  text: {
    fontSize: Typography.size.xs,
  },
});
