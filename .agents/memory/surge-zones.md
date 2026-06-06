---
name: Surge zone implementation
description: How live surge zones are wired from socket to map across the app
---

# Surge Zone Implementation

## Data flow
1. Backend emits `surge:updated` socket event (via `SOCKET_EVENTS.SURGE_UPDATED`)
2. `useRideSocket` normalizes payload (array / `{zones:[]}` wrapper / single object) → `SurgeZone[]`
3. `onSurgeUpdated` callback → `setSurgeZones` in home screen state
4. `<MapBackdrop surgeZones={zones}>` renders colored overlays

## SurgeZone type (exported from `useRideSocket.ts` and both MapBackdrop files)
```ts
{ id: string; latitude: number; longitude: number; radius: number; multiplier: number }
```
radius is in **meters**.

## Color scale
- 1.0–1.5×: amber (`rgba(213,178,61,...)`)
- 1.5–2.0×: orange (`rgba(249,115,22,...)`)
- 2.0×+: red (`rgba(239,68,68,...)`)

## Web (MapLibre)
- Two layers on `surge-zones` GeoJSON source: `surge-fill` (fill) + `surge-stroke` (line dashed)
- Circle polygons generated client-side via `geoCirclePolygon()` helper (lat/lng/radius → 48-point polygon)
- Multiplier label markers added/removed via `surgeMarkersRef`
- Source updated reactively via `useEffect([surgeZones])` calling `source.setData(...)`

## Native (react-native-maps)
- `<Circle>` overlay per zone (radius in meters, fill/stroke colors)

## Home screen badge
- Amber pill positioned absolutely at `bottom: TAB_BAR_HEIGHT + 140` (adjusts up if locationError banner also showing)
- Shows "1.5× surge zone" (single) or "N surge zones active" (multiple)
