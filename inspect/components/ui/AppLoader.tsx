import LottieView from 'lottie-react-native';
import { StyleProp, ViewStyle } from 'react-native';

interface AppLoaderProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function AppLoader({ size = 120, style }: AppLoaderProps) {
  return (
    <LottieView
      source={require('@/assets/animations/veego-loader.json')}
      autoPlay
      loop
      style={[{ width: size, height: size }, style]}
    />
  );
}
