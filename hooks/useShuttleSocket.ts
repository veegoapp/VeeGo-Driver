/**
 * useShuttleSocket
 *
 * Binds shuttle-specific Socket.io event listeners for the referral flow.
 * Follows the same stable-ref pattern as useRideSocket to avoid re-binding
 * on every render.
 *
 * Mount this hook once at the shuttle layout level (inside both ReferralProvider
 * and SocketProvider) via the ShuttleReferralBridge component in _layout.tsx.
 *
 * TODO: Backend Integration - Connect to production Socket.io server and bind real event listeners
 * Events bound here:
 *   shuttle:referral:incoming  → add to referral queue (badge + banner)
 *   shuttle:referral:cancelled → remove a withdrawn referral from the queue
 */

import { useEffect, useRef } from 'react';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { useSocket } from '@/lib/socketContext';
import {
  useReferral,
  type IncomingReferralPayload,
} from '@/lib/referralContext';

export function useShuttleSocket() {
  const { socket } = useSocket();
  const { addIncomingReferral, dismissReferral } = useReferral();

  // Stable refs — handlers always see the latest context values without re-binding listeners
  const addRef = useRef(addIncomingReferral);
  addRef.current = addIncomingReferral;

  const dismissRef = useRef(dismissReferral);
  dismissRef.current = dismissReferral;

  useEffect(() => {
    if (!socket) return;

    // TODO: Backend Integration - Connect to production Socket.io server and bind real event listeners
    // The server emits SHUTTLE_INCOMING_REFERRAL ("shuttle:referral:incoming") to the
    // driver:<userId> room of the target driver (Driver 2).
    // Payload must conform to IncomingReferralPayload.
    const handleIncomingReferral = (payload: IncomingReferralPayload) => {
      if (!payload?.referralId) return;
      addRef.current(payload);
    };

    // TODO: Backend Integration - Connect to production Socket.io server and bind real event listeners
    // Emitted when Driver 1 withdraws or the referral expires before Driver 2 responds.
    const handleReferralCancelled = (data: { referralId?: string } | string) => {
      const referralId =
        typeof data === 'string' ? data : (data?.referralId ?? '');
      if (referralId) dismissRef.current(referralId);
    };

    socket.on(SOCKET_EVENTS.SHUTTLE_INCOMING_REFERRAL, handleIncomingReferral);
    socket.on(SOCKET_EVENTS.SHUTTLE_REFERRAL_CANCELLED, handleReferralCancelled);

    return () => {
      socket.off(SOCKET_EVENTS.SHUTTLE_INCOMING_REFERRAL, handleIncomingReferral);
      socket.off(SOCKET_EVENTS.SHUTTLE_REFERRAL_CANCELLED, handleReferralCancelled);
    };
  }, [socket]);
}
