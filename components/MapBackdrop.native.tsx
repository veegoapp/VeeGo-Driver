import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';

export interface MapBackdropProps {
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
  driverLocation?: { latitude: number; longitude: number };
}

const CAIRO = { latitude: 30.0444, longitude: 31.2357 };
const DELTA = { latitudeDelta: 0.06, longitudeDelta: 0.06 };
const OSM_TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function centroid(pts: Array<{ latitude: number; longitude: number }>) {
  const n = pts.length;
  return {
    latitude: pts.reduce((s, p) => s + p.latitude, 0) / n,
    longitude: pts.reduce((s, p) => s + p.longitude, 0) / n,
  };
}

export function MapBackdrop({ pickup, dropoff, driverLocation }: MapBackdropProps) {
  const center = useMemo(() => {
    const pts = [pickup, dropoff, driverLocation].filter(
      (p): p is { latitude: number; longitude: number } => !!p
    );
    return pts.length > 0 ? centroid(pts) : CAIRO;
  }, [pickup, dropoff, driverLocation]);

  const routeCoords = useMemo(() => {
    const pts: Array<{ latitude: number; longitude: number }> = [];
    if (driverLocation) pts.push(driverLocation);
    if (pickup) pts.push(pickup);
    if (dropoff) pts.push(dropoff);
    return pts;
  }, [pickup, dropoff, driverLocation]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={{ ...center, ...DELTA }}
        region={{ ...center, ...DELTA }}
        mapType="none"
        showsUserLocation={false}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        pointerEvents="none"
      >
        <UrlTile
          urlTemplate={OSM_TILE}
          maximumZ={19}
          flipY={false}
        />

        {pickup && (
          <Marker coordinate={pickup} title="Pickup" pinColor="#22c55e" />
        )}

        {dropoff && (
          <Marker coordinate={dropoff} title="Dropoff" pinColor="#ef4444" />
        )}

        {driverLocation && (
          <Marker coordinate={driverLocation} title="You" pinColor="#2563eb" />
        )}

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
