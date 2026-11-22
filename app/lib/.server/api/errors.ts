import { InvalidToolInputError, NoSuchToolError, ToolChoiceViolationError } from 'ai';
import { classifyProviderError, describeProviderError, extractProviderError } from './provider-errors';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.errors');

/**
 * Error shape returned by the chat/llmcall routes.
 *
 * This is a wire contract, not an internal detail: Chat.client.tsx parses the
 * failure body and reads `statusCode`, `isRetryable`, `provider` and `message`
 * to pick the alert type (authentication / rate_limit / quota / network). Adding
 * a field is safe; renaming or removing one silently degrades every error alert
 * in the UI to "Request Failed".
 */
export interface ApiErrorBody {
  error: true;
  message: string;
  statusCode: number;
  isRetryable: boolean;
  provider: string;
}

/**
 * A failure with a deliberate HTTP status, so the wrapper does not have to guess.
 *
 * Anything thrown that is *not* an ApiError becomes a 500. That is why a plain
 * `throw new Error('bad input')` in a route used to surface as an opaque server
 * error: there was no way to say "this one is the client's fault".
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly isRetryable: boolean;
  readonly provider?: string;

  constructor(
    message: string,
    options: { status?: number; code?: string; isRetryable?: boolean; provider?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });

    this.name = 'ApiError';
    this.status = options.status ?? 500;
    this.code = options.code ?? 'internal_error';
    this.isRetryable = options.isRetryable ?? this.status >= 500;
    this.provider = options.provider;
  }

  /**
   * The wire body for this failure.
   *
   * A getter rather than a plain field because subclasses (PayloadTooLargeError,
   * ValidationError, …) override `name`, so anything identifying this error by
   * its `name` must not be matching on it. See `isTypedApiError` in security.ts.
   */
  get body(): ApiErrorBody {
    return {
      error: true,
      message: this.message,
      statusCode: this.status,
      isRetryable: this.isRetryable,
      provider: this.provider ?? 'unknown',
    };
  }
}

/** The request body could not be parsed, or failed schema validation. */
export class ValidationError extends ApiError {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message, { status: 400, code: 'invalid_request', isRetryable: false });
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

/** The body exceeded the route's byte budget. */
export class PayloadTooLargeError extends ApiError {
  constructor(limitBytes: number) {
    super(`Request body is too large. The limit is ${formatBytes(limitBytes)}.`, {
      status: 413,
      code: 'payload_too_large',
      isRetryable: false,
    });
    this.name = 'PayloadTooLargeError';
  }
}

/** The client stopped sending before the body was complete. */
export class RequestTimeoutError extends ApiError {
  constructor(timeoutMs: number) {
    super(`Request body timed out after ${Math.round(timeoutMs / 1000)}s.`, {
      status: 408,
      code: 'request_timeout',
      isRetryable: true,
    });
    this.name = 'RequestTimeoutError';
  }
}

/** The client disconnected mid-body. Not an error worth a stack trace. */
export class RequestAbortedError extends ApiError {
  constructor() {
    super('Request cancelled.', { status: 499, code: 'client_closed_request', isRetryable: false });
    this.name = 'RequestAbortedError';
  }
}

/**
 * Credentials problems, normalised across providers.
 *
 * Every provider phrases this differently ("Incorrect API key", "invalid x-api-key",
 * 401, 403), so the routes matched on substrings of the provider's message. Keep
 * provider diagnostics out of the client response because they can contain
 * request URLs or credential data.
 */
export function toMissingCredentialError(provider: string, providerMessage?: string): ApiError {
  if (providerMessage) {
    logger.warn('Provider credential error');
  }

  return new ApiError('Invalid or missing API key', {
    status: 401,
    code: 'missing_api_key',
    isRetryable: false,
    provider,
  });
}

/**
 * A provider failure as an ApiError with a plain-English message (see
 * provider-errors.ts). The original error is logged on the server without keys,
 * headers or the request body.
 */
export function toProviderApiError(error: unknown, provider = 'unknown'): ApiError {
  const described = describeProviderError(error);

  return new ApiError(described.message, {
    status: described.statusCode,
    code: `provider_${described.kind}`,
    isRetryable: described.isRetryable,
    provider,
  });
}

/** The client-safe text for a stream failure (tool-call problems, timeouts, provider errors). */
export function toSafeStreamErrorText(error: unknown): { message: string; statusCode: number; isRetryable: boolean } {
  const providerMessage = error instanceof Error ? error.message : String(error);
  const normalizedMessage = providerMessage.toLowerCase();

  if ((error instanceof Error && error.name === 'TimeoutError') || /timeout|timed\s*out/.test(normalizedMessage)) {
    if (extractProviderError(error).status === undefined) {
      logger.error('Streaming provider timeout');
      return {
        message:
          'The AI provider stopped responding before the next step completed. Completed file changes and tool results are preserved. Retry to continue, or select a different model.',
        statusCode: 504,
        isRetryable: true,
      };
    }
  }

  if (ToolChoiceViolationError.isInstance(error)) {
    return {
      message:
        'The selected model returned text instead of the required tool call, so the build could not continue. Retry or select a model that reliably supports tool calling.',
      statusCode: 422,
      isRetryable: true,
    };
  }

  if (InvalidToolInputError.isInstance(error) || normalizedMessage.startsWith('invalid input for tool ')) {
    return {
      message: 'The model supplied invalid tool arguments. Retry the tool call using its declared input schema.',
      statusCode: 422,
      isRetryable: true,
    };
  }

  if (NoSuchToolError.isInstance(error) || normalizedMessage.startsWith('model tried to call unavailable tool ')) {
    return {
      message: 'The model requested an unavailable tool. Use one of the supplied tools instead.',
      statusCode: 422,
      isRetryable: true,
    };
  }

  const described = describeProviderError(error);

  return { message: described.message, statusCode: described.statusCode, isRetryable: described.isRetryable };
}

/**
 * The error text for a UI message stream that already started. It is the same
 * JSON body as an error response, so the client shows the same title and
 * message whether the failure came before or after the response began.
 */
export function toSafeStreamErrorMessage(error: unknown, provider = 'unknown'): string {
  const { message, statusCode, isRetryable } = toSafeStreamErrorText(error);

  return JSON.stringify({ error: true, message, statusCode, isRetryable, provider } satisfies ApiErrorBody);
}

/** Wraps a plain-text provider stream so late failures become a safe text chunk. */
export function toSafeTextStream(stream: ReadableStream<string>): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  const encoder = new TextEncoder();

  let failed = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (failed) {
        controller.close();
        return;
      }

      try {
        const { done, value } = await reader.read();

        if (done) {
          reader.releaseLock();
          controller.close();

          return;
        }

        controller.enqueue(encoder.encode(value));
      } catch (error) {
        failed = true;
        reader.releaseLock();
        controller.enqueue(encoder.encode(`\n\n${toSafeStreamErrorText(error).message}`));
        controller.close();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

/** Returns a fixed client-safe token-limit response. */
export function toTokenLimitError(provider: string): ApiError {
  return new ApiError(
    'Token limit exceeded. Try reducing your request size or using a model with higher token limits.',
    {
      status: 400,
      code: 'token_limit_exceeded',
      isRetryable: false,
      provider,
    },
  );
}

/**
 * True only when the provider really says the context or token limit was
 * exceeded. A rate limit that mentions "tokens per minute" is not one.
 */
export function isTokenLimitFailure(error: unknown): error is Error {
  if (!(error instanceof Error) || isTypedFailure(error)) {
    return false;
  }

  return classifyProviderError(extractProviderError(error)) === 'context_limit';
}

function isTypedFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && 'status' in error;
}

/**
 * Builds the failure response for a caught error.
 *
 * Deliberately does not echo the raw error message for unexpected errors: a
 * thrown Error from deep inside the provider SDK can contain the request URL,
 * which for several providers embeds the key in a query string. Known ApiErrors
 * carry their own vetted message; anything else becomes a generic string.
 */
export function toApiErrorResponse(error: unknown, fallbackProvider = 'unknown'): Response {
  if (error instanceof ApiError) {
    return Response.json(
      {
        error: true,
        message: error.message,
        statusCode: error.status,
        isRetryable: error.isRetryable,
        provider: error.provider ?? fallbackProvider,
      } satisfies ApiErrorBody,
      { status: error.status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  /*
   * Aborts surface as a generic 500 everywhere else, which makes a user pressing
   * "stop" look like a server fault. 499 is the conventional client-closed code
   * and is not retryable.
   */
  if (isAbortError(error)) {
    return Response.json(
      {
        error: true,
        message: 'Request cancelled.',
        statusCode: 499,
        isRetryable: false,
        provider: fallbackProvider,
      } satisfies ApiErrorBody,
      { status: 499, headers: { 'Content-Type': 'application/json' } },
    );
  }

  logger.error('Unhandled route error');

  return Response.json(
    {
      error: true,
      message: 'An unexpected error occurred',
      statusCode: 500,
      isRetryable: true,
      provider: fallbackProvider,
    } satisfies ApiErrorBody,
    { status: 500, headers: { 'Content-Type': 'application/json' } },
  );
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.code === 'client_closed_request';
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}
