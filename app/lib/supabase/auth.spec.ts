import { afterEach, describe, expect, it } from 'vitest';
import { fakeSupabase, settle } from './__fixtures__/fake-supabase';
import { authState, friendlyAuthError, signIn, signOut, signUp, startAuth, validateCredentials } from './auth';

let stop: (() => void) | undefined;

afterEach(() => {
  stop?.();
  stop = undefined;
  authState.set({ status: 'loading', balance: null });
});

describe('validateCredentials', () => {
  it('asks for a valid email and a password of at least 6 characters', () => {
    expect(validateCredentials('nope', 'secret1')).toBe('Please enter a valid email address.');
    expect(validateCredentials('a@b.co', '12345')).toBe('Password must be at least 6 characters.');
    expect(validateCredentials(' a@b.co ', '123456')).toBeUndefined();
  });
});

describe('friendlyAuthError', () => {
  it.each([
    [{ code: 'invalid_credentials', status: 400 }, 'Wrong email or password.'],
    [{ message: 'Invalid login credentials' }, 'Wrong email or password.'],
    [{ code: 'email_not_confirmed' }, 'Please confirm your email first: open the link we sent you, then log in.'],
    [{ code: 'user_already_exists' }, 'An account with this email already exists. Log in instead.'],
    [{ code: 'weak_password' }, 'Password must be at least 6 characters.'],
    [{ code: 'over_request_rate_limit', status: 429 }, 'Too many tries. Please wait a minute and try again.'],
    [
      { name: 'AuthRetryableFetchError', status: 0 },
      'Could not reach the server. Check your connection and try again.',
    ],
    [new Error('boom'), 'Something went wrong. Please try again.'],
    [undefined, 'Something went wrong. Please try again.'],
  ])('%j -> %s', (error, message) => {
    expect(friendlyAuthError(error)).toBe(message);
  });
});

describe('auth store', () => {
  it('restores a saved session (page refresh) and reads the balance', async () => {
    const client = fakeSupabase({ session: { user: { id: 'user-1', email: 'a@b.co' } }, balance: 17 });
    stop = startAuth(client);
    await settle();

    expect(authState.get()).toEqual({ status: 'signed-in', userId: 'user-1', email: 'a@b.co', balance: 17 });
    expect(client.from).toHaveBeenCalledWith('credit_balances');
  });

  it('is signed out without a session', async () => {
    stop = startAuth(fakeSupabase());
    await settle();

    expect(authState.get()).toEqual({ status: 'signed-out', balance: null });
  });

  it('logs in, shows the balance, and logs out', async () => {
    const client = fakeSupabase({ balance: 20 });
    stop = startAuth(client);
    await settle();

    expect(await signIn(client, 'a@b.co', 'wrong-password')).toEqual({ ok: false, error: 'Wrong email or password.' });
    expect(authState.get().status).toBe('signed-out');

    expect(await signIn(client, 'a@b.co', 'right-password')).toEqual({ ok: true });
    await settle();
    expect(authState.get()).toMatchObject({ status: 'signed-in', email: 'a@b.co', balance: 20 });

    await signOut(client);
    expect(authState.get()).toEqual({ status: 'signed-out', balance: null });
  });

  it('checks the form before calling Supabase', async () => {
    const client = fakeSupabase();

    expect(await signUp(client, 'a@b.co', '123')).toEqual({
      ok: false,
      error: 'Password must be at least 6 characters.',
    });
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it('tells the user to confirm their email when sign up needs it', async () => {
    const result = await signUp(fakeSupabase({ confirmEmail: true }), 'a@b.co', '123456');

    expect(result).toEqual({
      ok: true,
      message: 'Check your email and open the link to confirm your account, then log in.',
    });
  });
});
