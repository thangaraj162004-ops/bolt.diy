import { useStore } from '@nanostores/react';
import { lazy, Suspense } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { BrandWordmark } from '~/components/ui/BrandWordmark';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { chatStore } from '~/lib/stores/chat';
import { sidebarOpen } from '~/lib/stores/layout';
import { classNames } from '~/utils/classNames';

// loaded on its own so supabase-js stays out of the first page load; renders nothing without Supabase
const AccountMenu = lazy(() =>
  import('~/components/auth/AccountMenu.client').then((m) => ({ default: m.AccountMenu })),
);

export function Header() {
  const chat = useStore(chatStore);
  const isSidebarOpen = useStore(sidebarOpen);

  return (
    <header
      className={classNames('flex items-center px-4 max-md:px-1 max-md:gap-1 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-ca-elements-borderColor': chat.started,
      })}
    >
      {/* phone: no z-logo, so the open sidebar covers the header (it has its own close button) */}
      <div className="flex items-center gap-2 max-md:gap-0 min-w-0 z-logo max-md:!z-auto text-ca-elements-textPrimary cursor-pointer">
        {/* opens and closes the chat history (the only way on a phone: there is no mouse hover) */}
        <button
          type="button"
          aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isSidebarOpen}
          onClick={() => sidebarOpen.set(!sidebarOpen.get())}
          className="flex items-center justify-center bg-transparent max-md:w-11 max-md:h-11 max-md:shrink-0"
        >
          <span className="i-ph:sidebar-simple-duotone text-xl" aria-hidden="true" />
        </button>
        <a href="/" className="text-2xl font-semibold text-accent flex items-center max-md:min-w-0 max-md:truncate">
          <BrandWordmark className="text-xl max-md:text-lg" />
        </a>
      </div>
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          {/* the project name: hidden on a phone, where it is in the menu and there is no room */}
          <span className="flex-1 px-4 truncate text-center text-ca-elements-textPrimary max-md:hidden">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="max-md:ml-auto max-md:shrink-0">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      )}
      <div className={classNames('flex items-center max-md:shrink-0', chat.started ? 'ml-2 max-md:ml-1' : 'ml-auto')}>
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
