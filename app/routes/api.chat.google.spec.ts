import type { ActionFunctionArgs } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The real chat route with the real AI SDK and the real Google provider; only
 * the network (Google and Supabase) is fake. Task 9E: a first message with
 * Google gemini-3.5-flash-lite in Agent mode failed with "Cannot read
 * properties of undefined (reading 'split')" because the agent model wrappers
 * lost the model's `provider` (see agent-stream.ts).
 */

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }),
}));

const { action } = await import('./api.chat');

const USER_TOKEN = `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: 'user-1' })).replace(/=+$/, '')}.sig`;
const waitUntil = vi.fn();

let ip = 0;
let logs: string[] = [];

function sse(events: unknown[]) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function fakeGoogle(answer: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url.includes('generativelanguage.googleapis.com/v1beta/models?')) {
        return Response.json({
          models: [
            {
              name: 'models/gemini-3.5-flash-lite',
              displayName: 'Gemini 3.5 Flash Lite',
              inputTokenLimit: 1048576,
              outputTokenLimit: 65536,
            },
          ],
        });
      }

      if (url.includes(':streamGenerateContent')) {
        return answer();
      }

      throw new Error(`unexpected fetch ${url}`);
    }),
  );
}

async function send(text: string, extra: Record<string, unknown> = {}) {
  const request = new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': `198.51.100.${++ip}`,
      Authorization: `Bearer ${USER_TOKEN}`,
      Cookie: `apiKeys=${encodeURIComponent(JSON.stringify({ Google: 'fake-google-key' }))}`,
    },
    body: JSON.stringify({
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }],
      chatMode: 'build',
      contextOptimization: true,
      promptId: 'default',
      files: {},
      agentMode: false,
      maxLLMSteps: 5,
      webSearchEnabled: false,
      connectorEnabled: {},
      toolEnabled: {},
      plugins: [],
      supabase: { isConnected: false, hasSelectedProject: false, credentials: {} },
      ...extra,
    }),
  });

  const response = await action({
    request,
    params: {},
    context: { cloudflare: { env: {}, ctx: { waitUntil } } },
  } as unknown as ActionFunctionArgs);

  const body = await response.text();
  await Promise.all(waitUntil.mock.calls.map(([promise]) => promise));

  return { response, body };
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_example');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test_value');
  vi.stubEnv('CREDITS_TOKEN_SECRET', 'test-credits-token-secret');
  logs = [];

  for (const method of ['log', 'error', 'warn', 'info', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(' ')));
  }

  mocks.rpc.mockImplementation(async (name: string) =>
    name === 'spend_credits' ? { data: 19, error: null } : { data: { result: 'refunded', balance: 20 }, error: null },
  );
  waitUntil.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const MODEL = '[Model: gemini-3.5-flash-lite]\n\n[Provider: Google]\n\n';

const reply = (extra: Record<string, unknown> = {}) =>
  sse([
    {
      candidates: [{ content: { role: 'model', parts: [{ text: 'Here is your app.' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      ...extra,
    },
  ]);

/** Google's answer to the agent's first step: the agent_plan tool call it requires. */
const planCall = () =>
  sse([
    {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              {
                functionCall: {
                  name: 'agent_plan',
                  args: {
                    goal: 'Build a todo app',
                    steps: ['Write the app'],
                    criteria: [{ id: 'c1', description: 'The app shows a todo list' }],
                    requiresPreview: true,
                  },
                },
              },
            ],
          },
          finishReason: 'STOP',
        },
      ],
    },
  ]);

const rpcNames = () => mocks.rpc.mock.calls.map(([name]) => name);

describe('/api/chat with Google gemini-3.5-flash-lite (real AI SDK, fake network)', () => {
  it('Agent mode: the first message reaches Google and its tool call streams (no "reading \'split\'" error)', async () => {
    let calls = 0;
    fakeGoogle(() => (++calls === 1 ? planCall() : reply()));

    const { body } = await send(`${MODEL}Make a todo app`, { agentMode: true });

    expect(calls).toBeGreaterThan(0);
    expect(body).toContain('"toolName":"agent_plan"');
    expect(body).not.toMatch(/reading 'split'/);

    // the user got a reply (a tool call), so the credit stays spent
    expect(rpcNames()).toEqual(['spend_credits']);
  });

  it.each([
    ['Build mode without Agent mode', { agentMode: false }],
    ['Discuss mode', { chatMode: 'discuss' }],
  ])(
    '%s: the first message gets a reply (no "reading \'split\'" error) and keeps its credit spent',
    async (_label, extra) => {
      fakeGoogle(() => reply());

      const { body } = await send(`${MODEL}Make a todo app`, extra);

      expect(body).toContain('"delta":"Here is your app."');
      expect(body).not.toMatch(/reading 'split'|"type":"error"/);
      expect(rpcNames()).toEqual(['spend_credits']);
    },
  );

  it('a reply without usage numbers still works', async () => {
    fakeGoogle(() =>
      sse([{ candidates: [{ content: { role: 'model', parts: [{ text: 'Hi' }] }, finishReason: 'STOP' }] }]),
    );

    const { body } = await send(`${MODEL}hi`);

    expect(body).toContain('"delta":"Hi"');
    expect(body).toContain('"type":"data-usage"');
    expect(rpcNames()).toEqual(['spend_credits']);
  });

  it.each([
    ['no model marker', '[Provider: Google]\n\nhi'],
    ['model "undefined"', '[Model: undefined]\n\n[Provider: Google]\n\nhi'],
    ['an empty model name', '[Model: ]\n\n[Provider: Google]\n\nhi'],
  ])('%s: falls back to a Google model instead of crashing', async (_label, text) => {
    fakeGoogle(() => reply());

    const { body } = await send(text);

    expect(body).toContain('"delta":"Here is your app."');
    expect(body).not.toMatch(/reading 'split'/);
  });

  it('a missing provider ("undefined") fails cleanly and gives the credit back', async () => {
    fakeGoogle(() => reply());

    const { body } = await send('[Model: gemini-3.5-flash-lite]\n\n[Provider: undefined]\n\nhi', { agentMode: true });

    expect(body).toContain('"type":"error"');
    expect(body).not.toMatch(/reading 'split'/);
    expect(rpcNames()).toEqual(['spend_credits', 'refund_credits']);
  });

  it.each([
    ['empty parts', () => sse([{ candidates: [{ content: { role: 'model', parts: [] }, finishReason: 'STOP' }] }])],
    ['no content', () => sse([{ candidates: [{ finishReason: 'STOP' }] }])],
  ])('an empty reply (%s) gives the credit back once', async (_label, answer) => {
    fakeGoogle(answer);

    await send(`${MODEL}hi`);

    expect(rpcNames()).toEqual(['spend_credits', 'refund_credits']);
    expect(logs.join('\n')).toContain('"ai_error":"EmptyReply"');
  });

  it('a provider error before any text gives the credit back once', async () => {
    fakeGoogle(() =>
      Response.json({ error: { code: 400, message: 'bad', status: 'INVALID_ARGUMENT' } }, { status: 400 }),
    );

    const { body } = await send(`${MODEL}hi`, { agentMode: true });

    expect(body).toContain('The AI provider returned an error (HTTP 400): bad');
    expect(rpcNames()).toEqual(['spend_credits', 'refund_credits']);
  });

  it('a crash inside our own code before any text gives the credit back once', async () => {
    fakeGoogle(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'split')");
    });

    const { body } = await send(`${MODEL}hi`, { agentMode: true });

    expect(body).toContain('"type":"error"');
    expect(rpcNames()).toEqual(['spend_credits', 'refund_credits']);
  });
});
