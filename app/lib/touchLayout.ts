/**
 * Layout rules, shared by the CSS variants in uno.config.ts and the app code.
 *
 * - Phone layout (`touch:` variant, isTouchLayout, useIsPhone): narrower than
 *   768 px. Compact chat box, bottom Chat/Code/Preview tabs, bottom sheets.
 *   (The variant keeps its Task 11F name `touch:`.)
 * - Desktop layout (`mouse:` variant): 768 px and wider, with a mouse or a
 *   finger. A phone on "Desktop site" gets the desktop look.
 * - Wide touch (`touch-wide:` variant, useTouchWide): 768 px and wider with a
 *   finger. Only its account area differs from the desktop.
 * - Touch input (isTouchInput): narrow OR a finger. No screen-edge gestures,
 *   Back closes the open sheet first, no sideways overscroll.
 */
export const TOUCH_LAYOUT_QUERY = '(max-width: 767.9px)';

/** Exactly the opposite of the phone layout. */
export const MOUSE_LAYOUT_QUERY = '(min-width: 768px)';

/** The desktop layout used with a finger (a tablet, or a phone on "Desktop site"). */
export const TOUCH_WIDE_QUERY = '(min-width: 768px) and (pointer: coarse)';

/** A phone-sized screen or a finger: no edge gestures, Back closes overlays first. */
export const TOUCH_INPUT_QUERY = '(max-width: 767.9px), (pointer: coarse)';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

/** True in the phone layout (false on the server). */
export function isTouchLayout(): boolean {
  return matches(TOUCH_LAYOUT_QUERY);
}

/** True for the desktop layout used with a finger. */
export function isTouchWide(): boolean {
  return matches(TOUCH_WIDE_QUERY);
}

/** True on a phone-sized screen or with a finger. */
export function isTouchInput(): boolean {
  return matches(TOUCH_INPUT_QUERY);
}
