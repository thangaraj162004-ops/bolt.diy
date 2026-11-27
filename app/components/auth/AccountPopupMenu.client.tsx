import { useStore } from '@nanostores/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { UserAvatar, displayName } from '~/components/ui/UserAvatar';
import { formatPlanDate } from '~/lib/payments/checkout';
import { planName } from '~/lib/payments/packs';
import { openSettings, projectsPageOpen } from '~/lib/stores/layout';
import { profileStore } from '~/lib/stores/profile';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import { authDialog, authState, buyCreditsDialog, signOut } from '~/lib/supabase/auth';
import { supabase as defaultClient } from '~/lib/supabase/client';
import { getThemeMode } from '~/types/theme';
import { classNames } from '~/utils/classNames';

interface AccountPopupMenuProps {
  /** What opens the menu: the chat list's user row or the header avatar. */
  children: ReactNode;

  /** Above the chat list's user row, below the header avatar. */
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';

  /** For tests; defaults to the app's Supabase client. */
  client?: SupabaseClient | null;
}

const rowClass =
  'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-ca-elements-textPrimary outline-none data-[highlighted]:bg-ca-elements-item-backgroundActive';

function creditsLabel(balance: number | null) {
  return balance === null ? '… credits' : `${balance} ${balance === 1 ? 'credit' : 'credits'}`;
}

/** The signed-in name (or email prefix), or '' for a guest. */
export function useAccountName(): string {
  const auth = useStore(authState);
  const profile = useStore(profileStore);

  return auth.status === 'signed-in' ? displayName(profile?.username, auth.email) : '';
}

/**
 * Wide touch screens (a phone on "Desktop site"): the account menu that opens
 * from the chat list's user row and from the header avatar. Tap outside
 * closes it.
 */
export function AccountPopupMenu({
  children,
  side = 'top',
  align = 'start',
  client = defaultClient,
}: AccountPopupMenuProps) {
  const auth = useStore(authState);
  const theme = useStore(themeStore);
  const name = useAccountName();
  const signedIn = auth.status === 'signed-in';
  const plan = signedIn ? planName(auth.plan) : undefined;
  const planUntil = signedIn ? formatPlanDate(auth.planUntil) : undefined;
  const dark = getThemeMode(theme) === 'dark';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          data-testid="account-popup"
          className="z-[1000] w-[260px] max-w-[calc(100vw-24px)] rounded-2xl border border-ca-elements-borderColor bg-ca-elements-background-depth-1 p-1.5 text-ca-elements-textPrimary shadow-xl"
        >
          <div className="flex min-h-11 items-center gap-3 px-3 py-2" data-row="profile">
            <UserAvatar name={name} />
            {signedIn ? (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{name}</div>
                {auth.email && <div className="truncate text-xs text-ca-elements-textSecondary">{auth.email}</div>}
              </div>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium">Guest</span>
                <DropdownMenu.Item
                  onSelect={() => authDialog.set({})}
                  className="flex min-h-11 cursor-pointer items-center rounded-full bg-ca-elements-button-primary-background px-4 text-sm font-semibold text-ca-elements-button-primary-text outline-none data-[highlighted]:bg-ca-elements-button-primary-backgroundHover"
                >
                  Sign in
                </DropdownMenu.Item>
              </>
            )}
          </div>

          {signedIn && (
            <div className="flex min-h-11 items-center gap-3 px-3 pb-2" data-row="credits">
              <span className="i-ph:coins shrink-0 text-lg text-ca-elements-textSecondary" aria-hidden="true" />
              <div className="min-w-0 flex-1 text-sm">
                <div>{creditsLabel(auth.balance)}</div>
                <div className="truncate text-xs text-ca-elements-textSecondary">
                  {plan ? `${plan} plan${planUntil ? ` until ${planUntil}` : ''}` : 'No plan'}
                </div>
              </div>
            </div>
          )}

          <DropdownMenu.Separator className="my-1 h-px bg-ca-elements-borderColor" />

          {signedIn && (
            <DropdownMenu.Item className={rowClass} data-row="buy" onSelect={() => buyCreditsDialog.set(true)}>
              <span className="i-ph:shopping-cart text-lg" aria-hidden="true" />
              Buy credits
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className={rowClass} data-row="settings" onSelect={openSettings}>
            <span className="i-ph:gear-six text-lg" aria-hidden="true" />
            Settings
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={rowClass}
            data-row="appearance"
            onSelect={(event) => {
              // keep the menu open: the switch shows the new mode
              event.preventDefault();
              toggleTheme();
            }}
          >
            <span className={classNames(dark ? 'i-ph:moon-stars' : 'i-ph:sun', 'text-lg')} aria-hidden="true" />
            <span className="flex-1">Appearance</span>
            <span
              role="switch"
              aria-checked={dark}
              aria-label="Dark mode"
              className={classNames(
                'relative h-6 w-10 shrink-0 rounded-full transition-colors',
                dark ? 'bg-accent-700' : 'bg-ca-elements-background-depth-3',
              )}
            >
              <span
                className={classNames(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-ca-elements-background-depth-1 shadow transition-all',
                  dark ? 'left-[18px]' : 'left-0.5',
                )}
              />
            </span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={rowClass} data-row="projects" onSelect={() => projectsPageOpen.set(true)}>
            <span className="i-ph:folder-simple text-lg" aria-hidden="true" />
            Projects
          </DropdownMenu.Item>
          {signedIn && client && (
            <DropdownMenu.Item className={rowClass} data-row="signout" onSelect={() => void signOut(client)}>
              <span className="i-ph:sign-out text-lg" aria-hidden="true" />
              Sign out
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The chat list's bottom-left user row on wide touch screens; opens the account menu above it. */
export function AccountUserRow({ client = defaultClient }: { client?: SupabaseClient | null }) {
  const auth = useStore(authState);
  const name = useAccountName();

  return (
    <AccountPopupMenu side="top" align="start" client={client}>
      <button
        type="button"
        aria-label="Account menu"
        data-testid="account-user-row"
        className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-transparent px-3 py-2 text-left hover:bg-ca-elements-item-backgroundActive"
      >
        <UserAvatar name={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ca-elements-textPrimary">{name || 'Guest'}</span>
          <span className="block truncate text-xs text-ca-elements-textSecondary">
            {auth.status === 'signed-in' ? auth.email : 'Sign in to keep your projects safe'}
          </span>
        </span>
        <span className="i-ph:caret-up-down shrink-0 text-ca-elements-textTertiary" aria-hidden="true" />
      </button>
    </AccountPopupMenu>
  );
}
