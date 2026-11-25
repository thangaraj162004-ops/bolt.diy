import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

/**
 * A fake Supabase client: auth events, a password check, one balance row and
 * spend_credits (same errors as the SQL function). No network.
 */
export function fakeSupabase(options: { session?: unknown; balance?: number; confirmEmail?: boolean } = {}) {
  type Listener = (event: string, session: unknown) => void;

  const listeners = new Set<Listener>();

  let session = options.session ?? null;
  let balance = options.balance ?? 20;

  const emit = (event: string) => listeners.forEach((listener) => listener(event, session));
  const userSession = (email: string) => ({ user: { id: 'user-1', email } });

  const client = {
    auth: {
      onAuthStateChange: (listener: Listener) => {
        listeners.add(listener);
        return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
      },
      getSession: async () => ({ data: { session } }),
      signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
        if (password !== 'right-password') {
          return {
            data: {},
            error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
          };
        }

        session = userSession(email);
        emit('SIGNED_IN');

        return { data: { session }, error: null };
      }),
      signUp: vi.fn(async ({ email }: { email: string }) => {
        if (options.confirmEmail) {
          return { data: { session: null, user: { id: 'user-1' } }, error: null };
        }

        session = userSession(email);
        emit('SIGNED_IN');

        return { data: { session }, error: null };
      }),
      signOut: vi.fn(async () => {
        session = null;
        emit('SIGNED_OUT');

        return { error: null };
      }),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { balance }, error: null }) }),
      }),
    })),
  };

  const rpc = vi.fn(async (name: string, args: { amount: number; reason: string }) => {
    if (name !== 'spend_credits') {
      return { data: null, error: { message: `unknown function ${name}` } };
    }

    if (!session) {
      return { data: null, error: { code: '28000', message: 'not logged in' } };
    }

    if (balance < args.amount) {
      return { data: null, error: { code: 'P0001', message: 'not enough credits' } };
    }

    balance -= args.amount;

    return { data: balance, error: null };
  });

  return Object.assign(client, { rpc }) as unknown as SupabaseClient & {
    auth: typeof client.auth;
    from: typeof client.from;
    rpc: typeof rpc;
  };
}

/** Lets the getSession promise and the deferred balance read finish. */
export async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
