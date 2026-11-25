import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, settle } from './__fixtures__/fake-supabase';
import { authDialog, authState, outOfCreditsDialog, startAuth } from './auth';
import { CREDITS_PER_MESSAGE, chargeForMessage, isOutOfCredits } from './credits';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-toastify', () => ({ toast: { error: toastError } }));

const signedIn = { user: { id: 'user-1', email: 'a@b.co' } };

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  stop?.();
  stop = undefined;
  authState.set({ status: 'loading', balance: null });
  authDialog.set(null);
  outOfCreditsDialog.set(false);
  vi.restoreAllMocks();
  toastError.mockReset();
});

describe('credits per AI message', () => {
  it('costs 1 credit (one constant)', () => {
    expect(CREDITS_PER_MESSAGE).toBe(1);
  });

  it('does nothing without Supabase', async () => {
    expect(await chargeForMessage(null)).toBe('not-configured');
    expect(authDialog.get()).toBeNull();
    expect(outOfCreditsDialog.get()).toBe(false);
  });

  it('opens the log in dialog and spends nothing when logged out', async () => {
    const client = fakeSupabase();

    expect(await chargeForMessage(client)).toBe('login-required');
    expect(authDialog.get()).toEqual({ hint: 'Log in to send your message.' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('spends 1 credit with reason "ai message" and updates the badge', async () => {
    const client = fakeSupabase({ session: signedIn, balance: 20 });
    stop = startAuth(client);
    await settle();
    expect(authState.get().balance).toBe(20);

    expect(await chargeForMessage(client)).toBe('charged');
    expect(client.rpc).toHaveBeenCalledWith('spend_credits', { amount: 1, reason: 'ai message' });
    expect(authState.get().balance).toBe(19);
  });

  it('stops at zero: "You are out of credits." and the message is not sent', async () => {
    const client = fakeSupabase({ session: signedIn, balance: 1 });
    stop = startAuth(client);
    await settle();

    expect(await chargeForMessage(client)).toBe('charged');
    expect(authState.get().balance).toBe(0);

    expect(await chargeForMessage(client)).toBe('out-of-credits');
    expect(outOfCreditsDialog.get()).toBe(true);
    expect(authState.get().balance).toBe(0);
  });

  it('does not send when the check itself fails, and says so', async () => {
    const client = fakeSupabase({ session: signedIn });
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'function spend_credits does not exist' } });

    expect(await chargeForMessage(client)).toBe('failed');
    expect(toastError).toHaveBeenCalledWith('Could not check your credits. Please try again.');
    expect(outOfCreditsDialog.get()).toBe(false);
  });

  it('recognises the SQL error for a low balance', () => {
    expect(isOutOfCredits({ code: 'P0001', message: 'not enough credits' })).toBe(true);
    expect(isOutOfCredits({ message: 'not logged in' })).toBe(false);
    expect(isOutOfCredits(undefined)).toBe(false);
  });
});

describe('mayChargeAndSend', () => {
  it('sends when Supabase is not configured', async () => {
    vi.resetModules();
    vi.doMock('./client', () => ({ supabase: null }));

    const { mayChargeAndSend } = await import('./credits');
    expect(await mayChargeAndSend()).toBe(true);

    vi.doUnmock('./client');
  });

  it('does not send when logged out', async () => {
    vi.resetModules();

    const client = fakeSupabase();
    vi.doMock('./client', () => ({ supabase: client }));

    const { mayChargeAndSend } = await import('./credits');
    expect(await mayChargeAndSend()).toBe(false);

    vi.doUnmock('./client');
  });
});
