import { ReactNode } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadows } from '@/constants/shadows';

export type VeeGoButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type VeeGoButtonSize = 'small' | 'medium' | 'large';

export interface VeeGoButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  variant?: VeeGoButtonVariant;
  size?: VeeGoButtonSize;
  style?: StyleProp<ViewStyle>;
}

type Colors = ReturnType<typeof useColors>;

const SIZE_CONFIG: Record<VeeGoButtonSize, { height: number; paddingHorizontal: number; fontSize: number }> = {
  small: { height: 36, paddingHorizontal: Spacing.md, fontSize: Typography.size.xs },
  medium: { height: 48, paddingHorizontal: Spacing.lg, fontSize: Typography.size.sm },
  large: { height: 56, paddingHorizontal: Spacing.xl, fontSize: Typography.size.md },
};

function getVariantStyle(variant: VeeGoButtonVariant, colors: Colors) {
  switch (variant) {
    case 'primary':
      return {
        container: { backgroundColor: colors.primary, ...Shadows.small },
        text: { color: colors.primaryForeground },
      };
    case 'secondary':
      return {
        container: { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border },
        text: { color: colors.secondaryForeground },
      };
    case 'danger':
      return {
        container: { backgroundColor: colors.destructive, ...Shadows.small },
        text: { color: colors.destructiveForeground },
      };
    case 'ghost':
      return {
        container: { backgroundColor: 'transparent' as const },
        text: { color: colors.primary },
      };
  }
}

export function VeeGoButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  icon,
  variant = 'primary',
  size = 'medium',
  style,
}: VeeGoButtonProps) {
  const colors = useColors();
  const { isRTL } = useI18n();
  const isDisabled = disabled || loading;
  const sizeConfig = SIZE_CONFIG[size];
  const variantStyle = getVariantStyle(variant, colors);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.base,
        {
          height: sizeConfig.height,
          paddingHorizontal: sizeConfig.paddingHorizontal,
          borderRadius: Radius.lg,
          flexDirection: isRTL ? 'row-reverse' : 'row',
          opacity: isDisabled ? 0.5 : 1,
        },
        variantStyle.container,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyle.text.color as string} />
      ) : (
        <>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text
            style={[
              styles.text,
              { fontSize: sizeConfig.fontSize, fontWeight: Typography.weight.semibold },
              variantStyle.text,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
  },
});
