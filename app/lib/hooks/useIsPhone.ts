import { useEffect, useState } from 'react';
import { TOUCH_LAYOUT_QUERY } from '~/lib/touchLayout';

/**
 * True in the touch layout: below 768 px OR with a coarse pointer (a phone on
 * "Desktop site" too); see ~/lib/touchLayout. Safe during server rendering: it
 * starts false and updates after mounting, then follows changes.
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const query = window.matchMedia(TOUCH_LAYOUT_QUERY);
    const update = () => setIsPhone(query.matches);

    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  return isPhone;
}
