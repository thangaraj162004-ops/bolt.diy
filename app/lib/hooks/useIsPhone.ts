import { useEffect, useState } from 'react';
import { PHONE_MAX_WIDTH } from '~/lib/stores/layout';

/**
 * True below PHONE_MAX_WIDTH (768 px). Safe during server rendering: it starts
 * false and updates after mounting, then follows window resizes.
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const query = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH - 0.1}px)`);
    const update = () => setIsPhone(query.matches);

    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  return isPhone;
}
