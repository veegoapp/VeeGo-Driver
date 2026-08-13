import { useRef } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

interface AppLoaderProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function AppLoader({ size = 84, style }: AppLoaderProps) {
  const ref = useRef<LottieView>(null);

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <LottieView
        ref={ref}
        source={require('@/assets/animations/veego-loader.json')}
        autoPlay
        loop
        style={{ width: size, height: size }}
      />
    </View>
  );
}
