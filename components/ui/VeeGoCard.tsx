import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';

export type VeeGoCardVariant = 'elevated' | 'flat' | 'outlined';

export interface VeeGoCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: VeeGoCardVariant;
}

type Colors = ReturnType<typeof useColors>;

function getVariantStyle(variant: VeeGoCardVariant, colors: Colors) {
  switch (variant) {
    case 'flat':
      return { backgroundColor: colors.surface };
    case 'outlined':
      return { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border };
    case 'elevated':
    default:
      return { backgroundColor: colors.surface, ...Shadows.medium };
  }
}

export function VeeGoCard({ children, style, variant = 'elevated' }: VeeGoCardProps) {
  const colors = useColors();
  const variantStyle = getVariantStyle(variant, colors);

  return <View style={[styles.base, variantStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
});
