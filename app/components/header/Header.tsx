import { useStore } from '@nanostores/react';
import { lazy, Suspense } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { BrandWordmark } from '~/components/ui/BrandWordmark';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { chatStore } from '~/lib/stores/chat';
import { settingsPanelOpen, sidebarOpen } from '~/lib/stores/layout';
import { classNames } from '~/utils/classNames';

// loaded on its own so supabase-js stays out of the first page load; renders nothing without Supabase
const AccountMenu = lazy(() =>
  import('~/components/auth/AccountMenu.client').then((m) => ({ default: m.AccountMenu })),
);

export function Header() {
  const chat = useStore(chatStore);
  const isSidebarOpen = useStore(sidebarOpen);
  const isSettingsOpen = useStore(settingsPanelOpen);

  return (
    <header
      className={classNames('flex items-center px-4 touch:px-1 touch:gap-1 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-ca-elements-borderColor': chat.started,
      })}
    >
      {/* phone: no z-logo, so the open sidebar covers the header (it has its own close button) */}
      {/* while Settings is open the logo stays under it (it covered "Back to project" on short screens) */}
      <div
        className={classNames(
          'flex items-center gap-2 touch:gap-0 min-w-0 z-logo touch:!z-auto text-ca-elements-textPrimary cursor-pointer',
          { '!z-auto': isSettingsOpen },
        )}
        data-testid="header-logo"
      >
        {/* opens and closes the chat history (the only way on a phone: there is no mouse hover) */}
        <button
          type="button"
          aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isSidebarOpen}
          onClick={() => sidebarOpen.set(!sidebarOpen.get())}
          className="flex items-center justify-center bg-transparent touch:w-11 touch:h-11 touch:shrink-0"
        >
          <span className="i-ph:sidebar-simple-duotone text-xl" aria-hidden="true" />
        </button>
        <a href="/" className="text-2xl font-semibold text-accent flex items-center touch:min-w-0 touch:truncate">
          <BrandWordmark className="text-xl touch:text-lg" />
        </a>
      </div>
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          {/* the project name: hidden on a phone, where it is in the menu and there is no room */}
          <span className="flex-1 px-4 truncate text-center text-ca-elements-textPrimary touch:hidden">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="touch:ml-auto touch:shrink-0">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      )}
      <div className={classNames('flex items-center touch:shrink-0', chat.started ? 'ml-2 touch:ml-1' : 'ml-auto')}>
        <ClientOnly>
          {() => (
            <Suspense fallback={null}>
              <AccountMenu />
            </Suspense>
          )}
        </ClientOnly>
      </div>
    </header>
  );
}
