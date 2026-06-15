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
 * - Redirects to /service-select after REDIRECT_DELAY_MS if blocked.
 *
 * Returns { isBlocked, status } for the caller to render a blocked UI
 * during the brief delay before the redirect fires.
 */
export function useServiceGuard(explicitType?: ServiceType): {
  isBlocked: boolean;
  status: ServiceStatus;
} {
  const { serviceType: contextType } = useService();
  const { getServiceStatus, refresh, isLoading: servicesLoading } = useServiceControl();
  const { isLoading: authLoading } = useAuth();
  const type = explicitType ?? contextType;

  const status = getServiceStatus(type);
  // While auth or services are still loading their first fetch, never block.
  // The blocked UI + redirect timer must not fire on transient loading state.
  const blocked = (authLoading || servicesLoading) ? false : isHardBlocked(status);

  // Track redirect so we only schedule one redirect per block episode.
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasBlockedRef = useRef(false);

  // On mount: always re-fetch from API for freshness (spec §4).
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // React to state changes (from refresh or socket).
  useEffect(() => {
    if (blocked && !wasBlockedRef.current) {
      wasBlockedRef.current = true;
      // Show the blocked UI briefly, then redirect.
      redirectTimerRef.current = setTimeout(() => {
        router.replace('/(shuttle)');
      }, 2800);
    }

    if (!blocked) {
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
  }, [blocked, status.displayMode]);

  return { isBlocked: blocked, status };
}
