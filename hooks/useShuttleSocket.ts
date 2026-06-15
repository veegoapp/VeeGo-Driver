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
 *   shuttle:booking:created   → navigate to bookings screen (booking created for this driver)
 *   shuttle:booking:cancelled → dismiss booking from context + invalidate cache
 *   shuttle:referral:incoming → (legacy) add to referral queue (badge + banner)
 *   shuttle:referral:cancelled → (legacy) remove a withdrawn referral from the queue
 */

import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { useSocket } from '@/lib/socketContext';
import {
  useReferral,
  type IncomingReferralPayload,
} from '@/lib/referralContext';
import { useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();

  const addRef = useRef(addIncomingReferral);
  addRef.current = addIncomingReferral;

  const dismissRef = useRef(dismissReferral);
  dismissRef.current = dismissReferral;

  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    if (!socket) return;

    const handleBookingCreated = (_payload: BookingCreatedPayload) => {
      queryClientRef.current.invalidateQueries({ queryKey: ['shuttle-bookings'] });
      router.push('/(shuttle)/bookings' as any);
    };

    const handleBookingCancelled = (data: { bookingId?: string | number }) => {
      queryClientRef.current.invalidateQueries({ queryKey: ['shuttle-bookings'] });
      if (data?.bookingId) {
        queryClientRef.current.invalidateQueries({ queryKey: ['shuttle-booking', String(data.bookingId)] });
      }
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
    socket.on(SOCKET_EVENTS.SHUTTLE_BOOKING_CANCELLED, handleBookingCancelled);
    socket.on(SOCKET_EVENTS.SHUTTLE_INCOMING_REFERRAL, handleIncomingReferral);
    socket.on(SOCKET_EVENTS.SHUTTLE_REFERRAL_CANCELLED, handleReferralCancelled);

    return () => {
      socket.off(SOCKET_EVENTS.SHUTTLE_BOOKING_CREATED, handleBookingCreated);
      socket.off(SOCKET_EVENTS.SHUTTLE_BOOKING_CANCELLED, handleBookingCancelled);
      socket.off(SOCKET_EVENTS.SHUTTLE_INCOMING_REFERRAL, handleIncomingReferral);
      socket.off(SOCKET_EVENTS.SHUTTLE_REFERRAL_CANCELLED, handleReferralCancelled);
    };
  }, [socket]);
}
