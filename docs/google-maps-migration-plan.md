# VeeGo Mobile Apps — Google Maps Migration Plan

> **Scope:** Android + iOS native apps only (React Native / Expo)  
> **Services in scope:** Driver, Passenger, Shuttle, Delivery, Scooter  
> **Web platform:** Excluded entirely  
> **Status:** Pre-implementation analysis — no code changes included

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current Architecture Summary](#2-current-architecture-summary)
3. [What Must Be Replaced](#3-what-must-be-replaced)
4. [Google Maps Integration Strategy by Service](#4-google-maps-integration-strategy-by-service)
5. [Unified Shared Map System Design](#5-unified-shared-map-system-design)
6. [Data Flow Changes](#6-data-flow-changes)
7. [Step-by-Step Migration Phases](#7-step-by-step-migration-phases)
8. [Risks and Breaking Points](#8-risks-and-breaking-points)
9. [Complexity and Effort Estimation](#9-complexity-and-effort-estimation)
10. [Final Recommendation](#10-final-recommendation)

---

## 1. Overview

VeeGo's mobile apps currently render maps using **MapLibre GL loaded from a CDN, inside a React Native WebView**. This is a non-standard architecture for production React Native apps and carries significant risk: CDN dependency, cross-frame bridge latency, no offline tile support, and no native gesture integration.

`react-native-maps` v1.27.2 is **already listed in `package.json`** but is not actually used for map rendering. This is the single most important fact in this migration: the core native map library is already installed and linked through Expo's managed workflow. The primary work is replacing the WebView-based rendering with native `react-native-maps` components backed by `PROVIDER_GOOGLE`.

All five service apps (Driver, Passenger, Shuttle, Delivery, Scooter) are assumed to be separate Expo managed repos following the same stack. This document provides the canonical strategy; each repo applies it independently.

### Goals

- Replace WebView + MapLibre with native Google Maps via `react-native-maps`
- Replace public OSRM routing with Google Directions API (or a server-proxied equivalent)
- Preserve all existing feature parity: markers, polylines, geofences, heading-based camera, surge zones, approach circles
- Achieve zero downtime across Android and iOS
- Produce a single shared map component usable across all services

---

## 2. Current Architecture Summary

### 2.1 Map Rendering

| Property | Current Value |
|---|---|
| Map library | MapLibre GL v4.7.1 |
| Load method | CDN via `unpkg.com` inside a WebView HTML string |
| Tile provider | CARTO dark raster tiles (`basemaps.cartocdn.com`) |
| Map component | `components/MapBackdrop.native.tsx` |
| React Native bridge | `postMessage` / `onMessage` over `react-native-webview` |
| Native map package | `react-native-maps` v1.27.2 — **installed but unused** |

The entire map lives inside a runtime-built HTML string (~400 lines). All interaction between React Native and the map (camera moves, marker updates, polyline draws, surge zone changes) crosses the WebView bridge as JSON strings. There are no native map gesture handlers, no native camera API, and no native overlay rendering.

### 2.2 Location Tracking

| Hook | Source | Frequency | Transport |
|---|---|---|---|
| `useDriverLocation` | `expo-location` `watchPositionAsync` | 3s / 10m | In-memory state only |
| `useLocationBroadcast` | `expo-location` `getCurrentPositionAsync` | Every 5s | Socket.io → REST fallback |
| `useActiveLocationTracking` | `expo-location` `getCurrentPositionAsync` | Every 5min | REST `POST /tracking/locations/batch` |

### 2.3 Routing and ETA

| Hook | API | Endpoint | Notes |
|---|---|---|---|
| `useRoadEta` | OSRM (public) | `router.project-osrm.org/route/v1/driving/` | 30s throttle, 6s timeout, speed fallback |
| `useRoadPolyline` | OSRM (public) | same, `?overview=full&geometries=geojson` | 8s timeout, content-keyed cache |
| Inline ride route | OSRM (public) | same | Inside `MapBackdrop.native.tsx`, 5s timeout |

### 2.4 Socket Events (Location-related)

| Event | Direction | Payload |
|---|---|---|
| `driver:location:update` | Client → Server | `{ latitude, longitude, speed?, heading?, tripId? }` |
| `driver:sos` | Client → Server | `{ rideId, latitude, longitude }` |

### 2.5 Expo Project Config

- **Expo SDK:** 54.0.27
- **New Architecture:** enabled (`newArchEnabled: true`)
- **Native folders:** none — pure Expo managed workflow (EAS Build required)
- **Google Maps API key:** not configured anywhere
- **expo-location plugin:** not registered in `app.json` (works without it in SDK 54)
- **Map plugin:** not registered in `app.json`

---

## 3. What Must Be Replaced

### 3.1 Primary Replacement: WebView Map → Native Map

The entire `components/MapBackdrop.native.tsx` file must be rewritten. It is a ~550-line file that embeds a full MapLibre GL application inside a WebView. Nothing in it is reusable as-is for native Google Maps.

**What `MapBackdrop.native.tsx` currently does that must be ported:**

| Feature | Current Implementation | Google Maps Equivalent |
|---|---|---|
| Base map tiles | CartoDB dark raster | Google Maps custom JSON style (dark) |
| Driver marker | SVG inside HTML string | `<Marker>` with custom image or `<AnimatedRegion>` |
| Driver bearing rotation | JS `map.easeTo({ bearing })` | `<Marker rotation={heading}>`  |
| Pickup / dropoff markers | SVG HTML elements | `<Marker>` with custom `<View>` callout |
| Shuttle station markers | Numbered HTML divs | `<Marker>` with custom view per status |
| Route polyline | MapLibre `addLayer` GeoJSON | `<Polyline coordinates={[...]} />` |
| Surge zone circles | MapLibre circle layer | `<Circle center={} radius={} />` |
| Approach radius circle | MapLibre dashed circle | `<Circle>` with `strokePattern` or dashed overlay |
| 3D pitch (50° tilt) | `map.setPitch(50)` | `camera={{ pitch: 50 }}` on `MapView` |
| Heading-based bearing | `map.easeTo({ bearing })` | `camera={{ heading: value }}` on `MapView` |
| FocusTarget pan | `map.flyTo({ center, zoom })` | `animateToRegion()` via `MapView` ref |
| postMessage bridge | JSON string over WebView | Direct React props — no bridge needed |

### 3.2 Secondary Replacement: OSRM → Google Directions API

Three locations call OSRM directly:

1. `hooks/useRoadEta.ts` — ETA for next station or pickup
2. `hooks/useRoadPolyline.ts` — Road-snapped polyline for shuttle segments
3. `components/MapBackdrop.native.tsx` (inline) — On-demand ride route

All three must be updated to call the Google Directions API (or a backend proxy that calls it).

**Routing payload format changes:**

| Property | OSRM | Google Directions API |
|---|---|---|
| Request format | `GET /route/v1/driving/{lng,lat;lng,lat}` | `GET /maps/api/directions/json?origin=&destination=&key=` |
| Geometry format | GeoJSON `LineString` coordinates | Encoded polyline (needs decode library) |
| ETA field | `routes[0].legs[0].duration.value` (seconds) | `routes[0].legs[0].duration.value` (seconds) |
| Distance field | `routes[0].legs[0].distance.value` (meters) | `routes[0].legs[0].distance.value` (meters) |
| Multi-waypoint | Coordinate list in URL | `waypoints=` parameter |

Google returns encoded polylines. A small decoder utility (`@mapbox/polyline` or `google-polyline`) must be added to parse them into `[{ latitude, longitude }]` arrays for `<Polyline>`.

### 3.3 Configuration Replacements

| Item | Current | Required |
|---|---|---|
| `app.json` plugins | No map plugin | Add `react-native-maps` config plugin |
| Android API key | Not set | `googleMapsApiKey` in `app.json` android block |
| iOS API key | Not set | `googleMapsApiKey` in `app.json` ios block |
| `react-native-webview` | Used for map | Dependency retained only if used elsewhere; remove map usage |
| CDN dependency | `unpkg.com/maplibre-gl` | Removed entirely |
| CARTO tiles | Used as base map | Removed; replaced by Google Maps tiles |

### 3.4 What Does NOT Need to Change

The following are completely unaffected by this migration:

- `useDriverLocation.ts` — GPS acquisition via `expo-location` is map-library-agnostic
- `useLocationBroadcast.ts` — Socket.io emission has nothing to do with the map
- `useActiveLocationTracking.ts` — Batch tracking is a REST concern
- `lib/socketContext.tsx` — No map dependency
- `lib/api.ts` — All REST endpoints remain the same
- `constants/socketEvents.ts` — Event names unchanged
- All trip lifecycle logic (`app/ride/[rideId].tsx`, `app/shuttle/trip-active.tsx`, `app/trips/[tripId].tsx`)
- `useWaitingCharge.ts`, `useRideSocket.ts`, proximity detection (Haversine), approach alerts
- Backend/server — no backend changes required for the map migration

---

## 4. Google Maps Integration Strategy by Service

### 4.1 Driver App

**Repo:** `VeeGo-Driver`  
**Complexity:** High — most feature-rich map usage

**Features to migrate:**
- Real-time driver marker with heading-based rotation (updates every 5s)
- Pickup and dropoff markers
- Road-snapped polyline for active ride route
- Surge zone visualization (colored circles with multiplier labels)
- Shuttle station markers (numbered, 3 status states)
- 250m approach circle (dashed)
- Navigation mode: 3D pitch (50°) + bearing aligned to driver heading
- FocusTarget camera control from parent screens

**Key decisions:**

**Camera / Navigation Mode:**  
`react-native-maps` supports `camera` prop with `pitch`, `heading`, `zoom`, and `center`. The existing logic that sets `pitch: 50` and bearing from driver heading translates directly to the `camera` prop. Use `MapView.animateCamera()` for smooth transitions — this is equivalent to MapLibre's `easeTo`.

**Surge Zones:**  
Currently rendered as MapLibre circle layers. Use `<Circle>` from `react-native-maps`. Surge zone labels (the multiplier text) need a positioned `<Marker>` at the zone center with a custom label view, since `<Circle>` does not support child content.

**Station Markers:**  
Currently HTML-rendered numbered divs with color-coded backgrounds. Replace with `<Marker>` components using a custom `<View>` containing a styled `<Text>` for the station number. Status (pending/current/completed) drives the color.

**Driver Marker Rotation:**  
Use `<Marker rotation={heading}>`  with a flat marker image (`flat={true}` prop) so rotation follows the bearing correctly without tilting in 3D view.

**Approach Circle:**  
Use `<Circle strokeColor="yellow" strokeWidth={2} fillColor="transparent">` with a `lineDashPattern` if needed (iOS supports this natively; Android may require a workaround with a custom dashed stroke overlay or approximated with `<Polyline>`).

---

### 4.2 Passenger App

**Repo:** `VeeGo-Passenger` (separate repo — same strategy applies)  
**Complexity:** Medium

**Assumed features based on ride-hailing context:**
- Live driver location marker (received via socket, not GPS)
- Pickup location pin (draggable)
- Dropoff location pin (draggable)
- Route polyline (driver → pickup → dropoff)
- Place search / autocomplete

**Key decisions:**

**Place Autocomplete:**  
If the passenger app uses a location search, the current implementation likely uses a custom input with a geocoding API. Migrating to Google Maps enables **Google Places Autocomplete**, which is significantly better for address resolution. This is a separate API (`Places API`) and requires its own billing enablement — it does not automatically come with the Maps API key.

**Driver Location Marker:**  
The passenger sees the driver's location as received via socket (not their own GPS). The marker update is purely data-driven. Use `<Marker coordinate={driverLocation}>` and update the coordinate prop in state. For smooth animation, use `<Marker.Animated>` backed by an `Animated.ValueXY`.

**Route Polyline:**  
Same OSRM → Google Directions replacement as the driver app.

---

### 4.3 Shuttle Service

**Repo:** Used within `VeeGo-Driver` — same `MapBackdrop` component  
**Complexity:** Medium-High (station lifecycle is GPS-driven)

**Features specific to shuttle:**
- Multi-station route polyline (road-snapped, segment by segment)
- Station markers with 3 states (pending, current, completed)
- Current → next station segment only (rest greyed out)
- Approach circle at 250m from next station
- ETA to next station (refreshed via OSRM, 30s throttle)

**Key decisions:**

**Segment-by-Segment Polyline:**  
`useRoadPolyline` fetches only the current → next station segment. This maps cleanly to a single Google Directions call with `origin` and `destination`. No waypoints are needed per segment. The hook interface stays the same; only the API call inside changes.

**Station Markers:**  
Each station needs its number displayed. `<Marker>` with a custom `<View>` + `<Text>` child works well. The status color (grey/yellow/green) is driven by the existing `stationStatuses` array prop — that prop interface stays the same.

**Approach Circle:**  
Same as driver app. `<Circle>` at the current station's coordinates with a 250m radius.

**Proximity Detection:**  
The 250m Haversine check in `trip-active.tsx` runs entirely in JS against GPS coordinates. It has **no dependency on the map library** and does not change.

---

### 4.4 Delivery App

**Repo:** `VeeGo-Delivery` (separate repo — same strategy applies)  
**Complexity:** Medium

**Assumed features:**
- Pickup location (restaurant / warehouse)
- Dropoff location (customer address)
- Driver location marker
- Route polyline
- Possibly multi-stop (multiple deliveries per run)

**Key decisions:**

**Multi-stop Routing:**  
If the delivery app supports multiple stops per run, use Google Directions with intermediate `waypoints`. OSRM supports this via a coordinate list; Google Directions uses a `waypoints=` parameter. The shape is the same — both return a full polyline and per-leg ETAs.

**Estimated Delivery Time:**  
Google Directions returns `duration_in_traffic` when traffic model is enabled. This is more accurate than OSRM's static duration for delivery ETA. Evaluate enabling `departure_time=now` for live traffic-aware ETAs (requires Directions API with traffic, which has different pricing).

---

### 4.5 Scooter App

**Repo:** `VeeGo-Scooter` (separate repo — same strategy applies)  
**Complexity:** Low-Medium

**Assumed features:**
- Scooter location pins (fleet view)
- User location
- Dock/parking zone markers
- Possibly geofenced riding zones

**Key decisions:**

**Fleet Markers:**  
If the scooter map shows many scooter pins at once (fleet density), performance matters. React Native Maps handles hundreds of `<Marker>` components acceptably on both platforms, but above ~500 markers, clustering becomes necessary. Consider `react-native-maps-clustering` or a server-side cluster endpoint that returns pre-clustered GeoJSON at different zoom levels.

**Geofenced Zones:**  
If riding zones or no-go zones are polygons (not circles), use `<Polygon coordinates={[...]} />` from `react-native-maps`. This is a direct replacement for MapLibre's fill layer.

---

## 5. Unified Shared Map System Design

### 5.1 Single Shared Component

All five services should share a single `VeeGoMap` component living in a shared package or a copy-per-repo strategy. Given that each service is a separate Expo repo, a **copy-per-repo approach** is more pragmatic (avoids monorepo overhead). The component interface is defined once here and replicated.

### 5.2 Proposed `VeeGoMap` Component Interface

```typescript
// Stable public interface — same across all service apps

type MarkerStatus = 'pending' | 'current' | 'completed';

interface StationMarker {
  id: string;
  latitude: number;
  longitude: number;
  label: string;       // station number or name
  status: MarkerStatus;
}

interface SurgeZone {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;      // meters
  multiplier: number;
}

interface VeeGoMapProps {
  // Core
  driverLocation?: { latitude: number; longitude: number; heading?: number | null };
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };

  // Route
  routePolyline?: Array<{ latitude: number; longitude: number }>;

  // Shuttle
  stationMarkers?: StationMarker[];
  approachCircle?: { latitude: number; longitude: number; radius: number };

  // Surge
  surgeZones?: SurgeZone[];

  // Camera
  navigationMode?: boolean;
  focusTarget?: { latitude: number; longitude: number; zoom?: number };
  animDurationMs?: number;

  // Style
  style?: ViewStyle;
}
```

This interface is **intentionally identical to the current `MapBackdrop` props**. Replacing `MapBackdrop` with `VeeGoMap` everywhere is a find-and-replace, not a logic rewrite.

### 5.3 Internal Architecture of `VeeGoMap`

```
VeeGoMap
├── <MapView provider={PROVIDER_GOOGLE} customMapStyle={darkStyle} camera={...}>
│   ├── <Marker> — driver (flat, rotation=heading)
│   ├── <Marker> — pickup
│   ├── <Marker> — dropoff
│   ├── <Polyline> — route (blue, 4px)
│   ├── <Circle> — approach radius (dashed yellow)
│   ├── <Circle> × N — surge zones (color-coded)
│   ├── <Marker> × N — surge zone labels (text overlay at center)
│   └── <Marker> × N — station markers (custom status view)
└── (no WebView, no bridge, no CDN)
```

### 5.4 Dark Map Style

Google Maps supports a custom JSON style that produces a dark theme equivalent to the current CARTO dark tiles. A dark style JSON (available at the Google Maps Platform Styling Wizard) must be included as a constant and passed to `<MapView customMapStyle={darkStyle}>`. This is a one-time setup per app and does not require any API calls.

### 5.5 API Key Management

Each service app needs two Google Maps API keys:

| Key | Platform | Configured in |
|---|---|---|
| Android Maps API Key | Android | `app.json` → `android.config.googleMaps.apiKey` |
| iOS Maps API Key | iOS | `app.json` → `ios.config.googleMapsApiKey` |

Store keys in EAS secrets (environment variables), not committed to source control. Reference them in `app.config.ts` (dynamic config) as `process.env.GOOGLE_MAPS_API_KEY_ANDROID` etc.

For the **Directions API** (routing), use a **separate restricted key** that is called from the backend only — never embedded in the mobile client. Client-side Directions API calls expose the key and have no usage restriction granularity.

---

## 6. Data Flow Changes

### 6.1 GPS and Location Updates — No Change

```
expo-location watchPositionAsync
       ↓
useDriverLocation (state)
       ↓
useLocationBroadcast (socket.io emit / REST fallback)
       ↓
Backend → passenger/admin receives updates
```

This entire chain is unchanged. The map receives the driver's position as a React prop and renders the marker. No part of this flow touches the map library.

### 6.2 Routing / Polyline — API Change Only

**Current:**
```
useRoadPolyline / useRoadEta
       ↓
fetch(https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson)
       ↓
GeoJSON coordinates array → passed to MapBackdrop as routePolyline prop
```

**After migration:**
```
useRoadPolyline / useRoadEta
       ↓
fetch(https://{backend}/api/directions?origin={lat,lng}&destination={lat,lng})
       ↓
Backend calls Google Directions API (server-side, key protected)
Backend returns { polyline: [{lat,lng}], distanceM: number, durationS: number }
       ↓
Decoded coordinate array → passed to VeeGoMap as routePolyline prop
```

The hook interface (`useRoadPolyline`, `useRoadEta`) does not change. Only the `fetch` call inside them changes. The rest of the app is unaffected.

**Why proxy through backend:**  
Google Maps API keys used in Directions API cannot be HTTP-referrer restricted for mobile. Without a proxy, the key is extractable from the APK/IPA and can be abused. A thin backend proxy endpoint adds negligible latency and eliminates key exposure risk.

### 6.3 Camera Control — Bridge Removed

**Current:**
```
React state change
       ↓
buildMessage({ type: 'setCamera', ... })
       ↓
webviewRef.current.injectJavaScript(...)   ← WebView bridge
       ↓
MapLibre JS: map.easeTo({ center, bearing, pitch, zoom })
```

**After migration:**
```
React state change
       ↓
mapViewRef.current.animateCamera({ center, heading, pitch, zoom }, { duration })
```

Direct native call. No bridge. No serialization. Latency drops from ~30-80ms (WebView bridge round-trip) to native frame timing.

### 6.4 Socket Events — No Change

The socket event `driver:location:update` with payload `{ latitude, longitude, speed, heading, tripId }` is unchanged. The backend broadcasts this to the passenger/admin side. The map on the receiving end updates a marker coordinate — the underlying mechanism is the same regardless of map library.

### 6.5 Surge Zones — Data Model Unchanged

Surge zones arrive via socket as `{ id, latitude, longitude, radius, multiplier }`. The data model is identical. The rendering changes from a MapLibre circle layer to `<Circle>` + `<Marker>` (for the label). No backend change needed.

---

## 7. Step-by-Step Migration Phases

### Phase 0 — Prerequisites (Week 1)

**Goal:** Enable Google Maps in the Expo project without touching any map UI.

**Steps:**

1. **Obtain API keys**
   - Create a Google Cloud project (or use existing)
   - Enable: Maps SDK for Android, Maps SDK for iOS
   - Create two separate API keys: one for Android (restrict to package name + SHA-1), one for iOS (restrict to bundle ID)
   - Store keys in EAS secrets: `GOOGLE_MAPS_API_KEY_ANDROID`, `GOOGLE_MAPS_API_KEY_IOS`

2. **Add `react-native-maps` config plugin to `app.json`**
   - `react-native-maps` already in `package.json` — no `npm install` needed
   - Add the plugin entry pointing to the Android/iOS keys from EAS environment

3. **Convert `app.json` to `app.config.ts`** (if not already dynamic)
   - Required to reference `process.env` variables for API keys

4. **Trigger an EAS Build**
   - Run a development build to confirm Google Maps initializes on both platforms without errors
   - The build generates a new binary — test on a real device, not Expo Go (Google Maps requires native build)

5. **Obtain a Directions API key (backend use only)**
   - Restrict to server IP if possible
   - Pass to backend team for proxy endpoint implementation
   - Backend delivers endpoint: `GET /api/directions?origin=&destination=&waypoints=`

**Exit criteria:** A working dev build on Android and iOS that loads Google Maps (even if just a blank map view in a test screen).

---

### Phase 1 — Parallel Map Component (Weeks 2–3)

**Goal:** Build the new `VeeGoMap` component without removing the old one. Both exist in the codebase simultaneously.

**Steps:**

1. **Create `components/VeeGoMap.tsx`**
   - Implement all features from the interface defined in Section 5.2
   - Start with: base MapView + dark style + single static marker
   - Incrementally add: driver marker, route polyline, pickup/dropoff markers, camera control

2. **Add dark map style JSON**
   - Use Google Maps Styling Wizard to generate a dark style equivalent to the current CARTO dark theme
   - Store as `constants/mapStyle.ts` — a static JSON array

3. **Port camera logic**
   - Replace `buildMessage({ type: 'setCamera' })` with `mapViewRef.current.animateCamera()`
   - Port navigation mode (50° pitch + heading bearing) to `camera` prop

4. **Port markers**
   - Driver marker: `<Marker flat rotation={heading}>`
   - Pickup / dropoff: `<Marker>` with custom icon
   - Station markers: `<Marker>` with custom `<View>` + `<Text>` for status-based color

5. **Port overlays**
   - Surge zones: `<Circle>` + `<Marker>` for label
   - Approach circle: `<Circle>` with dashed stroke
   - Route polyline: `<Polyline>`

6. **Add a feature flag**
   - `USE_GOOGLE_MAPS=true/false` environment variable
   - The existing `MapBackdrop` renders when flag is `false`; `VeeGoMap` renders when flag is `true`
   - This enables instant rollback without a new build

**Exit criteria:** `VeeGoMap` renders correctly behind the feature flag in a development build, with feature parity verified manually.

---

### Phase 2 — Routing Migration (Weeks 3–4)

**Goal:** Replace OSRM with Google Directions API (via backend proxy).

**Steps:**

1. **Update `useRoadPolyline.ts`**
   - Replace `fetch` to OSRM with `fetch` to `/api/directions`
   - Replace GeoJSON coordinate parsing with polyline decoding
   - Preserve the hook's existing interface: same inputs, same return shape
   - Keep fallback (return `null` on failure)

2. **Update `useRoadEta.ts`**
   - Same: replace OSRM call with `/api/directions` call
   - Parse `duration.value` and `distance.value` from Google response
   - Preserve throttle (30s interval, 80m movement threshold)
   - Preserve fallback speed estimate

3. **Update inline OSRM call in `MapBackdrop.native.tsx`**
   - This is eliminated when `MapBackdrop` is replaced by `VeeGoMap` in Phase 3
   - In the interim, update it to use the backend proxy too, so OSRM is fully removed before the map swap

4. **Add polyline decode utility**
   - Install `@mapbox/polyline` (or equivalent small utility)
   - Wrap in a `decodePolyline(encoded: string): Coord[]` helper

**Exit criteria:** Route polylines and ETAs are served via Google Directions. OSRM calls are zero. Routing works on the development build in all tested scenarios (ride, shuttle segment).

---

### Phase 3 — Driver App Cutover (Week 5)

**Goal:** Replace `MapBackdrop` with `VeeGoMap` in the driver app behind the feature flag.

**Steps:**

1. **Enable `USE_GOOGLE_MAPS=true` in a staging build**
2. **Remove all `MapBackdrop` usage** and replace with `VeeGoMap` in:
   - `app/ride/[rideId].tsx`
   - `app/shuttle/trip-active.tsx`
   - Any other screen using `MapBackdrop`
3. **Run full QA pass** on a real Android device and a real iOS device:
   - On-demand ride: all phases (to_pickup, arrived, in_trip, completed)
   - Shuttle trip: station progression, approach trigger, ETA display
   - Surge zone display
   - Navigation mode camera behavior
   - SOS button (location still transmitted via socket)
4. **Submit build to TestFlight (iOS) and internal track (Android)**
5. **Hold for 48–72 hours** of internal testing
6. **Promote to production** (full rollout)
7. **Remove `MapBackdrop.native.tsx`** and `react-native-webview` map usage once stable

**Exit criteria:** Production build ships with Google Maps. WebView map is removed. Feature flag is no longer needed.

---

### Phase 4 — Remaining Service Apps (Weeks 6–8)

**Goal:** Apply the same migration to Passenger, Shuttle (if separate repo), Delivery, and Scooter.

**Steps:**

- Repeat Phases 1–3 for each repo independently
- Copy the finalized `VeeGoMap.tsx`, `mapStyle.ts`, and routing hooks from the driver app
- Adjust per-service props as needed (e.g., passenger app may not need station markers)
- Each app gets its own EAS build and TestFlight/internal track cycle

**Recommended order:** Passenger → Delivery → Scooter (decreasing complexity / user sensitivity)

---

### Phase 5 — Cleanup (Week 9)

1. Remove `react-native-webview` from `package.json` if it is no longer used for any other purpose in any app
2. Remove all remaining OSRM references and constants
3. Remove the `USE_GOOGLE_MAPS` feature flag and all conditional rendering
4. Remove `components/MapBackdrop.native.tsx`
5. Archive the MapLibre CDN URL constants
6. Confirm EAS builds succeed without MapLibre artifacts

---

## 8. Risks and Breaking Points

### 8.1 Critical Risks

| Risk | Severity | Likelihood | Notes |
|---|---|---|---|
| Google Maps API key exposed client-side (Directions) | Critical | High if not proxied | Mitigated by routing all Directions calls through backend proxy |
| EAS Build required — Expo Go no longer works for testing | High | Certain | Dev team must have EAS Build set up. Cannot test map on Expo Go. |
| `react-native-maps` 3D pitch behavior differs by platform | High | Medium | Android's Google Maps SDK supports `tilt`; iOS supports `pitch`. Both work via `react-native-maps` camera prop but may feel different. Must test on real devices. |
| Google Maps billing — unexpected cost spike | High | Medium | Maps SDK loads are free up to quota. Directions API and Places API are pay-per-use. Set billing alerts immediately. |
| Dark custom JSON style not pixel-perfect | Low | High | Custom JSON styles are approximate. Will not exactly match CartoDB dark. Accept minor visual differences. |
| Approach circle dashed stroke — Android inconsistency | Medium | Medium | `lineDashPattern` on `<Circle>` is iOS-only in `react-native-maps`. Android requires a workaround (`<Polyline>` approximation of a circle). |
| `react-native-maps` New Architecture (Fabric) compatibility | High | Low | `newArchEnabled: true` in this project. `react-native-maps` v1.27.2 has Fabric support. Test explicitly on both platforms with New Arch enabled. |

### 8.2 Breaking Points During Migration

**Expo Go incompatibility:**  
Google Maps requires a native module that Expo Go does not include. From Phase 1 onward, all testing must use a development build (EAS Build or local `expo run:android` / `expo run:ios`). Any team member relying on Expo Go for live preview will lose that workflow.

**WebView removal:**  
If `react-native-webview` is used for anything other than the map (e.g., in-app browser, embedded content), it must be kept in `package.json`. Only the map-related usage is removed. Audit all `WebView` imports before removing the package.

**iOS Google Maps SDK size:**  
The Google Maps iOS SDK adds ~30–40MB to the IPA binary. This is expected and unavoidable. Ensure App Store binary size limits are not breached (currently 4GB for OTA, 150MB for cellular download).

**OSRM public server reliability:**  
The current architecture depends on `router.project-osrm.org`, a public community server with no SLA. If this server is down currently and nobody noticed, it means the polyline gracefully falls back to `null`. After the migration, confirm the Google Directions proxy is monitored.

**API Key Restriction Gotcha:**  
Android Maps API keys must be restricted to the correct package name AND SHA-1 fingerprint. If the wrong SHA-1 is used (debug vs release keystore), the map will fail silently or show a blank grey screen. Test with both debug and release keys explicitly.

---

## 9. Complexity and Effort Estimation

### Per-Service Effort

| Service | Map Features | Routing | Effort (dev days) | Notes |
|---|---|---|---|---|
| Driver App | High (markers, surge zones, station markers, 3D nav, approach circle) | Yes (ETA + polyline) | 8–10 days | Most complex; leads the migration |
| Passenger App | Medium (driver marker, pickup/dropoff, route) | Yes (route polyline) | 4–5 days | Possibly includes Places Autocomplete |
| Shuttle App | Medium (subset of Driver) | Yes | 3–4 days | Shares components with Driver |
| Delivery App | Medium (multi-stop possible) | Yes | 4–5 days | Multi-stop routing adds complexity |
| Scooter App | Low-Medium (fleet markers, zones) | No or minimal | 3–4 days | Marker clustering if >100 pins |
| Backend proxy (Directions API) | — | — | 1–2 days | Thin proxy endpoint, any backend language |
| QA + Builds per service | — | — | 2–3 days each | Real device testing on both platforms |

### Total Estimate

| Category | Effort |
|---|---|
| Development (all 5 apps) | 22–28 dev days |
| Backend proxy | 1–2 dev days |
| QA and builds (all apps) | 10–15 dev days |
| Buffer / unexpected issues | 5–8 dev days |
| **Total** | **38–53 dev days (~8–11 weeks for one team)** |

*Assumes 1–2 engineers working in parallel on different service apps after the driver app establishes the pattern.*

### Complexity Rating by Component

| Component | Complexity |
|---|---|
| `VeeGoMap` base (MapView + camera) | Low |
| Driver / pickup / dropoff markers | Low |
| Route polyline | Low |
| Surge zone circles + labels | Medium |
| Station markers with status | Medium |
| Navigation mode (pitch + bearing) | Medium |
| Approach circle (dashed, Android) | Medium-High |
| Directions API proxy + hook swap | Medium |
| Polyline decode + integration | Low |
| EAS Build + key management | Low-Medium |
| New Architecture compatibility | Low (library supports it) |
| Feature flag / parallel rollout | Low |

---

## 10. Final Recommendation

### Architecture Choice

**Use `react-native-maps` with `PROVIDER_GOOGLE` as the migration target.**

This is the lowest-risk path available:

- The library is **already installed** (`v1.27.2` in `package.json`) — no new native dependency introduction
- It is the most battle-tested map library in the React Native ecosystem
- It has explicit New Architecture (Fabric) support, which matters since this project has `newArchEnabled: true`
- The `VeeGoMap` component interface can be made **API-compatible with the existing `MapBackdrop` props**, minimizing changes across calling screens
- The feature flag approach means the old WebView map remains as a one-line rollback option until the new map is proven stable in production

### What to Avoid

- **Do not use `@react-native-mapbox-gl` or `@rnmapbox/maps`** as an intermediate step. While MapLibre (current) and Mapbox share heritage, migrating to a native Mapbox SDK is equal effort to migrating to Google Maps without the reliability or tooling advantages.
- **Do not call Google Directions API directly from the mobile client.** Always proxy through the backend. This is non-negotiable for key security.
- **Do not attempt to keep the WebView-based map as a fallback in production.** CDN-dependent map rendering is an operational risk. The WebView bridge is a latency source. Remove it completely once native Google Maps is stable.
- **Do not migrate all apps simultaneously.** The driver app is the most complex and most operationally sensitive. Completing it first validates the pattern, the build pipeline, and the routing proxy before touching the other four services.

### Recommended Rollout Order

```
Driver App (Phase 1–3) → Passenger App → Delivery App → Scooter App
                 ↑
         Shuttle runs in Driver repo — migrated in same cycle
```

### Summary

The migration is well-scoped and low-risk because `react-native-maps` is already installed, the component interface is stable, the location/socket layer is untouched, and the only net-new infrastructure is a thin backend proxy for Directions API. A disciplined 8–10 week execution migrates all five services to a fully native, Google Maps-backed map system with no WebView dependencies, no CDN dependencies, and a clear rollback path at each phase.
