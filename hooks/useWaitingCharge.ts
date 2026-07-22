import { useEffect, useState } from 'react';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';

import type { WaitingCharge } from '@/lib/types';
export type { WaitingCharge } from '@/lib/types';

// Raw payload shapes actually sent by the backend (waiting-timer.ts) — field
// names and rideId type differ from the WaitingCharge shape this hook exposes.
interface RawWaitingChargeStarted {
  rideId: number | string;
  ratePerMinute: number;
  freeWindowMinutes: number;
  maxCharge: number;
}
interface RawWaitingChargeUpdated {
  rideId: number | string;
  elapsedMinutes: number;
  currentCharge: number;
  chargedMinutes: number;
  runningTotal: number;
  maxCharge: number;
}
interface RawWaitingChargeCapped {
  rideId: number | string;
  finalCharge: number;
  chargedMinutes: number;
  maxCharge: number;
}

export function useWaitingCharge(
  _driverId: string | undefined,
  rideId: string | undefined,
): WaitingCharge | null {
  const { socket } = useSocket();
  const [charge, setCharge] = useState<WaitingCharge | null>(null);

  useEffect(() => {
    if (!socket || !rideId) return;

    const matches = (incomingRideId: number | string) => String(incomingRideId) === rideId;

    const handleStarted = (c: RawWaitingChargeStarted) => {
      if (!matches(c.rideId)) return;
      // Free window just expired — no minutes charged yet.
      setCharge({ rideId, amount: 0, minutes: 0 });
    };

    const handleUpdated = (c: RawWaitingChargeUpdated) => {
      if (!matches(c.rideId)) return;
      setCharge({ rideId, amount: c.currentCharge, minutes: c.elapsedMinutes });
    };

    const handleCapped = (c: RawWaitingChargeCapped) => {
      if (!matches(c.rideId)) return;
      setCharge({ rideId, amount: c.finalCharge, minutes: c.chargedMinutes, capped: true });
    };

    socket.on(SOCKET_EVENTS.WAITING_CHARGE_STARTED, handleStarted);
    socket.on(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, handleUpdated);
    socket.on(SOCKET_EVENTS.WAITING_CHARGE_CAPPED, handleCapped);

    return () => {
      socket.off(SOCKET_EVENTS.WAITING_CHARGE_STARTED, handleStarted);
      socket.off(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, handleUpdated);
      socket.off(SOCKET_EVENTS.WAITING_CHARGE_CAPPED, handleCapped);
    };
  }, [socket, rideId]);

  return charge;
}
