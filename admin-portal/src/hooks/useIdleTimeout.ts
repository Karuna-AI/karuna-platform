import { useState, useEffect, useRef, useCallback } from 'react';

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const WARNING_BEFORE = 2 * 60 * 1000; // 2 minutes before timeout
const CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds

export function useIdleTimeout(onTimeout: () => void) {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const warningShownRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
    setShowWarning(false);
    setRemainingSeconds(0);
    // Clear any active countdown
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Track user activity — always update, even during warning
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      // If warning is shown and user interacts, dismiss it
      if (warningShownRef.current) {
        warningShownRef.current = false;
        setShowWarning(false);
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      }
    };

    events.forEach(event => document.addEventListener(event, handleActivity, { passive: true }));
    return () => {
      events.forEach(event => document.removeEventListener(event, handleActivity));
    };
  }, []);

  // Check idle state (JWT expiry is handled server-side via 401 responses)
  useEffect(() => {
    const interval = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current;
      const timeUntilTimeout = IDLE_TIMEOUT - idleTime;

      if (timeUntilTimeout <= 0) {
        onTimeout();
        return;
      }

      if (timeUntilTimeout <= WARNING_BEFORE && !warningShownRef.current) {
        warningShownRef.current = true;
        setShowWarning(true);
        setRemainingSeconds(Math.ceil(timeUntilTimeout / 1000));
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [onTimeout]);

  // Countdown when warning is shown
  useEffect(() => {
    if (!showWarning) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    countdownRef.current = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current;
      const timeUntilTimeout = IDLE_TIMEOUT - idleTime;

      if (timeUntilTimeout <= 0) {
        onTimeout();
        return;
      }

      setRemainingSeconds(Math.ceil(timeUntilTimeout / 1000));
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [showWarning, onTimeout]);

  return { showWarning, remainingSeconds, resetTimer };
}
