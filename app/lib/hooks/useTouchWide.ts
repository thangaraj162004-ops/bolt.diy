import { useEffect, useState } from 'react';
import { TOUCH_WIDE_QUERY } from '~/lib/touchLayout';

/**
 * True for the desktop layout used with a finger (768 px and wider with a
 * coarse pointer, such as a phone on "Desktop site"). Starts false, so the
 * server and the first render match.
 */
export function useTouchWide(): boolean {
  const [touchWide, setTouchWide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const query = window.matchMedia(TOUCH_WIDE_QUERY);
    const update = () => setTouchWide(query.matches);

    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  return touchWide;
}
