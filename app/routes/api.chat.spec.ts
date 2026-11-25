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
    context: { cloudflare: { env: {}, ctx: { waitUntil: () => undefined } } },
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
});
