import { useStore } from '@nanostores/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AuthDialog } from './AuthDialog';
import { BuyCreditsDialog } from './BuyCreditsDialog';
import { OutOfCreditsDialog } from './OutOfCreditsDialog';
import { formatPlanDate } from '~/lib/payments/checkout';
import { planName } from '~/lib/payments/packs';
import { authDialog, authState, buyCreditsDialog, outOfCreditsDialog, signOut, startAuth } from '~/lib/supabase/auth';
import { supabase as defaultClient } from '~/lib/supabase/client';

interface AccountMenuProps {
  /** For tests; defaults to the app's Supabase client. */
  client?: SupabaseClient | null;
}

const buttonClass =
  'rounded-lg border border-ca-elements-borderColor px-3 py-1.5 max-md:min-h-11 text-sm text-ca-elements-textPrimary hover:bg-ca-elements-background-depth-2';

const menuItemClass =
  'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-sm text-ca-elements-textPrimary outline-none data-[highlighted]:bg-ca-elements-background-depth-3';

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

  useEffect(() => (client ? startAuth(client) : undefined), [client]);

  if (!client || state.status === 'loading') {
    return null;
  }

  if (state.status === 'signed-out') {
    return (
      <>
        <button type="button" className={buttonClass} onClick={() => authDialog.set({})}>
          Log in
        </button>
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

  return (
    <div className="flex items-center gap-2 max-md:gap-1">
      {/* desktop: badge, plan, Buy credits and Log out side by side (unchanged) */}
      <span
        className="max-md:hidden rounded-full bg-purple-500/10 px-3 py-1 text-sm font-medium text-purple-600 dark:text-purple-300"
        title={state.email ? `Logged in as ${state.email}` : undefined}
        data-testid="credits-badge"
      >
        {creditsLabel(state.balance)}
      </span>
      {plan && (
        <span
          className="max-md:hidden rounded-full border border-purple-500/40 px-2 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-300"
          title={`${plan} plan until ${planUntil ?? ''}`}
          data-testid="plan-badge"
        >
          {plan}
        </span>
      )}
      <button type="button" className={`max-md:hidden ${buttonClass}`} onClick={() => buyCreditsDialog.set(true)}>
        Buy credits
      </button>
      <button type="button" className={`max-md:hidden ${buttonClass}`} onClick={() => void signOut(client)}>
        Log out
      </button>

      {/* phone: a one-line credits chip and one account menu with the rest */}
      <span
        className="md:hidden flex items-center gap-1 whitespace-nowrap rounded-full bg-purple-500/10 px-2.5 py-1 text-sm font-medium text-purple-600 dark:text-purple-300"
        aria-label={creditsLabel(state.balance)}
        data-testid="credits-chip"
      >
        <span className="i-ph:coins text-base" aria-hidden="true" />
        {state.balance === null ? '…' : state.balance}
      </span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Account menu"
          className="md:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ca-elements-textPrimary hover:bg-ca-elements-background-depth-2"
        >
          <span className="i-ph:user-circle text-2xl" aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-[1000] min-w-[220px] max-w-[calc(100vw-1rem)] rounded-lg border border-ca-elements-borderColor bg-ca-elements-background-depth-1 p-1 shadow-lg"
            data-testid="account-menu"
          >
            <div className="px-3 py-2 text-xs text-ca-elements-textSecondary">
              {state.email && <div className="truncate">{state.email}</div>}
              <div>
                {creditsLabel(state.balance)}
                {plan ? ` · ${plan} plan${planUntil ? ` until ${planUntil}` : ''}` : ''}
              </div>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-ca-elements-borderColor" />
            <DropdownMenu.Item className={menuItemClass} onSelect={() => buyCreditsDialog.set(true)}>
              <span className="i-ph:shopping-cart text-base" aria-hidden="true" />
              Buy credits
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItemClass} onSelect={() => void signOut(client)}>
              <span className="i-ph:sign-out text-base" aria-hidden="true" />
              Log out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
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
    </div>
  );
}
