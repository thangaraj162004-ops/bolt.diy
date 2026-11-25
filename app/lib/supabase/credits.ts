import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'react-toastify';
import { authDialog, outOfCreditsDialog, setBalance } from './auth';

/**
 * Credits per AI message (TEST VERSION).
 *
 * This check runs in the browser, so anyone can skip it: it is only for
 * testing. Before launch it must move to the server, before the paid AI is
 * called (see CLAUDE.md).
 */

/** Credits spent for each AI message the user sends. */
export const CREDITS_PER_MESSAGE = 1;

export const SPEND_REASON = 'ai message';

export type ChargeResult = 'not-configured' | 'charged' | 'login-required' | 'out-of-credits' | 'failed';

/** True when Postgres said the balance is too low (spend_credits: 'not enough credits'). */
export function isOutOfCredits(error: unknown): boolean {
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : '';
  return message.toLowerCase().includes('not enough credits');
}

/**
 * Spends CREDITS_PER_MESSAGE for one AI message. Opens the log in dialog when
 * logged out and the out-of-credits dialog when the balance is too low.
 * Without Supabase it does nothing ('not-configured').
 */
export async function chargeForMessage(client: SupabaseClient | null): Promise<ChargeResult> {
  if (!client) {
    return 'not-configured';
  }

  try {
    const {
      data: { session },
    } = await client.auth.getSession();

    if (!session) {
      authDialog.set({ hint: 'Log in to send your message.' });
      return 'login-required';
    }

    const { data, error } = await client.rpc('spend_credits', { amount: CREDITS_PER_MESSAGE, reason: SPEND_REASON });

    if (error) {
      if (isOutOfCredits(error)) {
        setBalance(0);
        outOfCreditsDialog.set(true);

        return 'out-of-credits';
      }

      throw error;
    }

    if (typeof data === 'number') {
      setBalance(data);
    }

    return 'charged';
  } catch (error) {
    console.error('Credits: could not spend credits:', error instanceof Error ? error.message : error);
    toast.error('Could not check your credits. Please try again.');

    return 'failed';
  }
}

/** True when the message may be sent. Loads the Supabase client only when it is used. */
export async function mayChargeAndSend(): Promise<boolean> {
  const { supabase } = await import('./client');
  const result = await chargeForMessage(supabase);

  return result === 'not-configured' || result === 'charged';
}
