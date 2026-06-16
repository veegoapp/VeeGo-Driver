import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  routePolyline?: Array<{ latitude: number; longitude: number }>;
  roadPolyline?: Array<{ latitude: number; longitude: number }>;
  stationStatuses?: ('pending' | 'current' | 'completed')[];
  approachCircle?: { latitude: number; longitude: number; radius: number } | null;
  focusTarget?: { latitude: number; longitude: number; zoom?: number } | null;
  navigationMode?: boolean;
  animDurationMs?: number;
}

function buildHtml(
  pickup: MapBackdropProps['pickup'],
  dropoff: MapBackdropProps['dropoff'],
  driverLocation: MapBackdropProps['driverLocation'],
  surgeZones: SurgeZone[],
  routePolyline: MapBackdropProps['routePolyline'],
  stationStatuses: ('pending' | 'current' | 'completed')[],
  navigationMode: boolean,
  animDurationMs: number,
): string {
  const stationPts = routePolyline?.length ? routePolyline : [];
  const firstStation = stationPts[0];

  // الإصلاح: ابدأ من موقع العربية مباشرة لو موجود
  const driverLngLat = driverLocation
    ? [driverLocation.longitude, driverLocation.latitude]
    : firstStation
    ? [firstStation.longitude, firstStation.latitude]
    : [31.2357, 30.0444];

  // الإصلاح: في nav mode، الكاميرا تبدأ على موقع العربية مش المحطة الأولى
  const centerPt = navigationMode
    ? (driverLocation ?? firstStation ?? { longitude: 31.2357, latitude: 30.0444 })
    : (() => {
        const pts = [driverLocation, ...(stationPts)].filter(Boolean) as Array<{latitude:number;longitude:number}>;
        if (!pts.length) return { longitude: 31.2357, latitude: 30.0444 };
        return {
          longitude: pts.reduce((s, p) => s + p.longitude, 0) / pts.length,
          latitude: pts.reduce((s, p) => s + p.latitude, 0) / pts.length,
        };
      })();

  const pickupJson = pickup ? JSON.stringify([pickup.longitude, pickup.latitude]) : 'null';
  const dropoffJson = dropoff ? JSON.stringify([dropoff.longitude, dropoff.latitude]) : 'null';
  const driverJson = JSON.stringify(driverLngLat);
  const surgeJson = JSON.stringify(surgeZones);
  const centerJson = JSON.stringify([centerPt.longitude, centerPt.latitude]);
  const routePolylineJson = routePolyline?.length
    ? JSON.stringify(routePolyline.map(p => [p.longitude, p.latitude]))
    : 'null';
  const stationStatusesJson = JSON.stringify(stationStatuses);
  const navModeStr = navigationMode ? 'true' : 'false';
  const animMsStr = String(animDurationMs);
  const initZoom = navigationMode ? '16' : '13';
  const initPitch = navigationMode ? '50' : '0';

  // الإصلاح: حساب bearing أولي لو في موقع عربية ومحطة أولى
  const initBearingStr = (navigationMode && driverLocation && firstStation)
    ? `(function(){
        var lat1=(${driverLocation.latitude})*Math.PI/180;
        var lat2=(${firstStation.latitude})*Math.PI/180;
        var dLng=((${firstStation.longitude})-(${driverLocation.longitude}))*Math.PI/180;
        var y=Math.sin(dLng)*Math.cos(lat2);
        var x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLng);
        return (Math.atan2(y,x)*180/Math.PI+360)%360;
      })()`
    : '0';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet"/>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #map { width:100%; height:100%; overflow:hidden; }
</style>
</head>
<body>
<div id="map"></div>
<script>
(function() {
  var pickup = ${pickupJson};
  var dropoff = ${dropoffJson};
  var driverInit = ${driverJson};
  var surgeZones = ${surgeJson};
  var center = ${centerJson};
  var routePolyline = ${routePolylineJson};
  var stationStatuses = ${stationStatusesJson};
  var navMode = ${navModeStr};
  var animDurationMs = ${animMsStr};
  var stationMarkers = [];
  var approachReady = false;
  var userPanned = false;
  var driverMarker = null;
  var prevPos = null;
  var currentBearing = ${initBearingStr};

  // ── سهم العربية في وضع الملاحة — يشبه جوجل ماب ──────────────────────────
  var DRIVER_NAV_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">' +
    '<circle cx="28" cy="28" r="26" fill="rgba(37,99,235,0.18)" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>' +
    '<circle cx="28" cy="28" r="18" fill="#1d4ed8" stroke="white" stroke-width="2.5"/>' +
    '<path d="M28 10 L40 38 L28 30 L16 38 Z" fill="white" stroke="rgba(255,255,255,0.3)" stroke-linejoin="round" stroke-width="0.5"/>' +
    '</svg>';

  var DRIVER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46">' +
    '<circle cx="19" cy="19" r="17" fill="#2563eb" opacity="0.18"/>' +
    '<circle cx="19" cy="19" r="13" fill="#2563eb" stroke="white" stroke-width="2.5"/>' +
    '<path d="M12 17.5 h14 M15 14 l4 3.5 l4-3.5 M13 21 c0 2.5 2.8 4.5 6 4.5s6-2 6-4.5" stroke="white" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<line x1="19" y1="32" x2="19" y2="44" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round"/>' +
    '</svg>';

  var PICKUP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><circle cx="14" cy="14" r="12" fill="#22c55e" stroke="white" stroke-width="2.5"/><text x="14" y="18.5" text-anchor="middle" fill="white" font-size="11" font-family="sans-serif" font-weight="bold">P</text><line x1="14" y1="26" x2="14" y2="34" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/></svg>';
  var DROPOFF_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><circle cx="14" cy="14" r="12" fill="#ef4444" stroke="white" stroke-width="2.5"/><text x="14" y="18.5" text-anchor="middle" fill="white" font-size="11" font-family="sans-serif" font-weight="bold">D</text><line x1="14" y1="26" x2="14" y2="34" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>';

  // ── خريطة داكنة احترافية (زي أوبر وكريم) ────────────────────────────────
  var MAP_STYLE = {
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
        ],
        tileSize: 256,
        attribution: '\\u00a9 OpenStreetMap \\u00a9 CARTO',
        maxzoom: 20
      }
    },
    layers: [{ id: 'carto-dark', type: 'raster', source: 'carto' }]
  };

  var map = new maplibregl.Map({
    container: 'map',
    style: MAP_STYLE,
    center: center,
    zoom: ${initZoom},
    pitch: ${initPitch},
    bearing: currentBearing,
    interactive: true,
    attributionControl: { compact: true }
  });

  function geoCircle(lat, lng, radiusM, steps) {
    steps = steps || 64;
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

  function calcBearing(from, to) {
    var lat1 = from[1] * Math.PI / 180;
    var lat2 = to[1] * Math.PI / 180;
    var dLng = (to[0] - from[0]) * Math.PI / 180;
    var y = Math.sin(dLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function buildSurgeGeoJSON(zones) {
    return {
      type: 'FeatureCollection',
      features: zones.map(function(z) {
        return { type: 'Feature', id: z.id, properties: { multiplier: z.multiplier }, geometry: { type: 'Polygon', coordinates: [geoCircle(z.latitude, z.longitude, z.radius)] } };
      })
    };
  }

  function makeSvgEl(svg) {
    var el = document.createElement('div');
    el.innerHTML = svg;
    return el;
  }

  function stationSvg(n, status) {
    if (status === 'current') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">' +
        '<circle cx="22" cy="22" r="20" fill="rgba(245,158,11,0.20)"/>' +
        '<circle cx="22" cy="22" r="14" fill="#f59e0b" stroke="white" stroke-width="3"/>' +
        '<text x="22" y="27" text-anchor="middle" fill="white" font-size="13" font-family="sans-serif" font-weight="bold">' + n + '</text>' +
        '</svg>';
    }
    if (status === 'completed') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">' +
        '<circle cx="11" cy="11" r="9" fill="#374151" stroke="#4b5563" stroke-width="1.5"/>' +
        '<text x="11" y="15" text-anchor="middle" fill="#6b7280" font-size="8" font-family="sans-serif" font-weight="bold">' + n + '</text>' +
        '</svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">' +
      '<circle cx="15" cy="15" r="13" fill="#1e293b" stroke="rgba(255,255,255,0.85)" stroke-width="2.5"/>' +
      '<text x="15" y="20" text-anchor="middle" fill="white" font-size="11" font-family="sans-serif" font-weight="bold">' + n + '</text>' +
      '</svg>';
  }

  function rebuildStationMarkers(statuses) {
    stationMarkers.forEach(function(m) { m.remove(); });
    stationMarkers = [];
    if (!routePolyline) return;
    routePolyline.forEach(function(pt, idx) {
      var st = (statuses && statuses[idx]) ? statuses[idx] : 'pending';
      var m = new maplibregl.Marker({ element: makeSvgEl(stationSvg(idx + 1, st)), anchor: 'center' })
        .setLngLat(pt).addTo(map);
      stationMarkers.push(m);
    });
  }

  map.on('load', function() {
    // ── Surge layers ──────────────────────────────────────────────────────────
    map.addSource('surge-zones', { type: 'geojson', data: buildSurgeGeoJSON(surgeZones) });
    map.addLayer({ id: 'surge-fill', type: 'fill', source: 'surge-zones', paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'multiplier'], 1.0, 'rgba(213,178,61,0.13)', 1.5, 'rgba(249,115,22,0.14)', 2.0, 'rgba(239,68,68,0.14)'], 'fill-opacity': 1 } });
    map.addLayer({ id: 'surge-stroke', type: 'line', source: 'surge-zones', paint: { 'line-color': ['interpolate', ['linear'], ['get', 'multiplier'], 1.0, 'rgba(213,178,61,0.6)', 1.5, 'rgba(249,115,22,0.6)', 2.0, 'rgba(239,68,68,0.6)'], 'line-width': 1.5, 'line-dasharray': [4, 3] } });

    surgeZones.forEach(function(z) {
      var stroke = z.multiplier >= 2.0 ? 'rgba(239,68,68,0.6)' : z.multiplier >= 1.5 ? 'rgba(249,115,22,0.6)' : 'rgba(213,178,61,0.6)';
      var el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:3px;background:rgba(20,20,30,0.82);backdrop-filter:blur(6px);border-radius:20px;padding:3px 8px;border:1.5px solid ' + stroke + ';pointer-events:none;white-space:nowrap;';
      el.innerHTML = '<span style="font-size:11px;color:#D5B23D">\u26a1</span><span style="font-size:11px;font-weight:700;color:#fff;font-family:sans-serif">' + z.multiplier.toFixed(1) + '\u00d7</span>';
      new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([z.longitude, z.latitude]).addTo(map);
    });

    // ── Approach circle (initially hidden) ───────────────────────────────────
    map.addSource('approach-circle', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: {} } });
    map.addLayer({ id: 'approach-fill', type: 'fill', source: 'approach-circle', paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.10 }, layout: { visibility: 'none' } });
    map.addLayer({ id: 'approach-stroke', type: 'line', source: 'approach-circle', paint: { 'line-color': '#f59e0b', 'line-width': 2.5, 'line-dasharray': [5, 4] }, layout: { visibility: 'none' } });
    approachReady = true;

    // ── خط الرحلة — أزرق واضح على الخريطة الداكنة ───────────────────────────
    map.addSource('shuttle-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } });
    map.addLayer({ id: 'shuttle-casing', type: 'line', source: 'shuttle-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.15 } });
    map.addLayer({ id: 'shuttle-line', type: 'line', source: 'shuttle-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.95 } });

    // ── Pickup / Dropoff markers ──────────────────────────────────────────────
    if (pickup) {
      new maplibregl.Marker({ element: makeSvgEl(PICKUP_SVG), anchor: 'bottom' })
        .setLngLat(pickup).setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setText('Pickup')).addTo(map);
    }
    if (dropoff) {
      new maplibregl.Marker({ element: makeSvgEl(DROPOFF_SVG), anchor: 'bottom' })
        .setLngLat(dropoff).setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setText('Dropoff')).addTo(map);
    }

    // ── محطات الشاتيل ─────────────────────────────────────────────────────────
    if (routePolyline && routePolyline.length >= 2) {
      rebuildStationMarkers(stationStatuses);
      if (!navMode) {
        map.getSource('shuttle-route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: routePolyline }, properties: {} });
        var stBounds = new maplibregl.LngLatBounds();
        routePolyline.forEach(function(pt) { stBounds.extend(pt); });
        map.fitBounds(stBounds, { padding: 80, maxZoom: 14, duration: 700 });
      }
    }

    // ── Driver marker ─────────────────────────────────────────────────────────
    var markerSvg = navMode ? DRIVER_NAV_SVG : DRIVER_SVG;
    var markerAnchor = navMode ? 'center' : 'bottom';
    driverMarker = new maplibregl.Marker({
      element: makeSvgEl(markerSvg),
      anchor: markerAnchor,
      // الإصلاح: السهم يتجه ناحية الحركة تلقائياً
      rotationAlignment: navMode ? 'map' : 'viewport',
      pitchAlignment: navMode ? 'map' : 'viewport'
    }).setLngLat(driverInit).addTo(map);
    driverMarker.getElement().style.transition = 'transform ' + animDurationMs + 'ms linear';
    if (navMode) { driverMarker.setRotation(currentBearing); }
    prevPos = driverInit;

    // ── On-demand ride route (non-nav mode) ──────────────────────────────────
    if (!navMode && pickup) {
      var routePts = [driverInit, pickup, dropoff].filter(Boolean);
      if (routePts.length >= 2) {
        function drawRoute(coords) {
          if (map.getSource('route')) {
            map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
          } else {
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} } });
            map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.4 } });
            map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#3b82f6', 'line-width': 3.5, 'line-opacity': 0.9 } });
          }
        }
        drawRoute(routePts);
        (function() {
          var c = routePts.map(function(p) { return p[0] + ',' + p[1]; }).join(';');
          fetch('https://router.project-osrm.org/route/v1/driving/' + c + '?overview=full&geometries=geojson', { signal: AbortSignal.timeout(5000) })
            .then(function(res) { return res.ok ? res.json() : null; })
            .then(function(data) { if (data && data.code === 'Ok' && data.routes && data.routes.length) drawRoute(data.routes[0].geometry.coordinates); })
            .catch(function() {});
        })();
        var bounds = new maplibregl.LngLatBounds();
        routePts.forEach(function(p) { bounds.extend(p); });
        map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 600 });
      }
    }
  });

  map.on('movestart', function(e) {
    if (e.originalEvent) {
      userPanned = true;
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'userPanned' })); } catch(_) {}
    }
  });

  // ── postMessage bridge ────────────────────────────────────────────────────────
  // Android WebView dispatches to `document`; iOS dispatches to `window` — listen on both.
  function handleBridgeMessage(e) {
    try {
      var msg = JSON.parse(e.data);

      // ── موقع العربية: حركة سلسة + كاميرا تتبع احترافية ──────────────────
      if (msg.type === 'driverLocation') {
        var newPos = [msg.lng, msg.lat];
        var aMs = msg.animMs || animDurationMs;
        animDurationMs = aMs;

        if (!driverMarker) {
          var svg2 = navMode ? DRIVER_NAV_SVG : DRIVER_SVG;
          var anc2 = navMode ? 'center' : 'bottom';
          driverMarker = new maplibregl.Marker({
            element: makeSvgEl(svg2),
            anchor: anc2,
            rotationAlignment: navMode ? 'map' : 'viewport',
            pitchAlignment: navMode ? 'map' : 'viewport'
          }).setLngLat(newPos).addTo(map);
          driverMarker.getElement().style.transition = 'transform ' + aMs + 'ms linear';
          prevPos = newPos;
        } else {
          driverMarker.getElement().style.transition = 'transform ' + aMs + 'ms linear';

          // الإصلاح: حساب الاتجاه الصح من الموقع السابق للحالي
          if (prevPos && !(prevPos[0] === newPos[0] && prevPos[1] === newPos[1])) {
            currentBearing = calcBearing(prevPos, newPos);
          }
          prevPos = newPos;
          driverMarker.setLngLat(newPos);
          // الإصلاح: دوّر السهم ناحية اتجاه الحركة
          if (navMode) { driverMarker.setRotation(currentBearing); }
        }

        if (!userPanned) {
          if (navMode) {
            // الإصلاح: offset بيحط العربية في الأسفل (زي جوجل ماب)
            map.easeTo({
              center: newPos,
              bearing: currentBearing,
              pitch: 50,
              zoom: 16,
              duration: aMs,
              offset: [0, 80]
            });
          } else {
            map.easeTo({ center: newPos, duration: aMs });
          }
        }
      }

      // ── تحديث حالة المحطات ────────────────────────────────────────────────
      if (msg.type === 'updateStationStatuses' && msg.statuses) {
        stationStatuses = msg.statuses;
        rebuildStationMarkers(msg.statuses);
      }

      // ── دائرة التقرب ──────────────────────────────────────────────────────
      if (msg.type === 'setApproachCircle') {
        if (!approachReady) return;
        var src = map.getSource('approach-circle');
        if (!src) return;
        if (msg.show && msg.lat != null && msg.lng != null) {
          src.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [geoCircle(msg.lat, msg.lng, msg.radius || 500)] }, properties: {} });
          map.setLayoutProperty('approach-fill', 'visibility', 'visible');
          map.setLayoutProperty('approach-stroke', 'visibility', 'visible');
        } else {
          map.setLayoutProperty('approach-fill', 'visibility', 'none');
          map.setLayoutProperty('approach-stroke', 'visibility', 'none');
        }
      }

      // ── تحريك الكاميرا لنقطة معينة ───────────────────────────────────────
      if (msg.type === 'focusLocation' && msg.lat != null && msg.lng != null) {
        map.flyTo({ center: [msg.lng, msg.lat], zoom: msg.zoom || 16, pitch: navMode ? 50 : 0, duration: 800 });
      }

      // ── خط الطريق الفعلي ─────────────────────────────────────────────────
      if (msg.type === 'updateRoadPolyline') {
        var rSrc = map.getSource('shuttle-route');
        if (!rSrc) return;
        if (Array.isArray(msg.coords) && msg.coords.length >= 2) {
          rSrc.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: msg.coords }, properties: {} });
        } else {
          rSrc.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
        }
      }

      // ── إعادة التمركز ─────────────────────────────────────────────────────
      if (msg.type === 'recenter') {
        userPanned = false;
        if (prevPos) {
          if (navMode) {
            map.easeTo({ center: prevPos, bearing: currentBearing, pitch: 50, zoom: 16, duration: 800, offset: [0, 80] });
          } else {
            map.easeTo({ center: prevPos, duration: 800 });
          }
        }
      }
    } catch(_) {}
  }
  window.addEventListener('message', handleBridgeMessage);
  document.addEventListener('message', handleBridgeMessage);
})();
</script>
</body>
</html>`;
}

export function MapBackdrop({
  pickup, dropoff, driverLocation, surgeZones = [], routePolyline, roadPolyline,
  stationStatuses, approachCircle, focusTarget,
  navigationMode = false, animDurationMs = 1200,
}: MapBackdropProps) {
  const webviewRef = useRef<WebView>(null);
  const [userPanned, setUserPanned] = useState(false);

  const html = useMemo(
    () => buildHtml(
      pickup, dropoff, driverLocation, surgeZones, routePolyline,
      stationStatuses ?? [], navigationMode, animDurationMs,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(routePolyline), JSON.stringify(surgeZones), navigationMode],
  );

  // موقع العربية — كل تحديث بيوصل للـ WebView فوراً
  useEffect(() => {
    if (!driverLocation || !webviewRef.current) return;
    webviewRef.current.postMessage(JSON.stringify({
      type: 'driverLocation',
      lat: driverLocation.latitude,
      lng: driverLocation.longitude,
      animMs: animDurationMs,
    }));
  }, [driverLocation?.latitude, driverLocation?.longitude, animDurationMs]);

  // حالة المحطات
  useEffect(() => {
    if (!stationStatuses || !webviewRef.current) return;
    webviewRef.current.postMessage(JSON.stringify({ type: 'updateStationStatuses', statuses: stationStatuses }));
  }, [JSON.stringify(stationStatuses)]); // eslint-disable-line react-hooks/exhaustive-deps

  // دائرة التقرب
  useEffect(() => {
    if (!webviewRef.current) return;
    if (approachCircle) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'setApproachCircle', show: true, lat: approachCircle.latitude, lng: approachCircle.longitude, radius: approachCircle.radius }));
    } else {
      webviewRef.current.postMessage(JSON.stringify({ type: 'setApproachCircle', show: false }));
    }
  }, [approachCircle?.latitude, approachCircle?.longitude, approachCircle?.radius, approachCircle == null]); // eslint-disable-line react-hooks/exhaustive-deps

  // خط الطريق
  useEffect(() => {
    if (!webviewRef.current) return;
    webviewRef.current.postMessage(JSON.stringify({
      type: 'updateRoadPolyline',
      coords: roadPolyline?.length ? roadPolyline.map(p => [p.longitude, p.latitude]) : null,
    }));
  }, [JSON.stringify(roadPolyline)]); // eslint-disable-line react-hooks/exhaustive-deps

  // تحريك الكاميرا
  useEffect(() => {
    if (!focusTarget || !webviewRef.current) return;
    webviewRef.current.postMessage(JSON.stringify({ type: 'focusLocation', lat: focusTarget.latitude, lng: focusTarget.longitude, zoom: focusTarget.zoom ?? 16 }));
  }, [focusTarget?.latitude, focusTarget?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={webviewRef}
        source={{ html }}
        style={StyleSheet.absoluteFillObject}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'userPanned') setUserPanned(true);
          } catch {}
        }}
      />
      {userPanned && (
        <Pressable
          onPress={() => {
            setUserPanned(false);
            webviewRef.current?.postMessage(JSON.stringify({ type: 'recenter' }));
          }}
          style={styles.recenterBtn}
        >
          <Text style={styles.recenterIcon}>⊕</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  recenterBtn: {
    position: 'absolute',
    bottom: 72,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,15,25,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterIcon: {
    color: '#3b82f6',
    fontSize: 20,
    lineHeight: 22,
  },
});
