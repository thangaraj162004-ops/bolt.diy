/**
 * Turns errors from AI providers into short, plain-English messages.
 *
 * The original error stays on the server: only its HTTP status, error name and
 * a cleaned excerpt are logged (never the request body, headers or keys). The
 * user sees a fixed explanation for the common cases, or the status and the
 * provider's own message, cleaned of URLs, keys and tokens and cut to 200
 * characters.
 */
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.provider-errors');

export const MAX_PROVIDER_MESSAGE_LENGTH = 200;

export type ProviderErrorKind =
  'rate_limit' | 'auth' | 'context_limit' | 'model_not_found' | 'server' | 'network' | 'other';

export interface ProviderErrorDetails {
  /** HTTP status from the provider, when known. */
  status?: number;

  /** The provider's own error message (raw; clean it before showing it). */
  providerMessage: string;

  /** Name of the error class, e.g. AI_APICallError. */
  errorName: string;
}

export interface DescribedProviderError {
  kind: ProviderErrorKind;
  message: string;
  statusCode: number;
  isRetryable: boolean;
}

/* ------------------------------------------------------------- extraction */

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asStatus(value: unknown): number | undefined {
  const number = typeof value === 'string' && /^\d{3}$/.test(value) ? Number(value) : value;
  return typeof number === 'number' && Number.isInteger(number) && number >= 100 && number <= 599 ? number : undefined;
}

/** The error and the errors it wraps (AI SDK RetryError, `cause` chains). */
function candidates(error: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const queue: unknown[] = [error];

  while (queue.length > 0 && out.length < 8) {
    const record = asRecord(queue.shift());

    if (!record || out.includes(record)) {
      continue;
    }

    out.push(record);
    queue.push(record.lastError, record.cause);

    if (Array.isArray(record.errors)) {
      queue.push(record.errors.at(-1));
    }
  }

  return out;
}

/** Error objects in provider bodies: {error:{message,code,status}}, {message}, or [{error:{…}}]. */
function bodyError(body: unknown): { message?: string; status?: number } {
  let value = body;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (Array.isArray(value)) {
    value = value[0];
  }

  const record = asRecord(value);
  const inner = asRecord(record?.error) ?? record;

  if (!inner) {
    return {};
  }

  const message = typeof inner.message === 'string' ? inner.message : undefined;
  const status = asStatus(inner.code) ?? asStatus(inner.status) ?? asStatus(record?.status);

  return { message, status };
}

export function extractProviderError(error: unknown): ProviderErrorDetails {
  const chain = candidates(error);

  let status: number | undefined;
  let providerMessage = '';

  // the innermost error with an HTTP status is the provider's answer (APICallError)
  for (const candidate of [...chain].reverse()) {
    const fromData = bodyError(candidate.data);
    const fromBody = bodyError(candidate.responseBody);

    const candidateStatus =
      asStatus(candidate.statusCode) ?? asStatus(candidate.status) ?? fromData.status ?? fromBody.status;

    if (candidateStatus !== undefined || fromData.message || fromBody.message) {
      status ??= candidateStatus;
      providerMessage ||= fromData.message ?? fromBody.message ?? '';
    }
  }

  if (!providerMessage) {
    const innermost = chain.at(-1) ?? asRecord(error);
    providerMessage =
      typeof innermost?.message === 'string' ? innermost.message : typeof error === 'string' ? error : '';
  }

  status ??= asStatus(/\b(?:status(?: code)?|HTTP)\s*:?\s*(\d{3})\b/i.exec(providerMessage)?.[1]);

  const first = chain[0];
  const errorName = typeof first?.name === 'string' ? first.name : typeof error === 'string' ? 'string' : 'Error';

  return { status, providerMessage, errorName };
}

/* --------------------------------------------------------- classification */

const RATE_LIMIT =
  /rate[ _-]?limit|too many requests|quota|resource[ _]exhausted|per[ _](?:min|minute|day|hour)\b|\b[rt]pm\b|\b[rt]pd\b|free[ _-]?tier|capacity exceeded/i;

const AUTH =
  /(?:invalid|incorrect|missing|no|bad|wrong)[ _-](?:api[ _-]?)?key|api[ _-]?key[ _-](?:not valid|invalid|is missing|required)|unauthori[sz]ed|permission[ _-]denied|forbidden|authentication|not allowed to (?:use|access)|does not have access|no access to (?:this )?model/i;

const CONTEXT_LIMIT =
  /context[ _]length[ _]exceeded|maximum context length|context (?:window|length)\b.{0,40}\b(?:exceed|too long|limit)|prompt is too long|input (?:is )?too long|input token count.{0,60}exceeds|exceeds the maximum number of tokens|too many (?:input )?tokens|token limit (?:exceeded|reached)|exceeds? (?:the )?(?:model'?s? )?(?:maximum )?context|\bmax[ _]?tokens?\b.{0,60}\b(?:exceed|too large|greater than)/i;

const MODEL_NOT_FOUND =
  /model\b.{0,80}\b(?:not found|does not exist|is not supported|not supported for|not available|unavailable|unknown|decommissioned|deprecated|retired|no longer)|(?:unknown|invalid|unsupported|no such|unrecognized) model|model[_ ]not[_ ]found|not found for api version|no endpoints found/i;

const SERVER = /overloaded|service unavailable|internal (?:server )?error|bad gateway|gateway timeout|upstream/i;

const NETWORK = /fetch failed|econnrefused|econnreset|enotfound|etimedout|getaddrinfo|network error|socket hang up/i;

export function classifyProviderError({ status, providerMessage, errorName }: ProviderErrorDetails): ProviderErrorKind {
  const text = providerMessage;

  // first: a 429 that talks about "tokens per minute" is a rate limit, not a too-long conversation
  if (status === 429 || RATE_LIMIT.test(text)) {
    return 'rate_limit';
  }

  if (status === 401 || status === 403 || errorName === 'AI_LoadAPIKeyError' || AUTH.test(text)) {
    return 'auth';
  }

  if (CONTEXT_LIMIT.test(text) && (status === undefined || status === 400 || status === 413 || status === 422)) {
    return 'context_limit';
  }

  if ((status === undefined || status === 400 || status === 404) && MODEL_NOT_FOUND.test(text)) {
    return 'model_not_found';
  }

  if ((status !== undefined && status >= 500) || (status === undefined && SERVER.test(text))) {
    return 'server';
  }

  if (status === undefined && NETWORK.test(text)) {
    return 'network';
  }

  return 'other';
}

/* ---------------------------------------------------------------- cleaning */

/** Removes URLs, keys, tokens and long secret-looking strings, then cuts to `maxLength` characters. */
export function sanitizeProviderMessage(text: string, maxLength = MAX_PROVIDER_MESSAGE_LENGTH): string {
  const cleaned = text
    .replace(/https?:\/\/\S+/gi, '[link removed]')
    .replace(/\b(?:bearer|basic)\s+[\w.~+/=-]+/gi, '[credential removed]')
    .replace(
      /\b((?:x-)?(?:api[ _-]?key|apikey|key|token|access[ _-]?token|secret|password|authorization|auth))(\s*[:=]\s*)["']?[^\s"',;]+/gi,
      '$1$2[removed]',
    )
    .replace(/\b(?:sk|pk|rk|xai|gsk|key)[-_][\w-]{8,}/gi, '[key removed]')
    .replace(/\bAIza[\w-]{20,}/g, '[key removed]')
    .replace(/\b[A-Za-z0-9_\-+/]{32,}={0,2}/g, '[removed]')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…` : cleaned;
}

/* -------------------------------------------------------------- messages */

function withStatus(status: number | undefined) {
  return status === undefined ? '' : ` (HTTP ${status})`;
}

export function describeProviderError(error: unknown): DescribedProviderError {
  const details = extractProviderError(error);
  const kind = classifyProviderError(details);
  const { status } = details;

  logger.error(
    `Provider error: kind=${kind} status=${status ?? 'none'} name=${details.errorName} message="${sanitizeProviderMessage(details.providerMessage, 500)}"`,
  );

  switch (kind) {
    case 'rate_limit':
      return {
        kind,
        statusCode: 429,
        isRetryable: true,
        message: `The AI provider's rate limit or free-tier limit was reached${withStatus(status ?? 429)}. Wait a minute and try again, or use another model or a paid key.`,
      };
    case 'auth':
      return {
        kind,
        statusCode: status === 403 ? 403 : 401,
        isRetryable: false,
        message: `The AI provider did not accept the API key${withStatus(status)}: it is missing, wrong, or not allowed to use this model. Check the key in Settings.`,
      };
    case 'context_limit':
      return {
        kind,
        statusCode: 400,
        isRetryable: false,
        message:
          "The conversation is too long for this model's context window. Start a new chat or pick a model with a larger context.",
      };
    case 'model_not_found':
      return {
        kind,
        statusCode: status ?? 404,
        isRetryable: false,
        message: `The selected model is not available${withStatus(status)}. It may have been retired or renamed; pick another model and try again.`,
      };
    case 'server':
      return {
        kind,
        statusCode: status ?? 503,
        isRetryable: true,
        message: `The AI provider is having problems right now${withStatus(status)}. Try again in a moment or pick another model.`,
      };
    case 'network':
      return {
        kind,
        statusCode: 503,
        isRetryable: true,
        message: "Could not reach the AI provider. Check your connection and the provider's base URL, then try again.",
      };
    default: {
      const shown = sanitizeProviderMessage(details.providerMessage);

      return {
        kind,
        statusCode: status ?? 502,
        isRetryable: status === undefined || status >= 500,
        message: shown
          ? `The AI provider returned an error${withStatus(status)}: ${shown}`
          : `The AI provider request failed${withStatus(status)}. Check your provider settings and try again.`,
      };
    }
  }
}

/** True when the error came from a provider call (not from our own code). */
export function isProviderError(error: unknown): boolean {
  return candidates(error).some(
    (candidate) =>
      asStatus(candidate.statusCode) !== undefined ||
      candidate.responseBody !== undefined ||
      (typeof candidate.name === 'string' &&
        /^AI_(?:APICallError|RetryError|LoadAPIKeyError|NoContentGeneratedError|InvalidResponseDataError)$/.test(
          candidate.name,
        )),
  );
}
