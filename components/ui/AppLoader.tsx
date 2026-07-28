import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, View, ViewStyle } from 'react-native';
import { Navigation } from 'lucide-react-native';

interface AppLoaderProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

// Same motion as the splash icon's flying arrow, scaled to whatever size
// this instance is asked for. No card background here (unlike the splash
// icon) since AppLoader is dropped into all kinds of surfaces — buttons,
// light cards, dark cards — so it stays a transparent, clipped travel box:
// the arrow simply isn't drawn outside it, entering at the bottom-left
// corner and exiting at the top-right corner of whatever `size` is given.
const ICON_RATIO = 35 / 80;
const MARGIN_RATIO = 0.7;
const DIAG = Math.SQRT1_2;
const DURATION = 2370;

export function AppLoader({ size = 120, style }: AppLoaderProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [progress]);

  const iconSize = size * ICON_RATIO;
  const margin = size * MARGIN_RATIO;
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-DIAG * margin - iconSize / 2, size + DIAG * margin - iconSize / 2],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [size + DIAG * margin - iconSize / 2, -DIAG * margin - iconSize / 2],
  });

  return (
    <View style={[{ width: size, height: size, overflow: 'hidden' }, style]}>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, transform: [{ translateX }, { translateY }] }}>
        <Navigation size={iconSize} color="#55c49a" />
      </Animated.View>
    </View>
  );
}
