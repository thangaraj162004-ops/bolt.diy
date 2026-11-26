import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from './__fixtures__/fake-supabase';
import { authDialog, authState, outOfCreditsDialog } from './auth';

/*
 * The browser no longer spends credits (the server does, in /api/chat). It
 * sends the access token, opens the right dialog for the server's answer, and
 * refreshes the badge.
 */

const signedIn = { user: { id: 'user-1', email: 'a@b.co' }, access_token: 'user-token' };

async function loadWith(client: unknown) {
  vi.resetModules();
  vi.doMock('./client', () => ({ supabase: client }));

  const credits = await import('./credits');
  const auth = await import('./auth');

  return { ...credits, auth };
}

afterEach(() => {
  vi.doUnmock('./client');
  authState.set({ status: 'loading', balance: null });
  authDialog.set(null);
  outOfCreditsDialog.set(false);
});

describe('browser credits', () => {
  it('keeps CREDITS_PER_MESSAGE = 1 in one place', async () => {
    const { CREDITS_PER_MESSAGE } = await loadWith(null);
    expect(CREDITS_PER_MESSAGE).toBe(1);
  });

  it('never calls spend_credits', async () => {
    const client = fakeSupabase({ session: signedIn });
    const { mayTrySend, chatAuthHeaders, refreshCreditsBadge } = await loadWith(client);

    await mayTrySend();
    await chatAuthHeaders();
    await refreshCreditsBadge();

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('sends the access token with chat requests', async () => {
    const { chatAuthHeaders } = await loadWith(fakeSupabase({ session: signedIn }));
    expect(await chatAuthHeaders()).toEqual({ Authorization: 'Bearer user-token' });
  });

  it('sends no token, and changes nothing, without Supabase', async () => {
    const { chatAuthHeaders, mayTrySend, auth } = await loadWith(null);

    expect(await chatAuthHeaders()).toEqual({});
    expect(await mayTrySend()).toBe(true);
    expect(auth.authDialog.get()).toBeNull();
  });

  it('opens the log in dialog instead of sending when logged out', async () => {
    const { mayTrySend, chatAuthHeaders, auth } = await loadWith(fakeSupabase());

    expect(await chatAuthHeaders()).toEqual({});
    expect(await mayTrySend()).toBe(false);
    expect(auth.authDialog.get()).toEqual({ hint: 'Log in to send your message.' });
  });

  it('reads the error code from the /api/chat answer', async () => {
    const { creditsErrorCode } = await loadWith(null);

    expect(
      creditsErrorCode('{"error":true,"code":"login_required","message":"Please log in to send a message."}'),
    ).toBe('login_required');
    expect(creditsErrorCode({ code: 'out_of_credits' })).toBe('out_of_credits');
    expect(creditsErrorCode('{"error":true,"message":"Invalid API key"}')).toBeUndefined();
    expect(creditsErrorCode('not json')).toBeUndefined();
    expect(creditsErrorCode(undefined)).toBeUndefined();
  });

  it('shows the log in dialog for "please log in" and the out-of-credits dialog for "out of credits"', async () => {
    const { showCreditsError, auth } = await loadWith(fakeSupabase({ session: signedIn, balance: 0 }));

    expect(showCreditsError('login_required')).toBe(true);
    expect(auth.authDialog.get()).toEqual({ hint: 'Please log in to send a message.' });

    expect(showCreditsError('out_of_credits')).toBe(true);
    expect(auth.outOfCreditsDialog.get()).toBe(true);

    // a failed check is a normal error, shown by the chat as before
    expect(showCreditsError('credits_unavailable')).toBe(false);
    expect(showCreditsError(undefined)).toBe(false);
  });

  it('refreshes the badge from credit_balances', async () => {
    const client = fakeSupabase({ session: signedIn, balance: 7 });
    const { refreshCreditsBadge, auth } = await loadWith(client);

    auth.authState.set({ status: 'signed-in', userId: 'user-1', email: 'a@b.co', balance: 8 });
    await refreshCreditsBadge();

    expect(client.from).toHaveBeenCalledWith('credit_balances');
    expect(auth.authState.get().balance).toBe(7);
  });

  it('remembers the follow-up token of a paid reply and sends it back with the next requests', async () => {
    const { chatFetch, chatAuthHeaders, resetFollowUpToken, FOLLOW_UP_HEADER } = await loadWith(
      fakeSupabase({ session: signedIn }),
    );
    resetFollowUpToken();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { headers: { [FOLLOW_UP_HEADER]: 'signed.token' } })),
    );

    expect(await chatAuthHeaders()).toEqual({ Authorization: 'Bearer user-token' });

    await chatFetch('/api/chat', { method: 'POST' });

    expect(await chatAuthHeaders()).toEqual({ Authorization: 'Bearer user-token', [FOLLOW_UP_HEADER]: 'signed.token' });

    // a free follow-up reply has no new token: the old one is kept
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok')),
    );
    await chatFetch('/api/chat', { method: 'POST' });
    expect((await chatAuthHeaders())[FOLLOW_UP_HEADER]).toBe('signed.token');

    vi.unstubAllGlobals();
  });

  it('never sends the follow-up token when logged out', async () => {
    const { chatFetch, chatAuthHeaders, FOLLOW_UP_HEADER } = await loadWith(fakeSupabase());

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { headers: { [FOLLOW_UP_HEADER]: 'signed.token' } })),
    );
    await chatFetch('/api/chat');

    expect(await chatAuthHeaders()).toEqual({});
    vi.unstubAllGlobals();
  });
});
