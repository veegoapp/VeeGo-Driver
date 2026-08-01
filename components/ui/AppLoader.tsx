import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Navigation } from 'lucide-react-native';

// Navy colour that matches the ride-request card's primary dark shade.
const LOADER_COLOR = '#2d2d42';

interface AppLoaderProps {
  /** Icon size in dp. Defaults to 96 (≈ double the old flying-arrow icon). */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Full-screen-safe loading indicator.
 *
 * Renders a Navigation icon centred in its container that breathes
 * (opacity + scale pulse) instead of flying across the screen.
 * Drop it inside any View that already has `alignItems/justifyContent: center`,
 * or use the `style` prop to position it.
 */
export function AppLoader({ size = 96, style }: AppLoaderProps) {
  const opacity = useRef(new Animated.Value(0.18)).current;
  const scale   = useRef(new Animated.Value(0.82)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        // Glow in
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        // Fade out
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.18,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.82,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, scale]);

  return (
    <View style={[styles.wrapper, style]}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Navigation size={size} color={LOADER_COLOR} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
