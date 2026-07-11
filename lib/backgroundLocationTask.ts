import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const DRIVER_LOCATION_TASK = 'veego-driver-bg-location';

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
    const { latitude, longitude, speed, heading } = data.locations[0].coords;
    try {
      const { endpoints } = await import('./api');
      await endpoints.driver.updateLocation({
        latitude,
        longitude,
        ...(speed != null && speed >= 0 ? { speed: Math.round(speed * 3.6) } : {}),
        ...(heading != null && heading >= 0 ? { heading: Math.round(heading) } : {}),
      });
    } catch {
      // best-effort — a single missed update is acceptable
    }
  },
);
