import { useEffect, useState } from 'react';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';

export type WaitingCharge = {
  rideId: string;
  amount: number;
  minutes: number;
  capped?: boolean;
};

export function useWaitingCharge(
  _driverId: string | undefined,
  rideId: string | undefined,
): WaitingCharge | null {
  const { socket } = useSocket();
  const [charge, setCharge] = useState<WaitingCharge | null>(null);

  useEffect(() => {
    if (!socket || !rideId) return;

    const handleUpdated = (c: WaitingCharge) => {
      if (c.rideId === rideId) setCharge(c);
    };

    const handleCapped = (c: WaitingCharge) => {
      if (c.rideId === rideId) setCharge({ ...c, capped: true });
    };

    socket.on(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, handleUpdated);
    socket.on(SOCKET_EVENTS.WAITING_CHARGE_CAPPED, handleCapped);

    return () => {
      socket.off(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, handleUpdated);
      socket.off(SOCKET_EVENTS.WAITING_CHARGE_CAPPED, handleCapped);
    };
  }, [socket, rideId]);

  return charge;
}
