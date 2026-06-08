import { LinearGradient } from 'expo-linear-gradient';
import { Bookmark, CreditCard, GitBranch, Radio, User } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type TabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: { emit: (args: any) => { defaultPrevented: boolean }; navigate: (name: string) => void };
};

const SHUTTLE_TABS = [
  { name: 'index', label: 'Home', Icon: Radio },
  { name: 'lines', label: 'Lines', Icon: GitBranch },
  { name: 'bookings', label: 'Bookings', Icon: Bookmark },
  { name: 'wallet', label: 'Wallet', Icon: CreditCard },
  { name: 'profile', label: 'Profile', Icon: User },
] as const;

const CONTAINER_PX = 12;
const PILL_PX = 8;

export function ShuttleTabBar({ state, navigation }: TabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const activeIndex = state.index;
  const [tabWidth, setTabWidth] = useState(0);
  const pillX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (tabWidth <= 0) return;
    Animated.spring(pillX, {
      toValue: activeIndex * tabWidth,
      stiffness: 380,
      damping: 32,
      useNativeDriver: false,
    }).start();
  }, [activeIndex, tabWidth]);

  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding + 12 }]} pointerEvents="box-none">
      <View
        style={[styles.pill, { backgroundColor: colors.glassStrong, borderColor: colors.border }]}
        onLayout={e => {
          const innerW = e.nativeEvent.layout.width - PILL_PX * 2;
          setTabWidth(innerW / SHUTTLE_TABS.length);
        }}
      >
        {tabWidth > 0 && (
          <Animated.View
            style={[styles.activePill, {
              width: tabWidth,
              transform: [{ translateX: pillX }],
              left: PILL_PX,
            }]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={['#1e1e28', '#1e1e28']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.activePillGradient}
            />
          </Animated.View>
        )}

        {SHUTTLE_TABS.map((item, index) => {
          const isActive = state.index === index;
          const route = state.routes[index];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route?.key,
              canPreventDefault: true,
            });
            if (!isActive && !event.defaultPrevented) {
              navigation.navigate(item.name);
            }
          };

          return (
            <Pressable
              key={item.name}
              style={styles.tabItem}
              onPress={onPress}
              testID={`shuttle-tab-${item.name}`}
            >
              <item.Icon
                size={20}
                color={isActive ? '#fff' : colors.mutedForeground}
                strokeWidth={2}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? '#fff' : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: CONTAINER_PX,
    paddingTop: 8,
  },
  pill: {
    flexDirection: 'row',
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: PILL_PX,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    position: 'relative',
  },
  activePill: {
    position: 'absolute',
    top: PILL_PX,
    bottom: PILL_PX,
    borderRadius: 16,
    overflow: 'hidden',
  },
  activePillGradient: { flex: 1 },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
});
