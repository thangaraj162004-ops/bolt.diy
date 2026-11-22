import { APICallError, RetryError, createUIMessageStream, type UIMessageChunk } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toApiErrorResponse, toProviderApiError, toSafeStreamErrorMessage, isTokenLimitFailure } from './errors';
import {
  MAX_PROVIDER_MESSAGE_LENGTH,
  describeProviderError,
  extractProviderError,
  isProviderError,
  sanitizeProviderMessage,
} from './provider-errors';

/*
 * Mocked provider failures, shaped like the AI SDK's real errors: an
 * APICallError carries the HTTP status, the request (URL, body with the prompt,
 * headers) and the provider's JSON body.
 */

const FAKE_KEY = 'sk-proj-FAKEKEY0123456789abcdefFAKEKEY';
const GOOGLE_KEY = 'AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE1234';
const PROMPT = 'Build me a secret internal dashboard for ACME payroll';

function apiError(statusCode: number, body: unknown, message = `Request failed with status ${statusCode}`) {
  return new APICallError({
    message,
    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini:streamGenerateContent?key=${GOOGLE_KEY}`,
    requestBodyValues: { contents: [{ role: 'user', parts: [{ text: PROMPT }] }] },
    statusCode,
    responseHeaders: { authorization: `Bearer ${FAKE_KEY}`, 'x-api-key': FAKE_KEY },
    responseBody: typeof body === 'string' ? body : JSON.stringify(body),
    isRetryable: statusCode === 429 || statusCode >= 500,
  });
}

let logs: string[] = [];

beforeEach(() => {
  logs = [];

  for (const method of ['log', 'error', 'warn', 'info', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the message for each case', () => {
  it('404 model not found (Gemini): the model may be retired, pick another', () => {
    const error = apiError(404, {
      error: {
        code: 404,
        message: 'models/gemini-1.0-pro is not found for API version v1beta, or is not supported for generateContent.',
        status: 'NOT_FOUND',
      },
    });

    expect(describeProviderError(error)).toEqual({
      kind: 'model_not_found',
      statusCode: 404,
      isRetryable: false,
      message:
        'The selected model is not available (HTTP 404). It may have been retired or renamed; pick another model and try again.',
    });
  });

  it('400 model does not exist (OpenAI style)', () => {
    const error = apiError(400, {
      error: {
        message: 'The model `gpt-3.5-turbo-0301` has been deprecated',
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });

    expect(describeProviderError(error)).toMatchObject({ kind: 'model_not_found', statusCode: 400 });
  });

  it('401 wrong key', () => {
    const error = apiError(401, {
      error: { message: `Incorrect API key provided: ${FAKE_KEY}.`, code: 'invalid_api_key' },
    });

    expect(describeProviderError(error)).toEqual({
      kind: 'auth',
      statusCode: 401,
      isRetryable: false,
      message:
        'The AI provider did not accept the API key (HTTP 401): it is missing, wrong, or not allowed to use this model. Check the key in Settings.',
    });
  });

  it('403 key not allowed for this model', () => {
    const error = apiError(403, {
      error: {
        code: 403,
        message: 'Permission denied: Consumer does not have access to this model.',
        status: 'PERMISSION_DENIED',
      },
    });

    expect(describeProviderError(error)).toMatchObject({ kind: 'auth', statusCode: 403 });
    expect(describeProviderError(error).message).toContain('(HTTP 403)');
  });

  it('a missing key (no HTTP call at all)', () => {
    const error = Object.assign(new Error('Google Generative AI API key is missing.'), { name: 'AI_LoadAPIKeyError' });

    expect(describeProviderError(error).kind).toBe('auth');
  });

  it('429 free-tier limit (Gemini): rate-limit message', () => {
    const error = apiError(429, {
      error: {
        code: 429,
        message:
          'You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15',
        status: 'RESOURCE_EXHAUSTED',
      },
    });

    expect(describeProviderError(error)).toEqual({
      kind: 'rate_limit',
      statusCode: 429,
      isRetryable: true,
      message:
        "The AI provider's rate limit or free-tier limit was reached (HTTP 429). Wait a minute and try again, or use another model or a paid key.",
    });
  });

  it('429 that mentions tokens per minute is a rate limit, NOT the token-limit message', () => {
    const gemini = apiError(429, {
      error: {
        code: 429,
        message:
          'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 250000 input tokens per minute. Please retry in 41s.',
        status: 'RESOURCE_EXHAUSTED',
      },
    });
    const openai = apiError(429, {
      error: {
        message:
          'Rate limit reached for gpt-4o in organization org-abc on tokens per min (TPM): Limit 30000, Used 28000, Requested 6600. Please try again in 9.2s.',
        type: 'tokens',
        code: 'rate_limit_exceeded',
      },
    });

    for (const error of [gemini, openai]) {
      const described = describeProviderError(error);

      expect(described.kind).toBe('rate_limit');
      expect(described.message).toContain('rate limit or free-tier limit was reached');
      expect(described.message).not.toMatch(/too long|context window|token limit/i);
      expect(isTokenLimitFailure(error)).toBe(false);
    }
  });

  it('a real context-length error shows the token-limit message', () => {
    const cases = [
      apiError(400, {
        error: {
          message:
            "This model's maximum context length is 128000 tokens. However, your messages resulted in 130512 tokens.",
          code: 'context_length_exceeded',
        },
      }),
      apiError(400, {
        error: {
          code: 400,
          message: 'The input token count (1215340) exceeds the maximum number of tokens allowed (1048576).',
          status: 'INVALID_ARGUMENT',
        },
      }),
      apiError(400, {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'prompt is too long: 210000 tokens > 200000 maximum' },
      }),
    ];

    for (const error of cases) {
      expect(describeProviderError(error)).toEqual({
        kind: 'context_limit',
        statusCode: 400,
        isRetryable: false,
        message:
          "The conversation is too long for this model's context window. Start a new chat or pick a model with a larger context.",
      });
      expect(isTokenLimitFailure(error)).toBe(true);
    }
  });

  it('5xx: the provider is having problems', () => {
    for (const [status, body] of [
      [
        503,
        { error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } },
      ],
      [500, { error: { message: 'Internal error' } }],
      [529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }],
    ] as const) {
      expect(describeProviderError(apiError(status, body))).toEqual({
        kind: 'server',
        statusCode: status,
        isRetryable: true,
        message: `The AI provider is having problems right now (HTTP ${status}). Try again in a moment or pick another model.`,
      });
    }
  });

  it('anything else: the status and the provider message, cut to 200 characters', () => {
    const error = apiError(400, {
      error: {
        message: "Invalid value for 'temperature': expected a number between 0 and 2, got 7.",
        type: 'invalid_request_error',
      },
    });

    expect(describeProviderError(error)).toEqual({
      kind: 'other',
      statusCode: 400,
      isRetryable: false,
      message:
        "The AI provider returned an error (HTTP 400): Invalid value for 'temperature': expected a number between 0 and 2, got 7.",
    });

    const long = describeProviderError(
      apiError(422, { error: { message: `Unprocessable request. ${'detail '.repeat(80)}` } }),
    );

    const shown = long.message.replace('The AI provider returned an error (HTTP 422): ', '');

    expect(shown.length).toBe(MAX_PROVIDER_MESSAGE_LENGTH);
    expect(shown.endsWith('…')).toBe(true);
  });

  it('a network failure says the provider could not be reached', () => {
    expect(describeProviderError(new TypeError('fetch failed')).kind).toBe('network');
  });
});

describe('extracting the status and the provider message', () => {
  it('looks inside the AI SDK retry wrapper', () => {
    const last = apiError(429, {
      error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' },
    });
    const retry = new RetryError({
      message: 'Failed after 3 attempts. Last error: Resource has been exhausted',
      reason: 'maxRetriesExceeded',
      errors: [last, last, last],
    });

    expect(extractProviderError(retry)).toMatchObject({
      status: 429,
      providerMessage: 'Resource has been exhausted (e.g. check quota).',
    });
    expect(describeProviderError(retry).kind).toBe('rate_limit');
    expect(isProviderError(retry)).toBe(true);
  });

  it('reads Gemini array bodies, plain message bodies and the status from the text', () => {
    expect(extractProviderError(apiError(404, [{ error: { code: 404, message: 'not here' } }])).providerMessage).toBe(
      'not here',
    );
    expect(extractProviderError(new Error('Upstream returned status code 503 for model x')).status).toBe(503);
  });

  it('does not treat our own errors as provider errors', () => {
    expect(isProviderError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});

describe('never shows keys, headers or prompts', () => {
  const leaky = apiError(400, {
    error: {
      message: `Bad request for key=${FAKE_KEY} at https://api.example.com/v1/chat?api_key=${FAKE_KEY} with Authorization: Bearer ${FAKE_KEY} and ${GOOGLE_KEY}`,
    },
  });

  function assertClean(text: string) {
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain('FAKEKEY');
    expect(text).not.toContain(GOOGLE_KEY);
    expect(text).not.toContain(PROMPT);
    expect(text).not.toContain('api.example.com');
    expect(text).not.toContain('googleapis.com/v1beta/models/gemini:streamGenerateContent');
    expect(text.toLowerCase()).not.toContain('bearer');
  }

  it('in the message the user sees', () => {
    const { message } = describeProviderError(leaky);

    expect(message.startsWith('The AI provider returned an error (HTTP 400): Bad request for key=[removed]')).toBe(
      true,
    );
    assertClean(message);
  });

  it('in the error response body and the stream error text', async () => {
    const response = toApiErrorResponse(toProviderApiError(leaky, 'Google'));
    const body = await response.text();

    assertClean(body);
    assertClean(toSafeStreamErrorMessage(leaky));

    for (const status of [401, 403, 404, 429, 500]) {
      assertClean(toSafeStreamErrorMessage(apiError(status, { error: { message: `failure with ${FAKE_KEY}` } })));
    }
  });

  it('in the server log, which keeps only the status, the error name and a cleaned excerpt', () => {
    describeProviderError(leaky);

    const log = logs.join('\n');
    expect(log).toContain('status=400');
    expect(log).toContain('AI_APICallError');
    assertClean(log);
  });

  it('sanitizeProviderMessage removes links, keys, tokens and long secrets but keeps normal words', () => {
    expect(sanitizeProviderMessage(`token: ${FAKE_KEY} and https://x.example/a?b=c`)).toBe(
      'token: [removed] and [link removed]',
    );
    expect(sanitizeProviderMessage('The input token count (900) exceeds the limit')).toBe(
      'The input token count (900) exceeds the limit',
    );
    expect(sanitizeProviderMessage('Invalid API key provided')).toBe('Invalid API key provided');
    expect(sanitizeProviderMessage(`id ${'a1B2'.repeat(10)} failed`)).toBe('id [removed] failed');
  });
});

describe('errors that arrive after the response has started', () => {
  async function streamWithLateError(error: unknown) {
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: 'text-start', id: 't1' });
        writer.write({ type: 'text-delta', id: 't1', delta: 'Building your app' });
        throw error;
      },
      onError: (failure) => toSafeStreamErrorMessage(failure, 'Google'),
    });

    const chunks: UIMessageChunk[] = [];

    for await (const chunk of stream as unknown as AsyncIterable<UIMessageChunk>) {
      chunks.push(chunk);
    }

    return chunks;
  }

  it('use the same mapping, as the JSON body the client already parses (status, title, message)', async () => {
    const chunks = await streamWithLateError(
      apiError(429, { error: { code: 429, message: 'tokens per minute limit reached', status: 'RESOURCE_EXHAUSTED' } }),
    );

    expect(chunks.some((chunk) => chunk.type === 'text-delta')).toBe(true);

    const errorChunk = chunks.find((chunk) => chunk.type === 'error') as { errorText: string } | undefined;
    expect(errorChunk).toBeDefined();

    // Chat.client.tsx handleError does JSON.parse(error.message) and reads these fields
    expect(JSON.parse(errorChunk!.errorText)).toEqual({
      error: true,
      message:
        "The AI provider's rate limit or free-tier limit was reached (HTTP 429). Wait a minute and try again, or use another model or a paid key.",
      statusCode: 429,
      isRetryable: true,
      provider: 'Google',
    });
  });

  it('never leak a key from a late error either', async () => {
    const chunks = await streamWithLateError(apiError(500, { error: { message: `boom ${FAKE_KEY}` } }));
    const text = JSON.stringify(chunks);

    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain(PROMPT);
    expect(text).toContain('having problems right now (HTTP 500)');
  });
});
