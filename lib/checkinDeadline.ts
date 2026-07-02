// Shared by the car (tabs) and shuttle home screens — both need to convert the
// periodic "long_shift" check-in deadline into minutes-from-now for /selfie's
// countdown, whether it came from the DRIVER_CHECKIN_REQUIRED socket payload
// or from GET /driver/checkin/status on cold start/reconnect.

// Payload for the periodic ("long_shift") check-in prompt — the shuttle-trip
// check-in prompt has its own payload ({ tripId, deadlineMinutes }) and is
// handled separately.
export type CheckinRequiredPayload = {
  reason?: string;
  deadline?: string;
  message?: string;
};

const DEFAULT_DEADLINE_MINUTES = 30;

export function computeDeadlineMinutes(deadline?: string | null): number {
  if (!deadline) return DEFAULT_DEADLINE_MINUTES;
  const ms = new Date(deadline).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return DEFAULT_DEADLINE_MINUTES;
  return Math.max(1, Math.round(ms / 60000));
}
