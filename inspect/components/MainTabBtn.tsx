import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

// Extracted verbatim from app/(shuttle)/bookings.tsx — pure presentational
// tab button, no behavior change.
export function MainTabBtn({
  label, count, active, onPress, colors,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.mainTabBtn,
        active && [styles.mainTabBtnActive, { borderBottomColor: colors.primary }],
      ]}
    >
      <Text
        style={[
          styles.mainTabLabel,
          { color: active ? colors.primary : colors.mutedForeground },
          active ? { fontFamily: 'Inter_700Bold' } : { fontFamily: 'Inter_400Regular' },
        ]}
      >
        {label}
      </Text>
      {count > 0 && (
        <View
          style={[
            styles.tabBadge,
            { backgroundColor: active ? colors.primary : colors.secondary },
          ]}
        >
          <Text
            style={[
              styles.tabBadgeText,
              { color: active ? '#fff' : colors.mutedForeground },
            ]}
          >
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mainTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 10,
  },
  mainTabBtnActive: {
    borderBottomWidth: 2,
    marginBottom: -1,
  },
  mainTabLabel: { fontSize: 13 },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
});
