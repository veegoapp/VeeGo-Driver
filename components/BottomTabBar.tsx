import { LinearGradient } from 'expo-linear-gradient';
import { BarChart2, Clock, CreditCard, Home, User } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { Animated, I18nManager, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';

type TabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: { emit: (args: any) => { defaultPrevented: boolean }; navigate: (name: string) => void };
};

const TAB_ITEMS = [
  { name: 'index', key: 'drive' as const, Icon: Home },
  { name: 'earnings', key: 'earnings' as const, Icon: BarChart2 },
  { name: 'trips', key: 'trips' as const, Icon: Clock },
  { name: 'wallet', key: 'wallet' as const, Icon: CreditCard },
  { name: 'profile', key: 'profile' as const, Icon: User },
] as const;

const NUM_TABS = TAB_ITEMS.length;
const CONTAINER_PX = 12;
const PILL_PX = 8;

export function BottomTabBar({ state, navigation }: TabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const activeIndex = state.index;
  const [tabWidth, setTabWidth] = useState(0);
  const pillX = useRef(new Animated.Value(0)).current;
  const initialized = useRef(false);

  // I18nManager.isRTL is always synchronously correct — it reflects the OS RTL
  // state set by forceRTL() in the *previous* session, so it's ready on the
  // very first render before AsyncStorage loads the language preference.
  const rtl = I18nManager.isRTL;

  const visualIndex = rtl ? NUM_TABS - 1 - activeIndex : activeIndex;

  useEffect(() => {
    if (tabWidth <= 0) return;
    const targetX = visualIndex * tabWidth;
    if (!initialized.current) {
      // Jump to correct position on first layout — avoids a one-frame flash
      // where the pill sits at 0 before the spring animation fires.
      initialized.current = true;
      pillX.setValue(targetX);
      return;
    }
    Animated.spring(pillX, {
      toValue: targetX,
      stiffness: 380,
      damping: 32,
      useNativeDriver: false,
    }).start();
  }, [activeIndex, tabWidth, visualIndex]);

  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding + 12 }]} pointerEvents="box-none">
      <View
        style={[styles.pill, { backgroundColor: colors.glassStrong, borderColor: colors.border }]}
        onLayout={e => {
          const innerW = e.nativeEvent.layout.width - PILL_PX * 2;
          setTabWidth(innerW / NUM_TABS);
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
              colors={['#2d2d42', '#1e1e28']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.activePillGradient}
            />
          </Animated.View>
        )}

        {TAB_ITEMS.map((item, index) => {
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
              testID={`tab-${item.name}`}
            >
              <item.Icon
                size={20}
                color={isActive ? colors.primaryForeground : colors.mutedForeground}
                strokeWidth={2}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? colors.primaryForeground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' },
                ]}
              >
                {t[item.key]}
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
  activePillGradient: {
    flex: 1,
  },
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
