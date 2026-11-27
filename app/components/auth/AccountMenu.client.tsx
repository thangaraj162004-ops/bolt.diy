import { useStore } from '@nanostores/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { AccountPopupMenu } from './AccountPopupMenu.client';
import { AccountSheet } from './AccountSheet';
import { AuthDialog } from './AuthDialog';
import { BuyCreditsDialog } from './BuyCreditsDialog';
import { OutOfCreditsDialog } from './OutOfCreditsDialog';
import { UserAvatar, displayName } from '~/components/ui/UserAvatar';
import { useTouchWide } from '~/lib/hooks/useTouchWide';
import { formatPlanDate } from '~/lib/payments/checkout';
import { planName } from '~/lib/payments/packs';
import { startProjectSync } from '~/lib/projects/sync';
import { openSettings, projectsPageOpen, sidebarOpen } from '~/lib/stores/layout';
import { profileStore } from '~/lib/stores/profile';
import { authDialog, authState, buyCreditsDialog, outOfCreditsDialog, signOut, startAuth } from '~/lib/supabase/auth';
import { supabase as defaultClient } from '~/lib/supabase/client';

interface AccountMenuProps {
  /** For tests; defaults to the app's Supabase client. */
  client?: SupabaseClient | null;
}

const buttonClass =
  'rounded-lg border border-ca-elements-borderColor px-3 py-1.5 touch:min-h-11 text-sm text-ca-elements-textPrimary hover:bg-ca-elements-background-depth-2';

/*
 * Phone: a 44 px tap area around the 40 px circle; the right margin puts the
 * circle 12 px from the screen edge (header padding 4 + margin 6 + 2).
 */
/** Wide touch screens: the 44 px avatar button that opens the account popup menu. */
const wideAvatarButtonClass = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-transparent p-0';

const avatarButtonClass =
  'mouse:hidden mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-transparent p-0';

function creditsLabel(balance: number | null) {
  return balance === null ? '… credits' : `${balance} ${balance === 1 ? 'credit' : 'credits'}`;
}

/**
 * Header account area: "Log in" when logged out; the credit balance and
 * "Log out" when logged in. Renders nothing when Supabase is not configured.
 */
export function AccountMenu({ client = defaultClient }: AccountMenuProps) {
  const state = useStore(authState);
  const loginDialog = useStore(authDialog);
  const outOfCredits = useStore(outOfCreditsDialog);
  const buyOpen = useStore(buyCreditsDialog);
  const profile = useStore(profileStore);
  const [sheetOpen, setSheetOpen] = useState(false);

  // a phone on "Desktop site" (wide, with a finger): only the credits chip and the avatar menu
  const touchWide = useTouchWide();

  useEffect(() => (client ? startAuth(client) : undefined), [client]);

  // signed in: save projects online (does nothing for guests)
  useEffect(() => (client ? startProjectSync(client) : undefined), [client]);

  if (!client || state.status === 'loading') {
    return null;
  }

  const sheetActions = {
    onSignIn: () => authDialog.set({}),
    onBuyCredits: () => buyCreditsDialog.set(true),
    onSettings: openSettings,
    onChatHistory: () => sidebarOpen.set(true),
    onProjects: () => projectsPageOpen.set(true),
    onSignOut: () => void signOut(client),
  };

  const authDialogElement = (
    <AuthDialog
      client={client}
      open={loginDialog !== null}
      hint={loginDialog?.hint}
      onClose={() => authDialog.set(null)}
    />
  );

  if (state.status === 'signed-out' && touchWide) {
    return (
      <>
        <AccountPopupMenu side="bottom" align="end" client={client}>
          <button type="button" aria-label="Account menu" data-testid="avatar-button" className={wideAvatarButtonClass}>
            <UserAvatar />
          </button>
        </AccountPopupMenu>
        {authDialogElement}
      </>
    );
  }

  if (state.status === 'signed-out') {
    return (
      <>
        <button type="button" className={`touch:hidden ${buttonClass}`} onClick={() => authDialog.set({})}>
          Log in
        </button>
        {/* phone: a guest avatar that opens the account sheet with "Sign in" */}
        <button
          type="button"
          aria-label="Account menu"
          data-testid="avatar-button"
          className={avatarButtonClass}
          onClick={() => setSheetOpen(true)}
        >
          <UserAvatar />
        </button>
        <AccountSheet open={sheetOpen} onOpenChange={setSheetOpen} user={null} {...sheetActions} />
        <AuthDialog
          client={client}
          open={loginDialog !== null}
          hint={loginDialog?.hint}
          onClose={() => authDialog.set(null)}
        />
      </>
    );
  }

  const plan = planName(state.plan);
  const planUntil = formatPlanDate(state.planUntil);
  const name = displayName(profile.username, state.email);

  const purchaseDialogs = (
    <>
      <OutOfCreditsDialog
        open={outOfCredits}
        onClose={() => outOfCreditsDialog.set(false)}
        onBuy={() => {
          outOfCreditsDialog.set(false);
          buyCreditsDialog.set(true);
        }}
      />
      <BuyCreditsDialog
        open={buyOpen}
        email={state.email}
        currentPlan={state.plan}
        currentPlanUntil={state.planUntil}
        onClose={() => buyCreditsDialog.set(false)}
      />
    </>
  );

  if (touchWide) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="flex items-center gap-1 whitespace-nowrap rounded-full bg-purple-500/10 px-2.5 py-1 text-sm font-medium text-purple-600 dark:text-purple-300"
          aria-label={creditsLabel(state.balance)}
          data-testid="credits-chip"
        >
          <span className="i-ph:coins text-base" aria-hidden="true" />
          {state.balance === null ? '…' : state.balance}
        </span>
        <AccountPopupMenu side="bottom" align="end" client={client}>
          <button type="button" aria-label="Account menu" data-testid="avatar-button" className={wideAvatarButtonClass}>
            <UserAvatar name={name} />
          </button>
        </AccountPopupMenu>
        {purchaseDialogs}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 touch:gap-1">
      {/* desktop: badge, plan, Buy credits and Log out side by side (unchanged) */}
      <span
        className="touch:hidden rounded-full bg-purple-500/10 px-3 py-1 text-sm font-medium text-purple-600 dark:text-purple-300"
        title={state.email ? `Logged in as ${state.email}` : undefined}
        data-testid="credits-badge"
      >
        {creditsLabel(state.balance)}
      </span>
      {plan && (
        <span
          className="touch:hidden rounded-full border border-purple-500/40 px-2 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-300"
          title={`${plan} plan until ${planUntil ?? ''}`}
          data-testid="plan-badge"
        >
          {plan}
        </span>
      )}
      <button type="button" className={`touch:hidden ${buttonClass}`} onClick={() => buyCreditsDialog.set(true)}>
        Buy credits
      </button>
      <button type="button" className={`touch:hidden ${buttonClass}`} onClick={() => void signOut(client)}>
        Log out
      </button>

      {/* phone: a one-line credits chip and an avatar that opens the account sheet */}
      <span
        className="mouse:hidden flex items-center gap-1 whitespace-nowrap rounded-full bg-purple-500/10 px-2.5 py-1 text-sm font-medium text-purple-600 dark:text-purple-300"
        aria-label={creditsLabel(state.balance)}
        data-testid="credits-chip"
      >
        <span className="i-ph:coins text-base" aria-hidden="true" />
        {state.balance === null ? '…' : state.balance}
      </span>
      <button
        type="button"
        aria-label="Account menu"
        data-testid="avatar-button"
        className={avatarButtonClass}
        onClick={() => setSheetOpen(true)}
      >
        <UserAvatar name={name} />
      </button>
      <AccountSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        user={{
          name,
          email: state.email,
          credits: creditsLabel(state.balance),
          plan: plan ? `${plan} plan${planUntil ? ` until ${planUntil}` : ''}` : 'No plan',
        }}
        {...sheetActions}
      />
      {purchaseDialogs}
    </div>
  );
}
