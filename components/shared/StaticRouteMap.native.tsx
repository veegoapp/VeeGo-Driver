import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { fetchGoogleRoute } from '@/lib/utils/googleDirections';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from '@/constants/mapStyles';

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

const CAIRO: LatLng = { latitude: 30.0444, longitude: 31.2357 };
const DELTA = { latitudeDelta: 0.04, longitudeDelta: 0.04 };

function centroid(points: LatLng[]): LatLng {
  const n = points.length;
  return {
    latitude: points.reduce((s, p) => s + p.latitude, 0) / n,
    longitude: points.reduce((s, p) => s + p.longitude, 0) / n,
  };
}

export function StaticRouteMap({ pickup, dropoff, darkMode = false, style }: StaticRouteMapProps) {
  const center = useMemo(() => {
    const pts = [pickup, dropoff].filter(Boolean) as LatLng[];
    return pts.length > 0 ? centroid(pts) : CAIRO;
  }, [pickup, dropoff]);

  const straightLine = useMemo(() => {
    const pts: LatLng[] = [];
    if (pickup) pts.push(pickup);
    if (dropoff) pts.push(dropoff);
    return pts;
  }, [pickup, dropoff]);

  const [routeCoords, setRouteCoords] = useState<LatLng[]>(straightLine);

  useEffect(() => {
    if (!pickup || !dropoff) {
      setRouteCoords(straightLine);
      return;
    }
    let cancelled = false;
    setRouteCoords(straightLine);
    fetchGoogleRoute(pickup, [dropoff]).then((result) => {
      if (cancelled) return;
      if (result?.coords?.length) setRouteCoords(result.coords);
    });
    return () => { cancelled = true; };
  }, [pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude]);

  return (
    <View style={[StyleSheet.absoluteFillObject, style]}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{ ...center, ...DELTA }}
        showsUserLocation={false}
        showsCompass={false}
        toolbarEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        customMapStyle={darkMode ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
      >
        {pickup && <Marker coordinate={pickup} pinColor="#22c55e" />}
        {dropoff && <Marker coordinate={dropoff} pinColor="#ef4444" />}
        {routeCoords.length >= 2 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#2563eb"
            strokeWidth={3}
            lineDashPattern={[8, 4]}
          />
        )}
      </MapView>
    </View>
  );
}
