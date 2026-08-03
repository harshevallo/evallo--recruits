import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A second-by-second countdown. `start(seconds)` begins it; `seconds` reaches 0 and stops.
 * Used for the resend-email cooldown (AUTH-02).
 */
export function useCountdown() {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (from) => {
      clear();
      setSeconds(from);
      timerRef.current = setInterval(() => {
        setSeconds((current) => {
          if (current <= 1) {
            clear();
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  return { seconds, isActive: seconds > 0, start };
}
