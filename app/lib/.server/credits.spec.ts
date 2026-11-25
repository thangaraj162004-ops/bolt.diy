import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_FREE_FOLLOW_UP_STEPS,
  chargeChatRequest,
  getBearerToken,
  getCreditsConfig,
  isNewUserMessage,
} from './credits';

/* ---------------------------------------------------------------- messages */

const user = (text = 'Make a todo app'): UIMessage => ({ id: 'u', role: 'user', parts: [{ type: 'text', text }] });

/** An assistant message whose last step is finished tool calls (what the browser re-sends automatically). */
const toolFollowUp = (steps = 1, state = 'output-available'): UIMessage => ({
  id: 'a',
  role: 'assistant',
  parts: Array.from({ length: steps }, () => [
    { type: 'step-start' },
    { type: 'tool-project_write_file', toolCallId: 't', state, input: {}, output: { ok: true } },
  ]).flat() as UIMessage['parts'],
});

const assistantText = (): UIMessage => ({
  id: 'a',
  role: 'assistant',
  parts: [{ type: 'step-start' }, { type: 'text', text: 'Done.', state: 'done' }],
});

describe('isNewUserMessage (the server rule)', () => {
  it('charges when the last message is from the user', () => {
    expect(isNewUserMessage([user()])).toBe(true);
    expect(isNewUserMessage([user(), assistantText(), user('Now make it blue')])).toBe(true);
  });

  it('does not charge the AI follow-up step that carries finished tool results', () => {
    expect(isNewUserMessage([user(), toolFollowUp()])).toBe(false);
    expect(isNewUserMessage([user(), toolFollowUp(1, 'output-error')])).toBe(false);
  });

  it('charges an assistant message that is not a finished tool step', () => {
    expect(isNewUserMessage([user(), assistantText()])).toBe(true);
    expect(isNewUserMessage([user(), toolFollowUp(1, 'input-available')])).toBe(true);
  });

  it('charges a "follow-up" with no user message before it', () => {
    expect(isNewUserMessage([toolFollowUp()])).toBe(true);
  });

  it(`charges again after ${MAX_FREE_FOLLOW_UP_STEPS} free follow-up steps`, () => {
    expect(isNewUserMessage([user(), toolFollowUp(MAX_FREE_FOLLOW_UP_STEPS)])).toBe(false);
    expect(isNewUserMessage([user(), toolFollowUp(MAX_FREE_FOLLOW_UP_STEPS + 1)])).toBe(true);
  });
});

/* ---------------------------------------------------------------- config */

const URL = 'https://example.supabase.co';
const PUBLISHABLE = 'sb_publishable_example';

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', URL);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', PUBLISHABLE);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('configuration', () => {
  it('uses the URL and the publishable key', () => {
    expect(getCreditsConfig(undefined)).toEqual({ url: URL, publishableKey: PUBLISHABLE });
  });

  it('is off when a variable is missing, and never uses a secret key', () => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    expect(getCreditsConfig(undefined)).toBeUndefined();

    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_abc');
    expect(getCreditsConfig(undefined)).toBeUndefined();
  });

  it('can also read the Worker env', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(getCreditsConfig({ VITE_SUPABASE_URL: URL })).toEqual({ url: URL, publishableKey: PUBLISHABLE });
  });

  it('reads the access token from the Authorization header', () => {
    const request = (value?: string) =>
      new Request('http://localhost/api/chat', { headers: value ? { Authorization: value } : {} });

    expect(getBearerToken(request('Bearer abc.def.ghi'))).toBe('abc.def.ghi');
    expect(getBearerToken(request('Basic abc'))).toBeUndefined();
    expect(getBearerToken(request())).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- charge */

function fakeCreateClient(options: { rpcError?: { code?: string; message: string }; userError?: boolean } = {}) {
  const rpc = vi.fn(async () => ({ data: options.rpcError ? null : 19, error: options.rpcError ?? null }));

  const getUser = vi.fn(async () =>
    options.userError
      ? { data: { user: null }, error: { message: 'invalid JWT' } }
      : { data: { user: { id: 'u1' } }, error: null },
  );

  const createSupabase = vi.fn(() => ({ rpc, auth: { getUser } }));

  return { createSupabase, rpc, getUser };
}

async function charge(
  fake: ReturnType<typeof fakeCreateClient>,
  { token = 'user-token', messages = [user()] }: { token?: string | null; messages?: UIMessage[] } = {},
) {
  const request = new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  return chargeChatRequest({
    request,
    messages,
    env: undefined,
    createSupabase: fake.createSupabase as unknown as Parameters<typeof chargeChatRequest>[0]['createSupabase'],
  });
}

async function body(response: Response | undefined) {
  return response ? { status: response.status, ...((await response.json()) as object) } : undefined;
}

describe('chargeChatRequest', () => {
  it('charges nothing when Supabase is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');

    const fake = fakeCreateClient();

    expect(await charge(fake, { token: null })).toBeUndefined();
    expect(fake.createSupabase).not.toHaveBeenCalled();
  });

  it('asks to log in when there is no token', async () => {
    const fake = fakeCreateClient();

    expect(await body(await charge(fake, { token: null }))).toMatchObject({
      status: 401,
      code: 'login_required',
      message: 'Please log in to send a message.',
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('spends 1 credit as the user, with the publishable key and the user token only', async () => {
    const fake = fakeCreateClient();

    expect(await charge(fake)).toBeUndefined();
    expect(fake.rpc).toHaveBeenCalledWith('spend_credits', { amount: 1, reason: 'ai message' });
    expect(fake.createSupabase).toHaveBeenCalledWith(URL, PUBLISHABLE, {
      global: { headers: { Authorization: 'Bearer user-token' } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it('refuses when credits are too low', async () => {
    const fake = fakeCreateClient({ rpcError: { code: 'P0001', message: 'not enough credits' } });

    expect(await body(await charge(fake))).toMatchObject({
      status: 402,
      code: 'out_of_credits',
      message: 'You are out of credits.',
    });
  });

  it('asks to log in when the token is invalid or expired', async () => {
    for (const rpcError of [
      { code: 'PGRST301', message: 'JWSError JWSInvalidSignature' },
      { code: 'PGRST303', message: 'JWT expired' },
      { code: '28000', message: 'not logged in' },
    ]) {
      expect(await body(await charge(fakeCreateClient({ rpcError })))).toMatchObject({
        status: 401,
        code: 'login_required',
      });
    }
  });

  it('does not call the AI when the check itself fails', async () => {
    const fake = fakeCreateClient({ rpcError: { code: '42883', message: 'function spend_credits does not exist' } });

    expect(await body(await charge(fake))).toMatchObject({ status: 503, code: 'credits_unavailable' });
  });

  it('does not charge a follow-up tool step, but still needs a valid login', async () => {
    const fake = fakeCreateClient();

    expect(await charge(fake, { messages: [user(), toolFollowUp()] })).toBeUndefined();
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.getUser).toHaveBeenCalledWith('user-token');

    const loggedOut = fakeCreateClient({ userError: true });
    expect(await body(await charge(loggedOut, { messages: [user(), toolFollowUp()] }))).toMatchObject({
      status: 401,
      code: 'login_required',
    });
    expect(loggedOut.rpc).not.toHaveBeenCalled();
  });
});
