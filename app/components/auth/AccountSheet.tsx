import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { UserAvatar } from '~/components/ui/UserAvatar';

interface AccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Null for a guest (not logged in). */
  user: { name: string; email?: string; credits: string; plan: string } | null;
  onSignIn: () => void;
  onBuyCredits: () => void;
  onSettings: () => void;
  onChatHistory: () => void;
  onProjects: () => void;
  onSignOut: () => void;
}

const rowClass =
  'flex min-h-[52px] w-full items-center gap-3 rounded-xl bg-transparent px-3 text-left text-base text-ca-elements-textPrimary hover:bg-ca-elements-item-backgroundActive';

function ActionRow({
  row,
  icon,
  children,
  onClick,
}: {
  row: string;
  icon: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" data-row={row} className={rowClass} onClick={onClick}>
      <span className={`${icon} shrink-0 text-xl text-ca-elements-textSecondary`} aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </button>
  );
}

/**
 * Phone only: the account menu as a bottom sheet (rounded top, drag handle,
 * tap the dark background to close). Rows are 52 px high.
 */
export function AccountSheet({
  open,
  onOpenChange,
  user,
  onSignIn,
  onBuyCredits,
  onSettings,
  onChatHistory,
  onProjects,
  onSignOut,
}: AccountSheetProps) {
  // close the sheet first, then do the action
  const then = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className="md:hidden fixed inset-0 z-[9998] bg-black/50"
          data-testid="account-sheet-backdrop"
        />
        <RadixDialog.Content
          className="md:hidden fixed inset-x-0 bottom-0 z-[9999] max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-ca-elements-borderColor bg-ca-elements-background-depth-1 px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-ca-elements-textPrimary shadow-2xl focus:outline-none"
          data-testid="account-sheet"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ca-elements-borderColor" aria-hidden="true" />
          <RadixDialog.Title className="sr-only">Account</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">Your account, credits and settings.</RadixDialog.Description>

          <div data-row="profile" className="flex min-h-[52px] items-center gap-3 px-3 py-1">
            <UserAvatar name={user?.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-medium">{user ? user.name : 'Guest'}</div>
              {user?.email && <div className="truncate text-sm text-ca-elements-textSecondary">{user.email}</div>}
            </div>
            {!user && (
              <button
                type="button"
                onClick={then(onSignIn)}
                className="min-h-11 shrink-0 rounded-full bg-ca-elements-button-primary-background px-4 text-sm font-semibold text-ca-elements-button-primary-text hover:bg-ca-elements-button-primary-backgroundHover"
              >
                Sign in
              </button>
            )}
          </div>

          {user && (
            <div data-row="credits" className="flex min-h-[52px] items-center gap-3 px-3">
              <span className="i-ph:coins shrink-0 text-xl text-ca-elements-textSecondary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-base">{user.credits}</div>
                <div className="break-words text-sm text-ca-elements-textSecondary">{user.plan}</div>
              </div>
            </div>
          )}

          <div className="my-1 h-px bg-ca-elements-borderColor" />

          {user && (
            <ActionRow row="buy" icon="i-ph:shopping-cart" onClick={then(onBuyCredits)}>
              Buy credits
            </ActionRow>
          )}
          <ActionRow row="settings" icon="i-ph:gear-six" onClick={then(onSettings)}>
            Settings
          </ActionRow>
          <ActionRow row="history" icon="i-ph:clock-counter-clockwise" onClick={then(onChatHistory)}>
            Chat history
          </ActionRow>
          <ActionRow row="projects" icon="i-ph:folder-simple" onClick={then(onProjects)}>
            Projects
          </ActionRow>
          {user && (
            <ActionRow row="signout" icon="i-ph:sign-out" onClick={then(onSignOut)}>
              Sign out
            </ActionRow>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
