import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

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
  driverLocation?: { latitude: number; longitude: number };
  surgeZones?: SurgeZone[];
  routePolyline?: Array<{ latitude: number; longitude: number }>;
  stationStatuses?: ('pending' | 'current' | 'completed')[];
  approachCircle?: { latitude: number; longitude: number; radius: number } | null;
  focusTarget?: { latitude: number; longitude: number; zoom?: number } | null;
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
      { signal: AbortSignal.timeout(8000) }
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

function stationSvg(n: number, status: 'pending' | 'current' | 'completed'): string {
  if (status === 'current') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="17" fill="rgba(245,158,11,0.25)"/>
  <circle cx="20" cy="20" r="13" fill="#f59e0b" stroke="white" stroke-width="3"/>
  <text x="20" y="25" text-anchor="middle" fill="white" font-size="12" font-family="sans-serif" font-weight="bold">${n}</text>
</svg>`;
  }
  if (status === 'completed') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="#374151" stroke="#6b7280" stroke-width="2"/>
  <text x="12" y="16" text-anchor="middle" fill="#9ca3af" font-size="9" font-family="sans-serif" font-weight="bold">${n}</text>
</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <circle cx="14" cy="14" r="12" fill="#1e1e28" stroke="white" stroke-width="2.5"/>
  <text x="14" y="18.5" text-anchor="middle" fill="white" font-size="10" font-family="sans-serif" font-weight="bold">${n}</text>
</svg>`;
}

const PICKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
  <circle cx="14" cy="14" r="12" fill="#22c55e" stroke="white" stroke-width="2.5"/>
  <text x="14" y="18.5" text-anchor="middle" fill="white" font-size="11" font-family="sans-serif" font-weight="bold">P</text>
  <line x1="14" y1="26" x2="14" y2="34" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const DROPOFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
  <circle cx="14" cy="14" r="12" fill="#ef4444" stroke="white" stroke-width="2.5"/>
  <text x="14" y="18.5" text-anchor="middle" fill="white" font-size="11" font-family="sans-serif" font-weight="bold">D</text>
  <line x1="14" y1="26" x2="14" y2="34" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const DRIVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46">
  <circle cx="19" cy="19" r="17" fill="#2563eb" opacity="0.18"/>
  <circle cx="19" cy="19" r="13" fill="#2563eb" stroke="white" stroke-width="2.5"/>
  <path d="M12 17.5 h14 M15 14 l4 3.5 l4-3.5 M13 21 c0 2.5 2.8 4.5 6 4.5s6-2 6-4.5"
    stroke="white" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <line x1="19" y1="32" x2="19" y2="44" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;

function geoCirclePolygon(lat: number, lng: number, radiusMeters: number, steps = 64): number[][] {
  const coords: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    const dLat = dy / 111320;
    const dLng = dx / (111320 * Math.cos((lat * Math.PI) / 180));
    coords.push([lng + dLng, lat + dLat]);
  }
  return coords;
}

function buildSurgeGeoJSON(zones: SurgeZone[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature' as const,
      id: z.id,
      properties: { multiplier: z.multiplier },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [geoCirclePolygon(z.latitude, z.longitude, z.radius)],
      },
    })),
  };
}

function surgeColors(multiplier: number): { fill: string; stroke: string } {
  if (multiplier >= 2.0) return { fill: 'rgba(239,68,68,0.14)', stroke: 'rgba(239,68,68,0.55)' };
  if (multiplier >= 1.5) return { fill: 'rgba(249,115,22,0.14)', stroke: 'rgba(249,115,22,0.55)' };
  return { fill: 'rgba(213,178,61,0.13)', stroke: 'rgba(213,178,61,0.55)' };
}

export function MapBackdrop({
  pickup, dropoff, driverLocation, surgeZones = [], routePolyline,
  stationStatuses, approachCircle, focusTarget,
}: MapBackdropProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const lastLocUpdate = useRef(0);
  const surgeReadyRef = useRef(false);
  const surgeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const shuttleRouteReadyRef = useRef(false);
  const shuttleMarkersRef = useRef<maplibregl.Marker[]>([]);
  const approachReadyRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const ridePts = [driverLocation, pickup, dropoff].filter(Boolean) as Array<{ latitude: number; longitude: number }>;
    const stationPts = routePolyline?.length ? routePolyline : [];
    const centerPts = ridePts.length > 0 ? ridePts : stationPts;
    const center: [number, number] = centerPts.length
      ? [centerPts.reduce((s, p) => s + p.longitude, 0) / centerPts.length, centerPts.reduce((s, p) => s + p.latitude, 0) / centerPts.length]
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
      // ── Surge layers ────────────────────────────────────────────────────
      map.addSource('surge-zones', { type: 'geojson', data: buildSurgeGeoJSON([]) });
      map.addLayer({ id: 'surge-fill', type: 'fill', source: 'surge-zones', paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'multiplier'], 1.0, 'rgba(213,178,61,0.13)', 1.5, 'rgba(249,115,22,0.14)', 2.0, 'rgba(239,68,68,0.14)'], 'fill-opacity': 1 } });
      map.addLayer({ id: 'surge-stroke', type: 'line', source: 'surge-zones', paint: { 'line-color': ['interpolate', ['linear'], ['get', 'multiplier'], 1.0, 'rgba(213,178,61,0.6)', 1.5, 'rgba(249,115,22,0.6)', 2.0, 'rgba(239,68,68,0.6)'], 'line-width': 1.5, 'line-dasharray': [4, 3] } });
      surgeReadyRef.current = true;

      // ── Shuttle route layers ─────────────────────────────────────────────
      map.addSource('shuttle-route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      });
      map.addLayer({ id: 'shuttle-casing', type: 'line', source: 'shuttle-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.35 } });
      map.addLayer({ id: 'shuttle-line', type: 'line', source: 'shuttle-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#6366f1', 'line-width': 3.5, 'line-opacity': 0.88 } });
      shuttleRouteReadyRef.current = true;

      // ── Approach circle layers (initially hidden) ─────────────────────────
      map.addSource('approach-circle', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: {} },
      });
      map.addLayer({ id: 'approach-fill', type: 'fill', source: 'approach-circle', paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.10 }, layout: { visibility: 'none' } });
      map.addLayer({ id: 'approach-stroke', type: 'line', source: 'approach-circle', paint: { 'line-color': '#f59e0b', 'line-width': 2.5, 'line-dasharray': [5, 4] }, layout: { visibility: 'none' } });
      approachReadyRef.current = true;

      // ── On-demand ride markers ───────────────────────────────────────────
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

      // ── On-demand ride route ─────────────────────────────────────────────
      const routePts = [driverLocation ?? pickup, pickup, dropoff]
        .filter(Boolean) as Array<{ latitude: number; longitude: number }>;
      if (routePts.length >= 2) {
        const straightCoords = routePts.map((p) => [p.longitude, p.latitude] as [number, number]);
        const routeCoords = (await fetchOSRMRoute(straightCoords)) ?? straightCoords;
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords }, properties: {} } });
        map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.4 } });
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#6366f1', 'line-width': 3.5, 'line-opacity': 0.9 } });
      }

      if (!routePolyline?.length) {
        const allPoints = [driverLocation, pickup, dropoff].filter(Boolean) as Array<{ latitude: number; longitude: number }>;
        if (allPoints.length > 1) {
          const bounds = new maplibregl.LngLatBounds();
          allPoints.forEach((p) => bounds.extend([p.longitude, p.latitude]));
          map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 600 });
        }
      }
    });

    return () => {
      surgeReadyRef.current = false;
      shuttleRouteReadyRef.current = false;
      approachReadyRef.current = false;
      surgeMarkersRef.current.forEach(m => m.remove());
      surgeMarkersRef.current = [];
      shuttleMarkersRef.current.forEach(m => m.remove());
      shuttleMarkersRef.current = [];
      driverMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Surge zones update
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !surgeReadyRef.current) return;
    const source = map.getSource('surge-zones') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(buildSurgeGeoJSON(surgeZones));
    surgeMarkersRef.current.forEach(m => m.remove());
    surgeMarkersRef.current = [];
    surgeZones.forEach(z => {
      const { stroke } = surgeColors(z.multiplier);
      const el = document.createElement('div');
      el.style.cssText = ['display:flex', 'align-items:center', 'gap:3px', 'background:rgba(20,20,30,0.82)', 'backdrop-filter:blur(6px)', 'border-radius:20px', 'padding:3px 8px', `border:1.5px solid ${stroke}`, 'pointer-events:none', 'white-space:nowrap'].join(';');
      el.innerHTML = `<span style="font-size:11px;color:#D5B23D">⚡</span><span style="font-size:11px;font-weight:700;color:#fff;font-family:sans-serif">${z.multiplier.toFixed(1)}×</span>`;
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([z.longitude, z.latitude]).addTo(map);
      surgeMarkersRef.current.push(marker);
    });
  }, [surgeZones]);

  // Shuttle route + station markers update
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !shuttleRouteReadyRef.current) return;
    if (!routePolyline?.length) return;

    const coords = routePolyline.map((p) => [p.longitude, p.latitude] as [number, number]);
    const source = map.getSource('shuttle-route') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });

    // Rebuild station markers with current statuses
    shuttleMarkersRef.current.forEach(m => m.remove());
    shuttleMarkersRef.current = [];
    routePolyline.forEach((pt, idx) => {
      const status = stationStatuses?.[idx] ?? 'pending';
      const marker = new maplibregl.Marker({ element: makeSvgEl(stationSvg(idx + 1, status)), anchor: 'center' })
        .setLngLat([pt.longitude, pt.latitude])
        .addTo(map);
      shuttleMarkersRef.current.push(marker);
    });

    const bounds = new maplibregl.LngLatBounds();
    routePolyline.forEach((p) => bounds.extend([p.longitude, p.latitude]));
    map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 700 });

    fetchOSRMRoute(coords).then((osrmCoords) => {
      if (!osrmCoords) return;
      const src = mapRef.current?.getSource('shuttle-route') as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: osrmCoords }, properties: {} });
    });
  }, [routePolyline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Station statuses update (without rebuilding route)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routePolyline?.length) return;
    // Only update markers if the route is already drawn
    if (!shuttleRouteReadyRef.current) return;
    shuttleMarkersRef.current.forEach(m => m.remove());
    shuttleMarkersRef.current = [];
    routePolyline.forEach((pt, idx) => {
      const status = stationStatuses?.[idx] ?? 'pending';
      const marker = new maplibregl.Marker({ element: makeSvgEl(stationSvg(idx + 1, status)), anchor: 'center' })
        .setLngLat([pt.longitude, pt.latitude])
        .addTo(map);
      shuttleMarkersRef.current.push(marker);
    });
  }, [stationStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Approach circle update
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !approachReadyRef.current) return;
    const source = map.getSource('approach-circle') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    if (approachCircle) {
      source.setData({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [geoCirclePolygon(approachCircle.latitude, approachCircle.longitude, approachCircle.radius)],
        },
        properties: {},
      });
      map.setLayoutProperty('approach-fill', 'visibility', 'visible');
      map.setLayoutProperty('approach-stroke', 'visibility', 'visible');
    } else {
      map.setLayoutProperty('approach-fill', 'visibility', 'none');
      map.setLayoutProperty('approach-stroke', 'visibility', 'none');
    }
  }, [approachCircle]);

  // Focus camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget) return;
    map.flyTo({ center: [focusTarget.longitude, focusTarget.latitude], zoom: focusTarget.zoom ?? 16, duration: 800 });
  }, [focusTarget?.latitude, focusTarget?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // Driver location update — creates marker on first update if not yet created, then follows
  useEffect(() => {
    const now = Date.now();
    if (now - lastLocUpdate.current < 1500) return;
    lastLocUpdate.current = now;
    const map = mapRef.current;
    if (!driverLocation || !map) return;
    const lngLat: [number, number] = [driverLocation.longitude, driverLocation.latitude];
    if (!driverMarkerRef.current) {
      const marker = new maplibregl.Marker({ element: makeSvgEl(DRIVER_SVG), anchor: 'bottom' })
        .setLngLat(lngLat)
        .addTo(map);
      setTimeout(() => {
        marker.getElement().style.transition = 'transform 1400ms linear';
        const svg = marker.getElement().querySelector('svg') as HTMLElement | null;
        if (svg) svg.style.transition = 'transform 1400ms linear';
      }, 200);
      driverMarkerRef.current = marker;
    } else {
      driverMarkerRef.current.setLngLat(lngLat);
    }
    map.easeTo({ center: lngLat, duration: 1000 });
  }, [driverLocation?.latitude, driverLocation?.longitude]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* @ts-ignore — plain div is valid in Expo Web */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}
