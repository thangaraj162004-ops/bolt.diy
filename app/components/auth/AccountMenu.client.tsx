import { useStore } from '@nanostores/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AuthDialog } from './AuthDialog';
import { OutOfCreditsDialog } from './OutOfCreditsDialog';
import { authDialog, authState, outOfCreditsDialog, signOut, startAuth } from '~/lib/supabase/auth';
import { supabase as defaultClient } from '~/lib/supabase/client';

interface AccountMenuProps {
  /** For tests; defaults to the app's Supabase client. */
  client?: SupabaseClient | null;
}

const buttonClass =
  'rounded-lg border border-ca-elements-borderColor px-3 py-1.5 text-sm text-ca-elements-textPrimary hover:bg-ca-elements-background-depth-2';

/**
 * Header account area: "Log in" when logged out; the credit balance and
 * "Log out" when logged in. Renders nothing when Supabase is not configured.
 */
export function AccountMenu({ client = defaultClient }: AccountMenuProps) {
  const state = useStore(authState);
  const loginDialog = useStore(authDialog);
  const outOfCredits = useStore(outOfCreditsDialog);

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

  return (
    <div className="flex items-center gap-2">
      <span
        className="rounded-full bg-purple-500/10 px-3 py-1 text-sm font-medium text-purple-600 dark:text-purple-300"
        title={state.email ? `Logged in as ${state.email}` : undefined}
        data-testid="credits-badge"
      >
        {state.balance === null ? '… credits' : `${state.balance} ${state.balance === 1 ? 'credit' : 'credits'}`}
      </span>
      <button type="button" className={buttonClass} onClick={() => void signOut(client)}>
        Log out
      </button>
      <OutOfCreditsDialog open={outOfCredits} onClose={() => outOfCreditsDialog.set(false)} />
    </div>
  );
}
