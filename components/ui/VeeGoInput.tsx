import { ReactNode, useState } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';

export interface VeeGoInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  disabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
}

export function VeeGoInput({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  disabled = false,
  leftIcon,
  rightIcon,
  style,
  secureTextEntry,
  keyboardType,
}: VeeGoInputProps) {
  const colors = useColors();
  const { isRTL } = useI18n();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.error : focused ? colors.primary : colors.border;

  return (
    <View style={[styles.wrap, style]}>
      {label ? (
        <Text
          style={[
            styles.label,
            { color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left', fontWeight: Typography.weight.medium },
          ]}
        >
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputRow,
          {
            flexDirection: isRTL ? 'row-reverse' : 'row',
            backgroundColor: colors.muted,
            borderColor,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {leftIcon ? <View style={styles.iconSlot}>{leftIcon}</View> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          editable={!disabled}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          textAlign={isRTL ? 'right' : 'left'}
          style={[styles.input, { color: colors.foreground, fontSize: Typography.size.sm }]}
        />
        {rightIcon ? <View style={styles.iconSlot}>{rightIcon}</View> : null}
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.error, textAlign: isRTL ? 'right' : 'left' }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: Typography.size.xs,
  },
  inputRow: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    height: 52,
    gap: Spacing.sm,
  },
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
  },
  error: {
    fontSize: Typography.size.xs,
  },
});
