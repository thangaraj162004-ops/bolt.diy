import { authDialog, outOfCreditsDialog, refreshBalance } from './auth';
import type { CreditsErrorCode } from './credits-config';

/**
 * Browser side of the credits for AI messages.
 *
 * The browser does NOT spend credits: /api/chat does that on the server before
 * it calls the AI (app/lib/.server/credits.ts). The browser only sends the
 * user's access token with each chat request, opens the right dialog when the
 * server says "please log in" or "out of credits", and refreshes the badge.
 * The Supabase client is loaded only when needed, so supabase-js stays out of
 * the chat's first load.
 */

export { CREDITS_PER_MESSAGE } from './credits-config';

async function loadClient() {
  return (await import('./client')).supabase;
}

/** The logged-in user's access token, or undefined (logged out or no Supabase). */
export async function getAccessToken(): Promise<string | undefined> {
  const client = await loadClient();

  if (!client) {
    return undefined;
  }

  try {
    const { data } = await client.auth.getSession();
    return data.session?.access_token;
  } catch {
    return undefined;
  }
}

/** Headers for /api/chat: `Authorization: Bearer <token>` when logged in. */
export async function chatAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Before sending: when Supabase is set up and nobody is logged in, open the log
 * in dialog and do not send (the server would refuse anyway). Spends nothing.
 */
export async function mayTrySend(): Promise<boolean> {
  const client = await loadClient();

  if (!client) {
    return true;
  }

  if (await getAccessToken()) {
    return true;
  }

  authDialog.set({ hint: 'Log in to send your message.' });

  return false;
}

/** The credits error code in a /api/chat error body (a JSON string or object), if any. */
export function creditsErrorCode(body: unknown): CreditsErrorCode | undefined {
  let value = body;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  const code = typeof value === 'object' && value ? (value as { code?: unknown }).code : undefined;

  return code === 'login_required' || code === 'out_of_credits' || code === 'credits_unavailable' ? code : undefined;
}

/**
 * Shows the dialog for a "please log in" or "out of credits" answer from
 * /api/chat. Returns true when it was one of those (nothing else to show).
 */
export function showCreditsError(code: CreditsErrorCode | undefined): boolean {
  if (code === 'login_required') {
    authDialog.set({ hint: 'Please log in to send a message.' });
    return true;
  }

  if (code === 'out_of_credits') {
    outOfCreditsDialog.set(true);
    void refreshCreditsBadge();

    return true;
  }

  return false;
}

/** Reads the balance again for the header badge (after a reply starts). */
export async function refreshCreditsBadge(): Promise<void> {
  const client = await loadClient();

  if (client) {
    await refreshBalance(client);
  }
}
