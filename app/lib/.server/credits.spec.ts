import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOLLOW_UP_HEADER,
  FOLLOW_UP_TOKEN_TTL_MS,
  MAX_FREE_FOLLOW_UP_STEPS,
  chargeChatRequest,
  createRefundOnFailure,
  isReplyChunk,
  paidMessageHash,
  readFollowUpToken,
  refundChatCredit,
  signFollowUpToken,
  type ChargeOutcome,
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

const TOKEN_SECRET = 'test-credits-token-secret';
const SECRET_KEY = 'sb_secret_test_value';

/** A Supabase-like access token whose payload has `sub` (the signature part is not checked here). */
function accessToken(sub: string) {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode({ sub, role: 'authenticated' })}.signature`;
}

const USER_TOKEN = accessToken('u1');

function fakeCreateClient(options: { rpcError?: { code?: string; message: string }; userError?: boolean } = {}) {
  const rpc = vi.fn(async (name: string) =>
    name === 'refund_credits'
      ? { data: { result: 'refunded', balance: 20 }, error: null }
      : { data: options.rpcError ? null : 19, error: options.rpcError ?? null },
  );

  const getUser = vi.fn(async () =>
    options.userError
      ? { data: { user: null }, error: { message: 'invalid JWT' } }
      : { data: { user: { id: 'u1' } }, error: null },
  );

  const createSupabase = vi.fn(() => ({ rpc, auth: { getUser } }));

  return { createSupabase, rpc, getUser };
}

type CreateSupabase = Parameters<typeof chargeChatRequest>[0]['createSupabase'];

const ENV = { CREDITS_TOKEN_SECRET: TOKEN_SECRET, SUPABASE_SECRET_KEY: SECRET_KEY };

async function charge(
  fake: ReturnType<typeof fakeCreateClient>,
  {
    token = USER_TOKEN,
    messages = [user()],
    followUp,
    env = ENV,
    now,
  }: {
    token?: string | null;
    messages?: UIMessage[];
    followUp?: string;
    env?: Record<string, string>;
    now?: number;
  } = {},
) {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  if (followUp) {
    headers[FOLLOW_UP_HEADER] = followUp;
  }

  return chargeChatRequest({
    request: new Request('http://localhost/api/chat', { method: 'POST', headers }),
    messages,
    env,
    createSupabase: fake.createSupabase as unknown as CreateSupabase,
    now,
  });
}

async function refused(outcome: ChargeOutcome) {
  expect(outcome.kind).toBe('refused');

  const response = (outcome as { response: Response }).response;

  return { status: response.status, ...((await response.json()) as object) };
}

/** Pays for the first message and returns its follow-up token. */
async function paidToken(messages = [user()]) {
  const outcome = await charge(fakeCreateClient(), { messages });
  expect(outcome.kind).toBe('charged');

  return (outcome as { followUpToken: string }).followUpToken;
}

describe('chargeChatRequest', () => {
  it('charges nothing when Supabase is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');

    const fake = fakeCreateClient();

    expect(await charge(fake, { token: null })).toEqual({ kind: 'not-configured' });
    expect(fake.createSupabase).not.toHaveBeenCalled();
  });

  it('asks to log in when there is no token', async () => {
    const fake = fakeCreateClient();

    expect(await refused(await charge(fake, { token: null }))).toMatchObject({
      status: 401,
      code: 'login_required',
      message: 'Please log in to send a message.',
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('spends 1 credit as the user, with the publishable key and the user token only', async () => {
    const fake = fakeCreateClient();
    const outcome = await charge(fake);

    expect(outcome).toMatchObject({ kind: 'charged', userId: 'u1' });
    expect((outcome as { requestId: string }).requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fake.rpc).toHaveBeenCalledWith('spend_credits', { amount: 1, reason: 'ai message' });
    expect(fake.createSupabase).toHaveBeenCalledWith(URL, PUBLISHABLE, {
      global: { headers: { Authorization: `Bearer ${USER_TOKEN}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it('refuses when credits are too low', async () => {
    const fake = fakeCreateClient({ rpcError: { code: 'P0001', message: 'not enough credits' } });

    expect(await refused(await charge(fake))).toMatchObject({
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
      expect(await refused(await charge(fakeCreateClient({ rpcError })))).toMatchObject({
        status: 401,
        code: 'login_required',
      });
    }
  });

  it('does not call the AI when the check itself fails', async () => {
    const fake = fakeCreateClient({ rpcError: { code: '42883', message: 'function spend_credits does not exist' } });

    expect(await refused(await charge(fake))).toMatchObject({ status: 503, code: 'credits_unavailable' });
  });
});

describe('follow-up tokens', () => {
  it('a paid message gets a signed token for that user and that message', async () => {
    const token = await paidToken();
    const claims = await readFollowUpToken(TOKEN_SECRET, token);

    expect(claims).toMatchObject({ v: 1, sub: 'u1', mh: await paidMessageHash([user()]) });
    expect(claims!.exp - Date.now()).toBeGreaterThan(FOLLOW_UP_TOKEN_TTL_MS - 5_000);
  });

  it('a follow-up step with the token is free (still needs a valid login)', async () => {
    const followUp = await paidToken();
    const fake = fakeCreateClient();

    expect(await charge(fake, { messages: [user(), toolFollowUp()], followUp })).toEqual({ kind: 'free-follow-up' });
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.getUser).toHaveBeenCalledWith(USER_TOKEN);

    const loggedOut = fakeCreateClient({ userError: true });
    expect(await refused(await charge(loggedOut, { messages: [user(), toolFollowUp()], followUp }))).toMatchObject({
      status: 401,
      code: 'login_required',
    });
    expect(loggedOut.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['no token', async () => undefined],
    ['a forged signature', async () => `${(await paidToken()).split('.')[0]}.${'0'.repeat(64)}`],
    [
      'a token signed with another secret',
      async () =>
        signFollowUpToken('other-secret', {
          v: 1,
          sub: 'u1',
          mh: (await paidMessageHash([user()])) as string,
          exp: Date.now() + 60_000,
        }),
    ],
    ['a token for another message', async () => paidToken([user('Something else')])],
    [
      'a token for another user',
      async () =>
        signFollowUpToken(TOKEN_SECRET, {
          v: 1,
          sub: 'someone-else',
          mh: (await paidMessageHash([user()])) as string,
          exp: Date.now() + 60_000,
        }),
    ],
    [
      'an expired token',
      async () =>
        signFollowUpToken(TOKEN_SECRET, {
          v: 1,
          sub: 'u1',
          mh: (await paidMessageHash([user()])) as string,
          exp: Date.now() - 1,
        }),
    ],
    ['garbage', async () => 'not.a.token'],
  ])('a follow-up step with %s is charged like a new message', async (_label, makeToken) => {
    const fake = fakeCreateClient();
    const outcome = await charge(fake, { messages: [user(), toolFollowUp()], followUp: await makeToken() });

    expect(outcome.kind).toBe('charged');
    expect(fake.rpc).toHaveBeenCalledWith('spend_credits', { amount: 1, reason: 'ai message' });
  });

  it('a hand-edited paid message no longer matches its token and is charged', async () => {
    const followUp = await paidToken([user('Make a todo app')]);
    const fake = fakeCreateClient();

    const edited = await charge(fake, { messages: [user('Make ten todo apps'), toolFollowUp()], followUp });

    expect(edited.kind).toBe('charged');
  });

  it(`stops being free after ${MAX_FREE_FOLLOW_UP_STEPS} steps`, async () => {
    const followUp = await paidToken();
    const fake = fakeCreateClient();

    expect((await charge(fake, { messages: [user(), toolFollowUp(MAX_FREE_FOLLOW_UP_STEPS)], followUp })).kind).toBe(
      'free-follow-up',
    );
    expect(
      (await charge(fake, { messages: [user(), toolFollowUp(MAX_FREE_FOLLOW_UP_STEPS + 1)], followUp })).kind,
    ).toBe('charged');
  });

  it('without CREDITS_TOKEN_SECRET no token is made and follow-ups are charged', async () => {
    const fake = fakeCreateClient();
    const env = { SUPABASE_SECRET_KEY: SECRET_KEY };

    expect(await charge(fake, { env })).toMatchObject({ kind: 'charged', followUpToken: undefined });
    expect((await charge(fake, { env, messages: [user(), toolFollowUp()], followUp: 'x.y' })).kind).toBe('charged');
  });
});

describe('refund on failure', () => {
  async function chargedOutcome() {
    return charge(fakeCreateClient());
  }

  it('refunds 1 credit with the secret key, once, when the AI fails before replying', async () => {
    const fake = fakeCreateClient();
    const waitUntil = vi.fn();

    const refund = createRefundOnFailure(await chargedOutcome(), {
      env: ENV,
      waitUntil,
      createSupabase: fake.createSupabase as unknown as CreateSupabase,
    });

    const providerError = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });

    expect(await refund.onFailure(providerError)).toBe('refunded');
    expect(refund.onFailure(providerError)).toBeUndefined();
    expect(waitUntil).toHaveBeenCalledTimes(1);

    const [[name, args]] = fake.rpc.mock.calls as unknown as [[string, Record<string, unknown>]];
    expect(name).toBe('refund_credits');
    expect(args).toMatchObject({ user_id: 'u1', amount: 1 });
    expect(String(args.request_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(fake.createSupabase).toHaveBeenCalledWith(URL, SECRET_KEY, expect.any(Object));
  });

  it('does not refund once a reply has started, a cancelled request, or an uncharged request', async () => {
    const fake = fakeCreateClient();
    const options = { env: ENV, createSupabase: fake.createSupabase as unknown as CreateSupabase };

    const replied = createRefundOnFailure(await chargedOutcome(), options);
    replied.markReplied();
    expect(replied.onFailure(new Error('stream broke'))).toBeUndefined();

    const aborted = createRefundOnFailure(await chargedOutcome(), options);
    expect(aborted.onFailure(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBeUndefined();

    for (const outcome of [{ kind: 'free-follow-up' } as const, { kind: 'not-configured' } as const]) {
      expect(createRefundOnFailure(outcome, options).onFailure(new Error('503'))).toBeUndefined();
    }

    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('skips the refund without the secret key and never logs secrets', async () => {
    const logs: string[] = [];

    for (const method of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => void logs.push(args.join(' ')));
    }

    const fake = fakeCreateClient();
    expect(
      await refundChatCredit({
        env: {},
        userId: 'u1',
        requestId: 'req-12345678',
        createSupabase: fake.createSupabase as unknown as CreateSupabase,
      }),
    ).toBe('skipped');
    expect(fake.rpc).not.toHaveBeenCalled();

    const failing = fakeCreateClient();
    failing.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42883', message: `bad key ${SECRET_KEY}` },
    } as never);
    expect(
      await refundChatCredit({
        env: ENV,
        userId: 'u1',
        requestId: 'req-12345678',
        createSupabase: failing.createSupabase as unknown as CreateSupabase,
      }),
    ).toBe('failed');

    expect(logs.join('\n')).toContain('42883');
    expect(logs.join('\n')).not.toContain(SECRET_KEY);
    expect(logs.join('\n')).not.toContain(TOKEN_SECRET);
  });
});

describe('isReplyChunk (what counts as a reply the user saw)', () => {
  it.each([
    { type: 'start' },
    { type: 'start-step', request: {}, warnings: [] },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', text: '' },
    { type: 'text-delta', id: 't', text: '  \n' },
    { type: 'reasoning-delta', id: 'r', text: 'thinking' },
    { type: 'finish-step' },
    { type: 'finish' },
    { type: 'error', error: new Error('503') },
    { type: 'raw', rawValue: {} },
    undefined,
  ])('%j is not a reply', (chunk) => {
    expect(isReplyChunk(chunk)).toBe(false);
  });

  it.each([
    { type: 'text-delta', id: 't', text: 'Here is' },
    { type: 'tool-input-start', id: 'c', toolName: 'project_write_file' },
    { type: 'tool-call', toolCallId: 'c', toolName: 'project_write_file', input: {} },
    { type: 'tool-result', toolCallId: 'c', toolName: 'project_write_file', output: {} },
    { type: 'file', file: {} },
    { type: 'source', sourceType: 'url', id: 's', url: 'https://example.com' },
  ])('%j is a reply', (chunk) => {
    expect(isReplyChunk(chunk)).toBe(true);
  });
});
