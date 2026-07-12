import { LinearGradient } from 'expo-linear-gradient';
import { BarChart2, Clock, CreditCard, Home, User } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { Animation } from '@/constants/animations';

type TabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: { emit: (args: any) => { defaultPrevented: boolean }; navigate: (name: string) => void };
};

const TAB_ITEMS = [
  { name: 'home', key: 'drive' as const, Icon: Home },
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
  const { t, language } = useI18n();

  const pillX = useRef(new Animated.Value(0)).current;
  const pillW = useRef(new Animated.Value(0)).current;
  const [pillReady, setPillReady] = useState(false);

  const tabWidths = useRef<number[]>([]);
  const tabOffsets = useRef<number[]>([]);
  const layoutGen = useRef(0);
  const tabMeasureGen = useRef<number[]>([]);
  const labelOpacity = useRef(new Animated.Value(1)).current;

  const animatePill = (index: number) => {
    const tx = tabOffsets.current[index];
    const tw = tabWidths.current[index];
    if (tx === undefined || !(tw > 0)) return;
    Animated.parallel([
      Animated.spring(pillX, { toValue: tx, ...Animation.spring.tabBar, useNativeDriver: false }),
      Animated.spring(pillW, { toValue: tw, ...Animation.spring.tabBar, useNativeDriver: false }),
    ]).start();
  };

  // Language change: bump generation and fade labels
  useEffect(() => {
    layoutGen.current += 1;
    Animated.sequence([
      Animated.timing(labelOpacity, { toValue: 0, duration: Animation.duration.instant, useNativeDriver: true }),
      Animated.timing(labelOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [language]);

  // Active tab change: animate pill
  useEffect(() => {
    if (!pillReady) return;
    animatePill(state.index);
  }, [state.index, pillReady]);

  const handleLayout = (i: number, x: number, w: number) => {
    tabWidths.current[i] = w;
    tabOffsets.current[i] = x;
    tabMeasureGen.current[i] = layoutGen.current;

    const currentGen = layoutGen.current;
    const allFresh = TAB_ITEMS.every((_, idx) => tabMeasureGen.current[idx] === currentGen);
    if (!allFresh) return;

    const tx = tabOffsets.current[state.index];
    const tw = tabWidths.current[state.index];
    if (tx === undefined || !(tw > 0)) return;

    if (!pillReady) {
      pillX.setValue(tx);
      pillW.setValue(tw);
      setPillReady(true);
    } else {
      animatePill(state.index);
    }
  };

  const bottomPadding = insets.bottom;

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding + 12 }]} pointerEvents="box-none">
      <View style={[styles.pill, { backgroundColor: colors.glassStrong, borderColor: colors.border }]}>

        {pillReady && (
          <Animated.View
            style={[styles.activePill, { width: pillW, transform: [{ translateX: pillX }] }]}
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
              onLayout={e => {
                const { x, width } = e.nativeEvent.layout;
                handleLayout(index, x, width);
              }}
            >
              <Animated.View
                style={{ alignItems: 'center', justifyContent: 'center', gap: 2, opacity: labelOpacity }}
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
              </Animated.View>
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
    left: 0,
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
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
});
