import { api } from './_client';
import type { DriverActiveSession } from '@/lib/activeSession/types';

/**
 * Session endpoints — centralized ActiveSession recovery.
 * Contract: GET /api/driver/session → { data: DriverActiveSession | null }
 */
export const sessionEndpoints = {
  /**
   * Fetch the driver's current active session.
   * Returns null in the `data` field when there is no active session.
   * Called on cold start, foreground resume (when socket is unavailable),
   * and whenever an explicit refresh is required.
   */
  driverSession: () =>
    api.get<{ data: DriverActiveSession | null }>('/driver/session'),
};
