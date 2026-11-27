import { atom } from 'nanostores';

/**
 * Phone layout state (below 768 px wide). The desktop layout does not use it,
 * except the sidebar, which both layouts open through `sidebarOpen`.
 */

/** Phone breakpoint: the compact layout is used below this width (UnoCSS `max-md:`). */
export const PHONE_MAX_WIDTH = 768;

/** Whether the chat history sidebar is open. */
export const sidebarOpen = atom(false);

/** True when the window is narrower than PHONE_MAX_WIDTH (false on the server). */
export function isPhoneWidth(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < PHONE_MAX_WIDTH;
}

/** Chat box text area on a phone: one line to start, growing to about four lines. */
export const PHONE_TEXTAREA_MIN_HEIGHT = 44;
export const PHONE_TEXTAREA_MAX_HEIGHT = 112;
