import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { atom } from 'nanostores';

/**
 * Login state for the app's own accounts (Supabase Auth) and the credit balance.
 *
 * The session itself is kept by supabase-js in the browser's storage, so it
 * survives a page refresh. This store mirrors it for the UI and reads the
 * balance from `credit_balances` (Row Level Security: only the user's own row).
 * Nothing here spends or limits credits.
 */

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export interface AuthState {
  status: AuthStatus;
  email?: string;
  userId?: string;

  /** The credit balance; null while loading or when it could not be read. */
  balance: number | null;

  /** The active plan ('pro' or 'ultra') and when it ends; absent when there is none or it has ended. */
  plan?: string;
  planUntil?: string;
}

/** The plan from a profile row, only while it is still active. */
export function activePlan(
  row: { plan?: unknown; plan_until?: unknown } | null | undefined,
  now = Date.now(),
): { plan?: string; planUntil?: string } {
  const plan = typeof row?.plan === 'string' ? row.plan : undefined;
  const until = typeof row?.plan_until === 'string' ? row.plan_until : undefined;

  return plan && until && new Date(until).getTime() > now ? { plan, planUntil: until } : {};
}

export const authState = atom<AuthState>({ status: 'loading', balance: null });

/** The log in dialog: null when closed; `hint` explains why it opened. */
export const authDialog = atom<{ hint?: string } | null>(null);

/** The "You are out of credits." dialog. */
export const outOfCreditsDialog = atom(false);

/** The "Buy credits" dialog. */
export const buyCreditsDialog = atom(false);

/** Sets the balance shown in the header (after a spend). */
export function setBalance(balance: number) {
  const current = authState.get();

  if (current.status === 'signed-in') {
    authState.set({ ...current, balance });
  }
}

export const MIN_PASSWORD_LENGTH = 6;

export type AuthMode = 'login' | 'signup';

/* ------------------------------------------------------------ validation */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A plain-English problem with the form, or undefined when it can be sent. */
export function validateCredentials(email: string, password: string): string | undefined {
  if (!EMAIL.test(email.trim())) {
    return 'Please enter a valid email address.';
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return undefined;
}

/* ---------------------------------------------------------------- errors */

interface ErrorLike {
  code?: unknown;
  status?: unknown;
  name?: unknown;
  message?: unknown;
}

/** Turns a Supabase Auth error into a short, plain-English message. */
export function friendlyAuthError(error: unknown): string {
  const { code, status, name, message } = (typeof error === 'object' && error ? error : {}) as ErrorLike;
  const text = typeof message === 'string' ? message.toLowerCase() : '';

  if (code === 'invalid_credentials' || text.includes('invalid login credentials')) {
    return 'Wrong email or password.';
  }

  if (code === 'email_not_confirmed' || text.includes('email not confirmed')) {
    return 'Please confirm your email first: open the link we sent you, then log in.';
  }

  if (code === 'user_already_exists' || code === 'email_exists' || text.includes('already registered')) {
    return 'An account with this email already exists. Log in instead.';
  }

  if (code === 'weak_password' || text.includes('password should be')) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (code === 'email_address_invalid' || text.includes('invalid format') || text.includes('is invalid')) {
    return 'Please enter a valid email address.';
  }

  if (code === 'signup_disabled' || text.includes('signups not allowed')) {
    return 'New sign ups are turned off right now.';
  }

  if (status === 429 || (typeof code === 'string' && code.startsWith('over_'))) {
    return 'Too many tries. Please wait a minute and try again.';
  }

  if (name === 'AuthRetryableFetchError' || status === 0 || text.includes('failed to fetch')) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  return 'Something went wrong. Please try again.';
}

/* ------------------------------------------------------------- the store */

export type AuthResult = { ok: true; message?: string } | { ok: false; error: string };

let started: SupabaseClient | undefined;
let balanceRequest = 0;

/** Reads the signed-in user's balance into the store. */
export async function refreshBalance(client: SupabaseClient): Promise<void> {
  const current = authState.get();

  if (current.status !== 'signed-in' || !current.userId) {
    return;
  }

  const request = ++balanceRequest;

  const [{ data, error }, profile] = await Promise.all([
    client.from('credit_balances').select('balance').eq('user_id', current.userId).maybeSingle(),
    client.from('profiles').select('plan, plan_until').eq('id', current.userId).maybeSingle(),
  ]);

  // a newer request (or a log out) happened meanwhile
  if (request !== balanceRequest || authState.get().userId !== current.userId) {
    return;
  }

  // the plan is optional: a profile that cannot be read just shows no plan
  const { plan: _oldPlan, planUntil: _oldUntil, ...rest } = authState.get();

  authState.set({
    ...rest,
    balance: error || !data ? null : Number(data.balance),
    ...activePlan(profile.error ? null : profile.data),
  });
}

function applySession(client: SupabaseClient, session: Session | null) {
  const user = session?.user;

  if (!user) {
    balanceRequest++;
    authState.set({ status: 'signed-out', balance: null });

    return;
  }

  const previous = authState.get();
  const sameUser = previous.status === 'signed-in' && previous.userId === user.id;

  // logged in: a log in dialog is no longer needed
  authDialog.set(null);

  authState.set({
    status: 'signed-in',
    userId: user.id,
    email: user.email ?? undefined,
    balance: sameUser ? previous.balance : null,
  });

  // never await Supabase calls inside onAuthStateChange: run them after it returns
  setTimeout(() => void refreshBalance(client), 0);
}

/** Starts following the session (once per client). Returns a function that stops it. */
export function startAuth(client: SupabaseClient): () => void {
  if (started === client) {
    return () => undefined;
  }

  started = client;

  const { data } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
    applySession(client, session);
  });

  void client.auth
    .getSession()
    .then(({ data: { session } }) => applySession(client, session))
    .catch(() => applySession(client, null));

  return () => {
    data.subscription.unsubscribe();
    started = undefined;
  };
}

export async function signIn(client: SupabaseClient, email: string, password: string): Promise<AuthResult> {
  const problem = validateCredentials(email, password);

  if (problem) {
    return { ok: false, error: problem };
  }

  try {
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    return error ? { ok: false, error: friendlyAuthError(error) } : { ok: true };
  } catch (error) {
    return { ok: false, error: friendlyAuthError(error) };
  }
}

export async function signUp(client: SupabaseClient, email: string, password: string): Promise<AuthResult> {
  const problem = validateCredentials(email, password);

  if (problem) {
    return { ok: false, error: problem };
  }

  try {
    const { data, error } = await client.auth.signUp({ email: email.trim(), password });

    if (error) {
      return { ok: false, error: friendlyAuthError(error) };
    }

    // with "Confirm email" on, there is no session until the link is opened
    if (!data.session) {
      return { ok: true, message: 'Check your email and open the link to confirm your account, then log in.' };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendlyAuthError(error) };
  }
}

export async function signOut(client: SupabaseClient): Promise<void> {
  try {
    await client.auth.signOut();
  } finally {
    // the UI shows "Log in" again even if the server could not be reached
    applySession(client, null);
  }
}
