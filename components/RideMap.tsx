import React from 'react';
import { MapBackdrop } from '@/components/MapBackdrop';
import { useDriverLocation } from '@/hooks/useDriverLocation';
import { useNavigationRoute } from '@/hooks/useNavigationRoute';

interface RideMapProps {
  locationTrackingEnabled: boolean;
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
  navDestination: { latitude: number; longitude: number } | null;
  navActive: boolean;
  navigationMode: boolean;
  focusTarget?: { latitude: number; longitude: number; zoom?: number } | null;
}

/**
 * Owns the GPS subscription (useDriverLocation) and the navigation/route
 * fetch (useNavigationRoute) for the ride screen's map, isolated into its own
 * component so a GPS tick (~1 Hz) only re-renders this small subtree instead
 * of the ~850-line RideScreen (buttons, sheets, modals, keypad, ...).
 *
 * Before this split, driverPosition lived as state directly in RideScreen
 * (via useDriverLocation), so every GPS fix re-executed the entire screen's
 * render — reconciling the whole JSX tree on the JS thread. That competed
 * directly with the 30fps AnimatedRegion interpolation loop
 * (useDriverTrackingBuffer, which has no native-driver path in
 * react-native-maps and is itself JS-thread-bound), starving it and
 * producing the "lags, freezes, then jumps to catch up" marker behavior.
 *
 * Wrapped in React.memo: RideScreen's own re-renders (busy-state toggles,
 * timers, unrelated UI) must not cascade into this component when none of
 * its own props actually changed. Callers must pass stable object identities
 * for pickup/dropoff/navDestination/focusTarget (already the case — see
 * mapPickup/mapDropoff/navDestination/arrivedFocusTarget in
 * app/ride/[rideId].tsx) or this memoization is defeated.
 */
export const RideMap = React.memo(function RideMap({
  locationTrackingEnabled,
  pickup,
  dropoff,
  navDestination,
  navActive,
  navigationMode,
  focusTarget,
}: RideMapProps) {
  const { position: driverPosition } = useDriverLocation(locationTrackingEnabled);
  const { routeCoords } = useNavigationRoute(driverPosition, navDestination, navActive);

  return (
    <MapBackdrop
      pickup={pickup}
      dropoff={dropoff}
      driverLocation={driverPosition ?? undefined}
      roadPolyline={routeCoords ?? undefined}
      navigationMode={navigationMode}
      focusTarget={focusTarget}
    />
  );
});
