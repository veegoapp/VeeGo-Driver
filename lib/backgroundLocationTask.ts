import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const DRIVER_LOCATION_TASK = 'veego-driver-bg-location';

// Set by the active ride screen so this one background task can serve both
// states without a second registration: idle-online (no rideId) sends the
// generic driver ping; an active ride routes through the same ride-scoped
// tracking channel useActiveLocationTracking already uses, so backgrounding
// mid-ride doesn't leave the passenger-facing location stale if the
// foreground driver:ride:location interval gets throttled.
let activeRideId: number | null = null;

export function setActiveRideId(rideId: number | string | null): void {
  activeRideId = rideId == null ? null : Number(rideId);
}

/**
 * Stops the background location task if it is currently registered.
 * Safe to call from any context (e.g. logout handler) — no-op if not running.
 */
export async function stopLocationTracking(): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(DRIVER_LOCATION_TASK);
    if (registered) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } catch {
    // best-effort — a failed stop should never block logout
  }
}

// Defined at module level so the OS can wake this module and execute the task
// even when the app is backgrounded. Imported (side-effect) in app/_layout.tsx.
TaskManager.defineTask(
  DRIVER_LOCATION_TASK,
  async ({
    data,
    error,
  }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
    if (error || !data?.locations?.[0]) return;
    const loc = data.locations[0];
    const { latitude, longitude, speed, heading } = loc.coords;
    try {
      const { endpoints } = await import('./api');
      if (activeRideId != null) {
        // Active ride: same rideId-scoped channel as useActiveLocationTracking
        // (not the generic /driver/location ping) — avoids sending an
        // untagged duplicate on top of driver:ride:location while still
        // giving the ride a background-safe update if the JS interval stalls.
        await endpoints.tracking.sendLocation({
          entityType: 'driver',
          latitude,
          longitude,
          speed: speed != null && speed >= 0 ? speed : undefined,
          heading: heading != null && heading >= 0 ? heading : undefined,
          recordedAt: new Date(loc.timestamp).toISOString(),
          rideId: activeRideId,
          tripId: null,
          isOfflineSync: false,
        });
      } else {
        await endpoints.driver.updateLocation({
          latitude,
          longitude,
          ...(speed != null && speed >= 0 ? { speed: Math.round(speed * 3.6) } : {}),
          ...(heading != null && heading >= 0 ? { heading: Math.round(heading) } : {}),
        });
      }
    } catch {
      // best-effort — a single missed update is acceptable
    }
  },
);
