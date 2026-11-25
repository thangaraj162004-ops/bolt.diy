/**
 * Credit settings shared by the server check (app/lib/.server/credits.ts) and
 * the browser. Change the price of an AI message here.
 */

/** Credits spent for each new AI message the user sends. */
export const CREDITS_PER_MESSAGE = 1;

/** The credit_ledger reason for that spend. */
export const SPEND_REASON = 'ai message';

/** Error codes /api/chat returns instead of calling the AI. */
export type CreditsErrorCode = 'login_required' | 'out_of_credits' | 'credits_unavailable';
