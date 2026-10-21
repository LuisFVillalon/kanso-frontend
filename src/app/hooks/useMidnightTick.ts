import { useEffect, useState } from 'react';

/**
 * Returns the current Date, refreshed once at local midnight and every 24h
 * after that — for components that only need to know "what day is it now"
 * (e.g. an in-session check against a date range) rather than a live clock.
 * A single setTimeout to the next midnight, then a 24h setInterval, avoids
 * polling every second just to catch a day boundary.
 */
export function useMidnightTick(): Date {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const update = () => setNow(new Date());
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const timeUntilMidnight = midnight.getTime() - Date.now();
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      update();
      interval = setInterval(update, 24 * 60 * 60 * 1000);
    }, timeUntilMidnight);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  return now;
}
