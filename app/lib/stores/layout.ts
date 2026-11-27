import { atom } from 'nanostores';
import { isTouchLayout } from '~/lib/touchLayout';

/**
 * Phone layout state (below 768 px wide). The desktop layout does not use it,
 * except the sidebar, which both layouts open through `sidebarOpen`.
 */

/** Phone breakpoint: the compact layout is used below this width (UnoCSS `touch:`). */
export const PHONE_MAX_WIDTH = 768;

/** Whether the chat history sidebar is open. */
export const sidebarOpen = atom(false);

/**
 * True in the touch layout: narrower than PHONE_MAX_WIDTH, or a coarse pointer
 * (a phone on "Desktop site" too). False on the server. See ~/lib/touchLayout.
 */
export function isPhoneWidth(): boolean {
  return isTouchLayout();
}

/** Chat box text area on a phone: one line to start, growing to about four lines. */
export const PHONE_TEXTAREA_MIN_HEIGHT = 44;
export const PHONE_TEXTAREA_MAX_HEIGHT = 112;

/** Event the sidebar listens to, so other places (the phone account menu) can open Settings. */
export const OPEN_SETTINGS_EVENT = 'ca:open-settings';

export function openSettings() {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
  }
}

/** Whether Settings (the Control Panel) is open; the header logo then stays under it. */
export const settingsPanelOpen = atom(false);

/** Phone: whether the full-screen "Projects" page is open. */
export const projectsPageOpen = atom(false);
