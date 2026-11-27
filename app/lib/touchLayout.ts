/**
 * The one rule for the touch layout (phones and tablets), shared by the CSS
 * variants in uno.config.ts (`touch:` and `mouse:`) and by the app code.
 *
 * Touch layout = narrower than 768 px OR a coarse pointer (a finger). A phone
 * that asks for the "Desktop site" gets a wide viewport but keeps its coarse
 * pointer, so it still gets the touch layout. A desktop with a mouse is never
 * touch layout at 768 px and wider.
 */
export const TOUCH_LAYOUT_QUERY = '(max-width: 767.9px), (pointer: coarse)';

/**
 * Exactly the opposite: 768 px or wider with a fine pointer (mouse) or none.
 * Written without `not (...)` so older browsers read it too.
 */
export const MOUSE_LAYOUT_QUERY = '(min-width: 768px) and (pointer: fine), (min-width: 768px) and (pointer: none)';

/** Touch layout on a wide screen (a tablet, or a phone on "Desktop site"). */
export const TOUCH_WIDE_QUERY = '(min-width: 768px) and (pointer: coarse)';

/** True in the touch layout (false on the server). */
export function isTouchLayout(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(TOUCH_LAYOUT_QUERY).matches
    : false;
}
