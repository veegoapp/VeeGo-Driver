import { useEffect, useState } from 'react';

const DEFAULT_LOCKOUT_SECONDS = 900;

/**
 * Shared lockout timer for the "N wrong codes → locked out for a while" shape
 * used by both phone-verification OTP (app/verify-otp.tsx) and password-reset
 * (app/forgot-password.tsx) — both endpoints return the same 429 { error, retryAfter }
 * on lockout, cleared immediately by requesting a fresh code.
 */
export function useCodeLockout() {
  const [locked, setLocked] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  useEffect(() => {
    if (!locked) return;
    if (lockoutRemaining <= 0) {
      setLocked(false);
      return;
    }
    const t = setTimeout(() => setLockoutRemaining(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [locked, lockoutRemaining]);

  const lock = (retryAfter?: number) => {
    setLocked(true);
    setLockoutRemaining(typeof retryAfter === 'number' ? retryAfter : DEFAULT_LOCKOUT_SECONDS);
  };

  const clear = () => {
    setLocked(false);
    setLockoutRemaining(0);
  };

  return { locked, lockoutRemaining, lock, clear };
}

export function formatLockoutCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
