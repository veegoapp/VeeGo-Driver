import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

export interface MapBackdropProps {
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
  driverLocation?: { latitude: number; longitude: number };
}

const DEFAULT_CENTER: [number, number] = [31.2357, 30.0444];

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

async function fetchOSRMRoute(coords: [number, number][]): Promise<[number, number][] | null> {
  if (coords.length < 2) return null;
  try {
    const c = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${c}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    return data.routes[0].geometry.coordinates as [number, number][];
  } catch {
    return null;
  }
}

function makeSvgEl(svg: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = svg;
  return el;
}

const PICKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
  <circle cx="14" cy="14" r="12" fill="#22c55e" stroke="white" stroke-width="2.5"/>
  <text x="14" y="18.5" text-anchor="middle" fill="white" font-size="11"
    font-family="sans-serif" font-weight="bold">P</text>
  <line x1="14" y1="26" x2="14" y2="34" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const DROPOFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
  <circle cx="14" cy="14" r="12" fill="#ef4444" stroke="white" stroke-width="2.5"/>
  <text x="14" y="18.5" text-anchor="middle" fill="white" font-size="11"
    font-family="sans-serif" font-weight="bold">D</text>
  <line x1="14" y1="26" x2="14" y2="34" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const DRIVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46">
  <circle cx="19" cy="19" r="17" fill="#2563eb" opacity="0.18"/>
  <circle cx="19" cy="19" r="13" fill="#2563eb" stroke="white" stroke-width="2.5"/>
  <path d="M12 17.5 h14 M15 14 l4 3.5 l4-3.5 M13 21 c0 2.5 2.8 4.5 6 4.5s6-2 6-4.5"
    stroke="white" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <line x1="19" y1="32" x2="19" y2="44" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;

export function MapBackdrop({ pickup, dropoff, driverLocation }: MapBackdropProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const lastLocUpdate = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const pts = [driverLocation, pickup, dropoff].filter(Boolean) as Array<{ latitude: number; longitude: number }>;
    const center: [number, number] = pts.length
      ? [pts.reduce((s, p) => s + p.longitude, 0) / pts.length, pts.reduce((s, p) => s + p.latitude, 0) / pts.length]
      : DEFAULT_CENTER;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center,
      zoom: 13,
      interactive: true,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', async () => {
      if (pickup) {
        new maplibregl.Marker({ element: makeSvgEl(PICKUP_SVG), anchor: 'bottom' })
          .setLngLat([pickup.longitude, pickup.latitude])
          .setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setText('Pickup'))
          .addTo(map);
      }

      if (dropoff) {
        new maplibregl.Marker({ element: makeSvgEl(DROPOFF_SVG), anchor: 'bottom' })
          .setLngLat([dropoff.longitude, dropoff.latitude])
          .setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setText('Dropoff'))
          .addTo(map);
      }

      const driverLoc = driverLocation ?? pickup;
      if (driverLoc) {
        const marker = new maplibregl.Marker({ element: makeSvgEl(DRIVER_SVG), anchor: 'bottom' })
          .setLngLat([driverLoc.longitude, driverLoc.latitude])
          .setPopup(new maplibregl.Popup({ offset: 22, closeButton: false }).setText('Your location'))
          .addTo(map);
        driverMarkerRef.current = marker;
      }

      const routePts = [driverLocation ?? pickup, pickup, dropoff]
        .filter(Boolean) as Array<{ latitude: number; longitude: number }>;

      if (routePts.length >= 2) {
        const straightCoords = routePts.map((p) => [p.longitude, p.latitude] as [number, number]);
        const routeCoords = (await fetchOSRMRoute(straightCoords)) ?? straightCoords;

        map.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords }, properties: {} },
        });
        map.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.4 },
        });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#6366f1', 'line-width': 3.5, 'line-opacity': 0.9 },
        });
      }

      const allPoints = [driverLocation, pickup, dropoff].filter(Boolean) as Array<{ latitude: number; longitude: number }>;
      if (allPoints.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        allPoints.forEach((p) => bounds.extend([p.longitude, p.latitude]));
        map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 600 });
      }
    });

    return () => {
      driverMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    if (now - lastLocUpdate.current < 1500) return;
    lastLocUpdate.current = now;
    if (!driverLocation || !driverMarkerRef.current) return;
    driverMarkerRef.current.setLngLat([driverLocation.longitude, driverLocation.latitude]);
  }, [driverLocation?.latitude, driverLocation?.longitude]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* @ts-ignore — plain div is valid in Expo Web (browser context) */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}
