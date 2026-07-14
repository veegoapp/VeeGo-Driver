// Web / TypeScript-resolution stub for MapBackdrop.
// The real Google Maps implementation is MapBackdrop.native.tsx.
// This file exists only so TypeScript can resolve the module on non-native targets.
// No map logic lives here.

import React from 'react';
import { View } from 'react-native';

export interface SurgeZone {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
  multiplier: number;
}

export interface MapBackdropProps {
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
  driverLocation?: { latitude: number; longitude: number; heading?: number | null; speed?: number | null };
  surgeZones?: SurgeZone[];
  routePolyline?: Array<{ latitude: number; longitude: number }>;
  roadPolyline?: Array<{ latitude: number; longitude: number }>;
  stationStatuses?: ('pending' | 'current' | 'completed')[];
  approachCircle?: { latitude: number; longitude: number; radius: number } | null;
  focusTarget?: { latitude: number; longitude: number; zoom?: number } | null;
  navigationMode?: boolean;
  animDurationMs?: number;
}

// No-op on web — native target uses MapBackdrop.native.tsx automatically.
export function MapBackdrop(_props: MapBackdropProps): React.ReactElement {
  return <View style={{ flex: 1 }} />;
}
