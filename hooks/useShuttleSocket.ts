/**
 * useShuttleSocket
 *
 * Binds shuttle-specific Socket.io event listeners.
 * Follows the same stable-ref pattern as useRideSocket to avoid re-binding
 * on every render.
 *
 * Mount this hook once at the shuttle layout level (inside both ReferralProvider
 * and SocketProvider) via the ShuttleReferralBridge component in _layout.tsx.
 *
 * Events bound here:
 *   shuttle:booking:created   → navigate to bookings screen (cache invalidation
 *                               is handled exclusively by ShuttleProvider to avoid
 *                               duplicate invalidations and wrong cache key bugs)
 *   shuttle:referral:incoming → add to referral queue (badge + banner)
 *   shuttle:referral:cancelled → remove a withdrawn referral from the queue
 *
 * NOTE: SHUTTLE_BOOKING_CANCELLED is intentionally NOT handled here.
 *       ShuttleProvider (shuttleContext.tsx) is the single source of truth for
 *       all booking cache invalidations.
 */

import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { useSocket } from '@/lib/socketContext';
import {
  useReferral,
  type IncomingReferralPayload,
} from '@/lib/referralContext';

type BookingCreatedPayload = {
  bookingId?: number | string;
  routeId?: number | string;
  routeName?: string;
  timeSlotId?: number | string;
  departureTime?: string;
  weekStart?: string;
  weekEnd?: string;
  status?: string;
};

export function useShuttleSocket() {
  const { socket } = useSocket();
  const { addIncomingReferral, dismissReferral } = useReferral();

  const addRef = useRef(addIncomingReferral);
  addRef.current = addIncomingReferral;

  const dismissRef = useRef(dismissReferral);
  dismissRef.current = dismissReferral;

  useEffect(() => {
    if (!socket) return;

    // Navigation side-effect only — cache invalidation handled by ShuttleProvider
    const handleBookingCreated = (_payload: BookingCreatedPayload) => {
      router.push('/(shuttle)/bookings' as any);
    };

    const handleIncomingReferral = (payload: IncomingReferralPayload) => {
      if (!payload?.referralId) return;
      addRef.current(payload);
    };

    const handleReferralCancelled = (data: { referralId?: string } | string) => {
      const referralId =
        typeof data === 'string' ? data : (data?.referralId ?? '');
      if (referralId) dismissRef.current(referralId);
    };

    socket.on(SOCKET_EVENTS.SHUTTLE_BOOKING_CREATED, handleBookingCreated);
    socket.on(SOCKET_EVENTS.SHUTTLE_INCOMING_REFERRAL, handleIncomingReferral);
    socket.on(SOCKET_EVENTS.SHUTTLE_REFERRAL_CANCELLED, handleReferralCancelled);

    return () => {
      socket.off(SOCKET_EVENTS.SHUTTLE_BOOKING_CREATED, handleBookingCreated);
      socket.off(SOCKET_EVENTS.SHUTTLE_INCOMING_REFERRAL, handleIncomingReferral);
      socket.off(SOCKET_EVENTS.SHUTTLE_REFERRAL_CANCELLED, handleReferralCancelled);
    };
  }, [socket]);
}
