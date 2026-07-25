import { StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

export type VeeGoBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface VeeGoBadgeProps {
  text: string;
  variant?: VeeGoBadgeVariant;
  /** Extra style merged onto the badge text (added after the variant text color). */
  textStyle?: StyleProp<TextStyle>;
  /** Overrides the variant's background color. */
  backgroundColor?: string;
  /** Adds a 1px border in this color. No border is drawn unless this is set. */
  borderColor?: string;
  /** Overrides the variant's text color. */
  textColor?: string;
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

export function VeeGoBadge({ text, variant = 'neutral', textStyle, backgroundColor, borderColor, textColor }: VeeGoBadgeProps) {
  const colors = useColors();
  const { background, foreground } = getVariantColors(variant, colors);

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: backgroundColor ?? background },
        borderColor ? { borderWidth: 1, borderColor } : null,
      ]}
    >
      <Text
        style={[styles.text, { color: textColor ?? foreground, fontWeight: Typography.weight.semibold }, textStyle]}
      >
        {text}
      </Text>
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
