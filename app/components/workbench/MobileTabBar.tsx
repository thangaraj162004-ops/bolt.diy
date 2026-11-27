import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

/**
 * Phone only (below 768 px; hidden by CSS on larger screens): a bottom tab
 * bar that switches between Chat, Code and Preview. The chat and the
 * workbench each fill the screen; this bar is how the user moves between them.
 */

export type MobileTab = 'chat' | 'code' | 'preview';

/** Height of the bar (h-14), used to keep content above it. */
export const MOBILE_TAB_BAR_HEIGHT = '3.5rem';

const TABS: Array<{ id: MobileTab; label: string; icon: string }> = [
  { id: 'chat', label: 'Chat', icon: 'i-ph:chat-circle-text' },
  { id: 'code', label: 'Code', icon: 'i-ph:code' },
  { id: 'preview', label: 'Preview', icon: 'i-ph:eye' },
];

/** Which tab is active, from the workbench state. */
export function activeMobileTab(showWorkbench: boolean, view: string): MobileTab {
  if (!showWorkbench) {
    return 'chat';
  }

  return view === 'preview' ? 'preview' : 'code';
}

/** Shows the chat, or the workbench with the code or the preview. */
export function selectMobileTab(tab: MobileTab) {
  if (tab === 'chat') {
    workbenchStore.showWorkbench.set(false);
    return;
  }

  workbenchStore.showWorkbench.set(true);
  workbenchStore.selectWorkbenchView(tab, { userInitiated: true });
}

export function MobileTabBar() {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const view = useStore(workbenchStore.currentView);
  const active = activeMobileTab(showWorkbench, view);

  return (
    <nav
      aria-label="Switch view"
      className="md:hidden fixed inset-x-0 bottom-0 z-[50] flex border-t border-ca-elements-borderColor bg-ca-elements-background-depth-1 pb-[env(safe-area-inset-bottom)]"
      data-testid="mobile-tab-bar"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={active === tab.id}
          onClick={() => selectMobileTab(tab.id)}
          className={classNames(
            'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 bg-transparent text-xs font-medium',
            active === tab.id ? 'text-accent-500' : 'text-ca-elements-textSecondary',
          )}
        >
          <span className={classNames(tab.icon, 'text-xl')} aria-hidden="true" />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
