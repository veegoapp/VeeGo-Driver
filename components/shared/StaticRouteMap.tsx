// Web stub — StaticRouteMap is native-only (react-native-maps).
// This file exists solely so TypeScript can resolve the import on the web
// target; it is never rendered in native builds (Metro picks .native.tsx first).
import React from 'react';
import { View } from 'react-native';

interface LatLng {
  latitude: number;
  longitude: number;
}

interface StaticRouteMapProps {
  pickup?: LatLng;
  dropoff?: LatLng;
  darkMode?: boolean;
  style?: object;
}

export function StaticRouteMap(_props: StaticRouteMapProps) {
  return <View />;
}
