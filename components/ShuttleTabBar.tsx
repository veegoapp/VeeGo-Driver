import { LinearGradient } from 'expo-linear-gradient';
import { Bookmark, CreditCard, GitBranch, Radio, User } from 'lucide-react-native';
import React, { useRef, useEffect, useState } from 'react';
import { Animated, I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useReferral } from '@/lib/referralContext';
import { useI18n } from '@/lib/i18nContext';
import { Animation } from '@/constants/animations';
import { CONTAINER_PX, PILL_PX } from '@/constants/tabBar';

type TabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: { emit: (args: any) => { defaultPrevented: boolean }; navigate: (name: string) => void };
};

const SHUTTLE_TAB_NAMES = [
  { name: 'index', Icon: Radio, key: 'home' as const },
  { name: 'lines', Icon: GitBranch, key: 'routes' as const },
  { name: 'bookings', Icon: Bookmark, key: 'my_bookings' as const },
  { name: 'wallet', Icon: CreditCard, key: 'wallet' as const },
  { name: 'profile', Icon: User, key: 'profile' as const },
] as const;

/** Index of the Home tab in SHUTTLE_TABS — badge is shown here. */
const HOME_TAB_INDEX = 0;

export function ShuttleTabBar({ state, navigation }: TabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language } = useI18n();
  const activeIndex = state.index;
  const [tabWidth, setTabWidth] = useState(0);
  const pillX = useRef(new Animated.Value(0)).current;
  // Native-driven "pop" applied to the newly-active tab's icon only.
  const iconScale = useRef(new Animated.Value(1)).current;
  const initialized = useRef(false);
  // Label cross-fade on language switch — matches BottomTabBar's behavior.
  const labelOpacity = useRef(new Animated.Value(1)).current;

  // Incoming referral badge count — drives the red dot on the Home tab icon
  const { incomingReferralsCount } = useReferral();

  // I18nManager.isRTL is always synchronously correct — it reflects the OS RTL
  // state set by forceRTL() in the *previous* session, so it's ready on the
  // very first render before AsyncStorage loads the language preference.
  const rtl = I18nManager.isRTL;

  const visualIndex = rtl ? SHUTTLE_TAB_NAMES.length - 1 - activeIndex : activeIndex;

  // Language change: fade labels out, let the RTL reflow + new text land, then fade in.
  useEffect(() => {
    Animated.sequence([
      Animated.timing(labelOpacity, { toValue: 0, duration: Animation.duration.instant, useNativeDriver: true }),
      Animated.timing(labelOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [language]);

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
    // Position runs on the native thread via `transform: translateX` (the `left`
    // used above is a static container offset, not animated) for a jump-free slide.
    Animated.spring(pillX, {
      toValue: targetX,
      ...Animation.spring.tabBar,
      useNativeDriver: true,
    }).start();
    // Icon "pop" — the newly active tab's icon springs up from a slightly
    // smaller scale, giving the switch a bit of premium tactile feedback.
    iconScale.setValue(0.85);
    Animated.spring(iconScale, { toValue: 1, ...Animation.spring.tabBar, useNativeDriver: true }).start();
  }, [activeIndex, tabWidth, visualIndex]);

  const bottomPadding = insets.bottom;

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding + 12 }]} pointerEvents="box-none">
      <View
        style={[styles.pill, { backgroundColor: colors.glassStrong, borderColor: colors.border }]}
        onLayout={e => {
          const innerW = e.nativeEvent.layout.width - PILL_PX * 2;
          setTabWidth(innerW / SHUTTLE_TAB_NAMES.length);
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
              colors={colors.gradientPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.activePillGradient}
            />
          </Animated.View>
        )}

        {SHUTTLE_TAB_NAMES.map((item, index) => {
          const isActive = state.index === index;
          const route = state.routes[index];
          const showBadge = index === HOME_TAB_INDEX && incomingReferralsCount > 0;

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
              {/* labelOpacity fades icon+label together on language switch. */}
              <Animated.View style={{ opacity: labelOpacity, alignItems: 'center', gap: 2 }}>
                {/* Icon with optional referral badge */}
                <View style={styles.iconWrap}>
                  <Animated.View style={isActive ? { transform: [{ scale: iconScale }] } : null}>
                    <item.Icon
                      size={20}
                      color={isActive ? colors.primaryForeground : colors.mutedForeground}
                      strokeWidth={2}
                    />
                  </Animated.View>
                  {showBadge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {incomingReferralsCount > 9 ? '9+' : String(incomingReferralsCount)}
                      </Text>
                    </View>
                  )}
                </View>
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
  iconWrap: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    fontSize: 9,
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    lineHeight: 12,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
});
