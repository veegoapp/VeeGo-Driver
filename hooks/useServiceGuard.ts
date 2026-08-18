import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useServiceControl, ServiceStatus } from '@/lib/serviceControlContext';
import { useService, ServiceType } from '@/lib/serviceContext';
import { useAuth } from '@/lib/authContext';

// Modes that hard-block access to the active service screen.
// 'coming_soon' is intentionally excluded — it is already unselectable on
// service-select, and should not block the guard if somehow reached.
// Only 'unavailable' (isEnabled=false) and 'maintenance' cause a redirect.
const HARD_BLOCK_MODES = new Set(['unavailable', 'maintenance']);

function isHardBlocked(status: ServiceStatus): boolean {
  // No backend config at all — block (config missing means unknown state).
  if (!status.visible) return true;
  // Explicitly disabled or under maintenance — block.
  if (HARD_BLOCK_MODES.has(status.displayMode)) return true;
  // 'live' (available or ineligible) and 'coming_soon' — do NOT block.
  return false;
}

/**
 * Enforces service access control on screen entry.
 *
 * - Fires a fresh API fetch on mount (socket alone is not enough per spec).
 * - Reactively re-evaluates whenever context state changes (socket updates).
 * - Redirects to /login after a short delay if blocked — unless
 *   suppressRedirect is true, in which case the forced navigation is held
 *   off (e.g. while an active ride screen is still open) until it becomes
 *   false again. Suppression never changes the returned isBlocked/status.
 *
 * Returns { isBlocked, status } for the caller to render a blocked UI
 * during the brief delay before the redirect fires.
 */
export function useServiceGuard(explicitType?: ServiceType, suppressRedirect?: boolean): {
  isBlocked: boolean;
  status: ServiceStatus;
} {
  const { serviceType: contextType } = useService();
  const { getServiceStatus, refresh, isLoading: servicesLoading, error: servicesError } = useServiceControl();
  const { isLoading: authLoading } = useAuth();
  const type = explicitType ?? contextType;

  const status = getServiceStatus(type);
  // A failed /services/control fetch makes getServiceStatus() return
  // ERROR_BLOCKED, whose displayMode ('unavailable') trips isHardBlocked() —
  // so a transient network error was indistinguishable from an admin
  // actually disabling the service. That's most visible right as a ride
  // finishes: app/ride/[rideId].tsx only acts on isBlocked once phase is
  // 'completed', so a driver with a flaky connection (not unusual mid-drive)
  // would have the trip-completed fare/rating screen replaced by
  // ServiceBlockedScreen within a frame of it appearing — showing as a flash
  // that vanishes before the fare is even readable. A fetch failure is not
  // evidence the service is actually blocked, so treat it the same as the
  // loading state below: never block on it.
  const blocked = (authLoading || servicesLoading || !!servicesError) ? false : isHardBlocked(status);
  // Drives the redirect-scheduling effect only — isBlocked/status returned
  // below always reflect the real `blocked` value regardless of suppression.
  const shouldRedirect = blocked && !suppressRedirect;

  // Track redirect so we only schedule one redirect per block episode.
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasBlockedRef = useRef(false);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // React to state changes (from refresh, socket, or suppression toggling).
  useEffect(() => {
    if (shouldRedirect && !wasBlockedRef.current) {
      wasBlockedRef.current = true;
      // Show the blocked UI briefly, then redirect away from this service.
      redirectTimerRef.current = setTimeout(() => {
        router.replace('/login');
      }, 2800);
    }

    if (!shouldRedirect) {
      wasBlockedRef.current = false;
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    }

    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [shouldRedirect, status.displayMode]);

  return { isBlocked: blocked, status };
}
