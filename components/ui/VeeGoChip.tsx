import { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

export interface VeeGoChipProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
}

export function VeeGoChip({ label, selected = false, disabled = false, onPress, icon }: VeeGoChipProps) {
  const colors = useColors();
  const { isRTL } = useI18n();

  const backgroundColor = selected ? colors.primary : colors.muted;
  const textColor = selected ? colors.primaryForeground : colors.foreground;
  const borderColor = selected ? colors.primary : colors.border;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.8}
      style={[
        styles.base,
        {
          flexDirection: isRTL ? 'row-reverse' : 'row',
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.text, { color: textColor, fontWeight: Typography.weight.medium }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: Typography.size.xs,
  },
});
