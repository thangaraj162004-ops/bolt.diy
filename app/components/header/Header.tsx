import { useStore } from '@nanostores/react';
import { lazy, Suspense } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { BrandWordmark } from '~/components/ui/BrandWordmark';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';

// loaded on its own so supabase-js stays out of the first page load; renders nothing without Supabase
const AccountMenu = lazy(() =>
  import('~/components/auth/AccountMenu.client').then((m) => ({ default: m.AccountMenu })),
);

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header
      className={classNames('flex items-center px-4 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-ca-elements-borderColor': chat.started,
      })}
    >
      <div className="flex items-center gap-2 z-logo text-ca-elements-textPrimary cursor-pointer">
        <div className="i-ph:sidebar-simple-duotone text-xl" />
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          <BrandWordmark className="text-xl" />
        </a>
      </div>
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          <span className="flex-1 px-4 truncate text-center text-ca-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      )}
      <div className={classNames('flex items-center', chat.started ? 'ml-2' : 'ml-auto')}>
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
