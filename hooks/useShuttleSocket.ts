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
import { z } from 'zod';
import { router } from 'expo-router';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { useSocket } from '@/lib/socketContext';
import {
  useReferral,
  type IncomingReferralPayload,
} from '@/lib/referralContext';

const BookingCreatedPayloadSchema = z.object({
  bookingId: z.union([z.number(), z.string()]).optional(),
  routeId: z.union([z.number(), z.string()]).optional(),
  routeName: z.string().optional(),
  timeSlotId: z.union([z.number(), z.string()]).optional(),
  departureTime: z.string().optional(),
  weekStart: z.string().optional(),
  weekEnd: z.string().optional(),
  status: z.string().optional(),
}).passthrough();

const IncomingReferralSchema = z.object({
  referralId: z.string(),
}).passthrough();

const ReferralCancelledSchema = z.union([
  z.string(),
  z.object({ referralId: z.string().optional() }).passthrough(),
]);

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

    // Navigation side-effect only — cache invalidation handled by ShuttleProvider.
    // This event is also reused by POST /admin/trips/:id/assign-driver (manual
    // single-trip assignment), whose payload carries tripId/assignedBy instead
    // of a weekly bookingId — only navigate for the real weekly-booking case,
    // so a manual assignment doesn't yank the driver to the wrong screen.
    const handleBookingCreated = (raw: unknown) => {
      const parsed = BookingCreatedPayloadSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[Socket] Invalid ${SOCKET_EVENTS.SHUTTLE_BOOKING_CREATED} payload`, parsed.error.issues);
        return;
      }
      if (parsed.data.bookingId == null) return;
      router.push('/(shuttle)/bookings' as any);
    };

    const handleIncomingReferral = (raw: unknown) => {
      const parsed = IncomingReferralSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[Socket] Invalid ${SOCKET_EVENTS.SHUTTLE_INCOMING_REFERRAL} payload`, parsed.error.issues);
        return;
      }
      addRef.current(parsed.data as IncomingReferralPayload);
    };

    const handleReferralCancelled = (raw: unknown) => {
      const parsed = ReferralCancelledSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[Socket] Invalid ${SOCKET_EVENTS.SHUTTLE_REFERRAL_CANCELLED} payload`, parsed.error.issues);
        return;
      }
      const data = parsed.data;
      const referralId = typeof data === 'string' ? data : (data?.referralId ?? '');
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
