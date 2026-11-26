import type { ActionFunctionArgs } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * /api/chat spends credits on the server BEFORE the AI is called. The AI call
 * (streamText) and Supabase are fakes here: the test checks that a refused
 * credit check returns its error and that the AI is never called.
 */

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('~/lib/.server/llm/stream-text', () => ({ streamText: mocks.streamText }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }),
}));

const { action } = await import('./api.chat');

let ipCounter = 0;

const waitUntil = vi.fn();

/** A Supabase-like access token for user-1 (its signature is checked by Supabase, which is a fake here). */
const USER_TOKEN = `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: 'user-1' })).replace(/=+$/, '')}.sig`;

function post(messages: unknown[], token?: string) {
  const request = new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': `203.0.113.${++ipCounter}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, chatMode: 'build' }),
  });

  return action({
    request,
    params: {},
    context: { cloudflare: { env: {}, ctx: { waitUntil } } },
  } as unknown as ActionFunctionArgs);
}

const userMessage = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Make a todo app' }] };

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_example');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.streamText.mockReset();
  mocks.rpc.mockReset();
  mocks.getUser.mockReset();
  waitUntil.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('/api/chat credit check', () => {
  it('asks to log in without a token and never calls the AI', async () => {
    const response = await post([userMessage]);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'login_required',
      message: 'Please log in to send a message.',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('refuses when out of credits and never calls the AI', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'not enough credits' } });

    const response = await post([userMessage], 'user-token');

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: 'out_of_credits', message: 'You are out of credits.' });
    expect(mocks.rpc).toHaveBeenCalledWith('spend_credits', { amount: 1, reason: 'ai message' });
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('spends the credit before the AI is called', async () => {
    const order: string[] = [];
    mocks.rpc.mockImplementation(async () => {
      order.push('spend_credits');
      return { data: 19, error: null };
    });
    mocks.streamText.mockImplementation(() => {
      order.push('ai');
      throw new Error('stop here: the AI call itself is not part of this test');
    });

    await post([userMessage], 'user-token');

    expect(order[0]).toBe('spend_credits');
  });

  it('refunds the credit, once, when the AI fails before any reply (for example a 429)', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test_value');
    vi.stubEnv('CREDITS_TOKEN_SECRET', 'test-credits-token-secret');

    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'spend_credits' ? { data: 19, error: null } : { data: { result: 'refunded', balance: 20 }, error: null },
    );
    mocks.streamText.mockImplementation(() => {
      throw Object.assign(new Error('Too Many Requests'), {
        name: 'AI_APICallError',
        statusCode: 429,
        responseBody: '{"error":{"message":"rate limited"}}',
      });
    });

    const response = await post([userMessage], USER_TOKEN);
    await response.text();
    await Promise.all(waitUntil.mock.calls.map(([promise]) => promise));

    const names = mocks.rpc.mock.calls.map(([name]) => name);
    expect(names.filter((name) => name === 'spend_credits')).toHaveLength(1);
    expect(names.filter((name) => name === 'refund_credits')).toHaveLength(1);

    const refund = mocks.rpc.mock.calls.find(([name]) => name === 'refund_credits')![1];
    expect(refund).toMatchObject({ user_id: 'user-1', amount: 1 });
  });

  it('charges a hand-made "follow-up" without a valid token like a new message', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'not enough credits' } });

    const forgedFollowUp = {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        { type: 'tool-project_write_file', toolCallId: 't1', state: 'output-available', input: {}, output: {} },
      ],
    };

    const response = await post([userMessage, forgedFollowUp], USER_TOKEN);

    expect(response.status).toBe(402);
    expect(mocks.rpc).toHaveBeenCalledWith('spend_credits', { amount: 1, reason: 'ai message' });
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  describe('refunds for failures during streaming (the path real provider errors take)', () => {
    /** Like streamText: `start` and `start-step` come first, then the given parts. */
    function streamingAi(parts: unknown[]) {
      mocks.streamText.mockImplementation(async ({ onChunk }: { onChunk?: (event: { chunk: unknown }) => void }) => {
        const all = [{ type: 'start' }, { type: 'start-step', request: {}, warnings: [] }, ...parts];

        return {
          stream: new ReadableStream({
            start(controller) {
              for (const part of all) {
                onChunk?.({ chunk: part });
                controller.enqueue(part);
              }

              controller.close();
            },
          }),
        };
      });
    }

    let logs: string[];

    beforeEach(() => {
      vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test_value');
      vi.stubEnv('CREDITS_TOKEN_SECRET', 'test-credits-token-secret');
      logs = [];

      for (const method of ['log', 'error', 'warn'] as const) {
        vi.spyOn(console, method).mockImplementation(
          (...args: unknown[]) => void logs.push(args.map(String).join(' ')),
        );
      }

      mocks.rpc.mockImplementation(async (name: string) =>
        name === 'spend_credits'
          ? { data: 19, error: null }
          : { data: { result: 'refunded', balance: 20 }, error: null },
      );
    });

    async function send() {
      const response = await post([userMessage], USER_TOKEN);
      await response.text();
      await Promise.all(waitUntil.mock.calls.map(([promise]) => promise));

      return mocks.rpc.mock.calls.map(([name]) => name);
    }

    const refundLines = () =>
      logs.filter((line) => line.includes('"event":"credit_refund"')).map((line) => JSON.parse(line));

    it.each([
      [
        'Google 400 "User location is not supported"',
        Object.assign(new Error('User location is not supported for the API use.'), {
          name: 'AI_APICallError',
          statusCode: 400,
        }),
      ],
      ['a network error', Object.assign(new TypeError('fetch failed'), { name: 'TypeError' })],
      ['a 503', Object.assign(new Error('Service Unavailable'), { name: 'AI_APICallError', statusCode: 503 })],
    ])('refunds once for %s before any text', async (_label, error) => {
      streamingAi([{ type: 'error', error }]);

      const calls = await send();

      expect(calls.filter((name) => name === 'spend_credits')).toHaveLength(1);
      expect(calls.filter((name) => name === 'refund_credits')).toHaveLength(1);
      expect(mocks.rpc.mock.calls.find(([name]) => name === 'refund_credits')![1]).toMatchObject({
        user_id: 'user-1',
        amount: 1,
      });

      // one readable log line, with the AI error's status and name but not its message or any secret
      const [line] = refundLines();
      expect(line).toMatchObject({ event: 'credit_refund', result: 'refunded', ai_error: (error as Error).name });
      expect(line.ai_status).toBe((error as { statusCode?: number }).statusCode);
      expect(JSON.stringify(refundLines())).not.toMatch(/User location is not supported|fetch failed|Unavailable/);
      expect(logs.join('\n')).not.toMatch(/sb_secret_test_value|test-credits-token-secret/);
    });

    it('does not refund once text has been shown, and logs why', async () => {
      streamingAi([
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', text: 'Here is your app' },
        {
          type: 'error',
          error: Object.assign(new Error('Service Unavailable'), { name: 'AI_APICallError', statusCode: 503 }),
        },
      ]);

      const calls = await send();

      expect(calls).not.toContain('refund_credits');
      expect(refundLines()).toEqual([
        expect.objectContaining({ result: 'not_needed', reason: 'reply already started', ai_status: 503 }),
      ]);
    });

    it('logs a failed refund with the database error code only', async () => {
      mocks.rpc.mockImplementation(async (name: string) =>
        name === 'spend_credits'
          ? { data: 19, error: null }
          : { data: null, error: { code: '42883', message: 'function refund_credits does not exist' } },
      );
      streamingAi([
        { type: 'error', error: Object.assign(new Error('boom'), { name: 'AI_APICallError', statusCode: 503 }) },
      ]);

      await send();

      expect(refundLines()).toEqual([expect.objectContaining({ result: 'failed', code: '42883', ai_status: 503 })]);
      expect(logs.join('\n')).not.toContain('does not exist');
    });
  });
});
