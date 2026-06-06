import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

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
}

function buildHtml(
  pickup: MapBackdropProps['pickup'],
  dropoff: MapBackdropProps['dropoff'],
  driverLocation: MapBackdropProps['driverLocation'],
  surgeZones: SurgeZone[],
): string {
  const pts = [driverLocation, pickup, dropoff].filter(Boolean) as Array<{ latitude: number; longitude: number }>;
  const center = pts.length
    ? [
        pts.reduce((s, p) => s + p.longitude, 0) / pts.length,
        pts.reduce((s, p) => s + p.latitude, 0) / pts.length,
      ]
    : [31.2357, 30.0444];

  const pickupJson = pickup ? JSON.stringify([pickup.longitude, pickup.latitude]) : 'null';
  const dropoffJson = dropoff ? JSON.stringify([dropoff.longitude, dropoff.latitude]) : 'null';
  const driverJson = driverLocation ? JSON.stringify([driverLocation.longitude, driverLocation.latitude]) : 'null';
  const surgeJson = JSON.stringify(surgeZones);
  const centerJson = JSON.stringify(center);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet"/>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #map { width:100%; height:100%; }
</style>
</head>
<body>
<div id="map"></div>
<script>
(function() {
  var pickup = ${pickupJson};
  var dropoff = ${dropoffJson};
  var driver = ${driverJson};
  var surgeZones = ${surgeJson};
  var center = ${centerJson};

  var map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '\u00a9 OpenStreetMap contributors'
        }
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
    },
    center: center,
    zoom: 13,
    interactive: true,
    attributionControl: { compact: true }
  });

  function geoCircle(lat, lng, radiusM, steps) {
    steps = steps || 48;
    var coords = [];
    for (var i = 0; i <= steps; i++) {
      var angle = (i / steps) * 2 * Math.PI;
      var dx = radiusM * Math.cos(angle);
      var dy = radiusM * Math.sin(angle);
      var dLat = dy / 111320;
      var dLng = dx / (111320 * Math.cos(lat * Math.PI / 180));
      coords.push([lng + dLng, lat + dLat]);
    }
    return coords;
  }

  function buildSurgeGeoJSON(zones) {
    return {
      type: 'FeatureCollection',
      features: zones.map(function(z) {
        return {
          type: 'Feature',
          id: z.id,
          properties: { multiplier: z.multiplier },
          geometry: {
            type: 'Polygon',
            coordinates: [geoCircle(z.latitude, z.longitude, z.radius)]
          }
        };
      })
    };
  }

  function makeSvgEl(svg) {
    var el = document.createElement('div');
    el.innerHTML = svg;
    return el;
  }

  var PICKUP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><circle cx="14" cy="14" r="12" fill="#22c55e" stroke="white" stroke-width="2.5"/><text x="14" y="18.5" text-anchor="middle" fill="white" font-size="11" font-family="sans-serif" font-weight="bold">P</text><line x1="14" y1="26" x2="14" y2="34" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/></svg>';
  var DROPOFF_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><circle cx="14" cy="14" r="12" fill="#ef4444" stroke="white" stroke-width="2.5"/><text x="14" y="18.5" text-anchor="middle" fill="white" font-size="11" font-family="sans-serif" font-weight="bold">D</text><line x1="14" y1="26" x2="14" y2="34" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>';
  var DRIVER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46"><circle cx="19" cy="19" r="17" fill="#2563eb" opacity="0.18"/><circle cx="19" cy="19" r="13" fill="#2563eb" stroke="white" stroke-width="2.5"/><path d="M12 17.5 h14 M15 14 l4 3.5 l4-3.5 M13 21 c0 2.5 2.8 4.5 6 4.5s6-2 6-4.5" stroke="white" stroke-width="1.6" fill="none" stroke-linecap="round"/><line x1="19" y1="32" x2="19" y2="44" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round"/></svg>';

  var driverMarker = null;

  map.on('load', function() {
    // Surge zones
    map.addSource('surge-zones', { type: 'geojson', data: buildSurgeGeoJSON(surgeZones) });
    map.addLayer({
      id: 'surge-fill', type: 'fill', source: 'surge-zones',
      paint: {
        'fill-color': ['interpolate', ['linear'], ['get', 'multiplier'],
          1.0, 'rgba(213,178,61,0.13)', 1.5, 'rgba(249,115,22,0.14)', 2.0, 'rgba(239,68,68,0.14)'],
        'fill-opacity': 1
      }
    });
    map.addLayer({
      id: 'surge-stroke', type: 'line', source: 'surge-zones',
      paint: {
        'line-color': ['interpolate', ['linear'], ['get', 'multiplier'],
          1.0, 'rgba(213,178,61,0.6)', 1.5, 'rgba(249,115,22,0.6)', 2.0, 'rgba(239,68,68,0.6)'],
        'line-width': 1.5,
        'line-dasharray': [4, 3]
      }
    });

    // Surge labels
    surgeZones.forEach(function(z) {
      var stroke = z.multiplier >= 2.0 ? 'rgba(239,68,68,0.6)' : z.multiplier >= 1.5 ? 'rgba(249,115,22,0.6)' : 'rgba(213,178,61,0.6)';
      var el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:3px;background:rgba(20,20,30,0.82);backdrop-filter:blur(6px);border-radius:20px;padding:3px 8px;border:1.5px solid ' + stroke + ';pointer-events:none;white-space:nowrap;';
      el.innerHTML = '<span style="font-size:11px;color:#D5B23D">\u26a1</span><span style="font-size:11px;font-weight:700;color:#fff;font-family:sans-serif">' + z.multiplier.toFixed(1) + '\u00d7</span>';
      new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([z.longitude, z.latitude]).addTo(map);
    });

    // Markers
    if (pickup) {
      new maplibregl.Marker({ element: makeSvgEl(PICKUP_SVG), anchor: 'bottom' })
        .setLngLat(pickup).setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setText('Pickup')).addTo(map);
    }
    if (dropoff) {
      new maplibregl.Marker({ element: makeSvgEl(DROPOFF_SVG), anchor: 'bottom' })
        .setLngLat(dropoff).setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setText('Dropoff')).addTo(map);
    }
    var driverLoc = driver || pickup;
    if (driverLoc) {
      driverMarker = new maplibregl.Marker({ element: makeSvgEl(DRIVER_SVG), anchor: 'bottom' })
        .setLngLat(driverLoc).setPopup(new maplibregl.Popup({ offset: 22, closeButton: false }).setText('Your location')).addTo(map);
    }

    // Route
    var routePts = [driver || pickup, pickup, dropoff].filter(Boolean);
    if (routePts.length >= 2) {
      var straightCoords = routePts.map(function(p) { return p; });

      function drawRoute(coords) {
        if (map.getSource('route')) {
          map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
        } else {
          map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }
          });
          map.addLayer({
            id: 'route-casing', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.4 }
          });
          map.addLayer({
            id: 'route-line', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#6366f1', 'line-width': 3.5, 'line-opacity': 0.9 }
          });
        }
      }

      // Draw straight-line fallback immediately, then upgrade with OSRM road route
      drawRoute(straightCoords);

      (function() {
        var c = straightCoords.map(function(p) { return p[0] + ',' + p[1]; }).join(';');
        fetch('https://router.project-osrm.org/route/v1/driving/' + c + '?overview=full&geometries=geojson', {
          signal: AbortSignal.timeout(5000)
        })
          .then(function(res) { return res.ok ? res.json() : null; })
          .then(function(data) {
            if (data && data.code === 'Ok' && data.routes && data.routes.length) {
              drawRoute(data.routes[0].geometry.coordinates);
            }
          })
          .catch(function() {});
      })();
    }

    // Fit bounds
    var allPts = [driver, pickup, dropoff].filter(Boolean);
    if (allPts.length > 1) {
      var bounds = new maplibregl.LngLatBounds();
      allPts.forEach(function(p) { bounds.extend(p); });
      map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 600 });
    }
  });

  // Listen for driver location updates from RN
  window.addEventListener('message', function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'driverLocation' && driverMarker) {
        driverMarker.setLngLat([msg.lng, msg.lat]);
      }
    } catch(_) {}
  });
})();
</script>
</body>
</html>`;
}

export function MapBackdrop({ pickup, dropoff, driverLocation, surgeZones = [] }: MapBackdropProps) {
  const webviewRef = useRef<WebView>(null);
  const lastLocUpdate = useRef(0);

  const html = buildHtml(pickup, dropoff, driverLocation, surgeZones);

  useEffect(() => {
    const now = Date.now();
    if (now - lastLocUpdate.current < 1500) return;
    lastLocUpdate.current = now;
    if (!driverLocation || !webviewRef.current) return;
    webviewRef.current.postMessage(
      JSON.stringify({ type: 'driverLocation', lat: driverLocation.latitude, lng: driverLocation.longitude })
    );
  }, [driverLocation?.latitude, driverLocation?.longitude]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <WebView
        ref={webviewRef}
        source={{ html }}
        style={StyleSheet.absoluteFillObject}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        pointerEvents="none"
      />
    </View>
  );
}
