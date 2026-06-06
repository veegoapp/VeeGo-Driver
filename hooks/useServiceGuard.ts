import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useServiceControl, ServiceStatus } from '@/lib/serviceControlContext';
import { useService, ServiceType } from '@/lib/serviceContext';

// Modes that hard-block access — 'live' with driver ineligibility only
// blocks the service-select screen, not the active service screen.
const HARD_BLOCK_MODES = new Set(['coming_soon', 'unavailable', 'maintenance']);

function isHardBlocked(status: ServiceStatus): boolean {
  if (!status.visible) return true;
  if (HARD_BLOCK_MODES.has(status.displayMode)) return true;
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
  const { getServiceStatus, refresh } = useServiceControl();
  const type = explicitType ?? contextType;

  const status = getServiceStatus(type);
  const blocked = isHardBlocked(status);

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
        router.replace('/service-select');
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
