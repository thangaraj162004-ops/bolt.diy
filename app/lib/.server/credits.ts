import { createClient } from '@supabase/supabase-js';
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { hmacSha256Hex, timingSafeEqual } from '~/lib/.server/hmac';
import { CREDITS_PER_MESSAGE, SPEND_REASON, type CreditsErrorCode } from '~/lib/supabase/credits-config';
import { createScopedLogger } from '~/utils/logger';

/**
 * Server-side credit check for /api/chat, run before the AI is called.
 *
 * It calls spend_credits AS THE USER: the Supabase client gets the project URL
 * and the PUBLISHABLE key plus the user's own access token (Authorization
 * header). No secret key is used; Row Level Security and the SQL function
 * decide what the user may do. Without the Supabase variables nothing is
 * charged.
 */

const logger = createScopedLogger('credits');

/**
 * A follow-up request (the browser sending tool results back) is free, but only
 * this many tool steps after one user message. Past that, a request is charged
 * like a new message, so a forged tool result cannot give unlimited free replies.
 */
export const MAX_FREE_FOLLOW_UP_STEPS = 100;

export type ChargeErrorCode = CreditsErrorCode;

/** The Worker env (context.cloudflare.env), or undefined outside Cloudflare. */
type Env = unknown;

/* ----------------------------------------------------------- the rule */

/**
 * True when this request carries a NEW user message, so it must be charged.
 *
 * Decided from the messages (chargeChatRequest also needs a valid follow-up
 * token before a follow-up step is free):
 * - last message from the user: a new message, charged;
 * - last message from the assistant whose last step is finished tool calls with
 *   their results: the AI's own follow-up step (the same rule the browser uses
 *   to re-send automatically), free while there is an earlier user message and
 *   at most MAX_FREE_FOLLOW_UP_STEPS steps since it;
 * - anything else: charged.
 */
export function isNewUserMessage(messages: UIMessage[]): boolean {
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) {
    return true;
  }

  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user');

  if (lastUserIndex === -1) {
    return true;
  }

  const stepsSinceUser = messages
    .slice(lastUserIndex + 1)
    .reduce((count, message) => count + message.parts.filter((part) => part.type === 'step-start').length, 0);

  return stepsSinceUser > MAX_FREE_FOLLOW_UP_STEPS;
}

/* ---------------------------------------------------------- configuration */

function readVar(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY', env: Env): string | undefined {
  const fromEnv = typeof env === 'object' && env ? (env as Record<string, unknown>)[name] : undefined;
  const value = import.meta.env[name] || fromEnv || (typeof process === 'undefined' ? undefined : process.env[name]);

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** URL and publishable key, or undefined when credits are not set up (then nothing is charged). */
export function getCreditsConfig(env: Env): { url: string; publishableKey: string } | undefined {
  const url = readVar('VITE_SUPABASE_URL', env);
  const publishableKey = readVar('VITE_SUPABASE_PUBLISHABLE_KEY', env);

  // never use a secret key here, even if one was put in the wrong variable
  if (!url || !publishableKey || publishableKey.startsWith('sb_secret_')) {
    return undefined;
  }

  return { url, publishableKey };
}

export function getBearerToken(request: Request): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '');
  return match?.[1];
}

/* ---------------------------------------------------------------- errors */

const MESSAGES: Record<ChargeErrorCode, { status: number; message: string }> = {
  login_required: { status: 401, message: 'Please log in to send a message.' },
  out_of_credits: { status: 402, message: 'You are out of credits.' },
  credits_unavailable: { status: 503, message: 'Could not check your credits. Please try again.' },
};

export function chargeErrorResponse(code: ChargeErrorCode): Response {
  const { status, message } = MESSAGES[code];

  return Response.json(
    { error: true, code, message, statusCode: status, isRetryable: code === 'credits_unavailable' },
    { status },
  );
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

function classify(error: PostgrestLikeError): ChargeErrorCode {
  const message = (error.message ?? '').toLowerCase();

  if (message.includes('not enough credits')) {
    return 'out_of_credits';
  }

  // 28000: spend_credits saw no user; PGRST301/PGRST303: the JWT is invalid or expired
  if (error.code === '28000' || error.code === 'PGRST301' || error.code === 'PGRST303' || message.includes('jwt')) {
    return 'login_required';
  }

  return 'credits_unavailable';
}

/* ---------------------------------------------------------------- follow-up tokens */

/**
 * The response header that carries a follow-up token, and the request header
 * the browser sends it back in.
 */
export const FOLLOW_UP_HEADER = 'X-CA-Follow-Up';

/** How long a follow-up token stays valid after the paid message. */
export const FOLLOW_UP_TOKEN_TTL_MS = 30 * 60 * 1000;

type RuntimeName = 'CREDITS_TOKEN_SECRET' | 'SUPABASE_SECRET_KEY';

/** A server runtime variable (Worker env, then process.env). Never import.meta.env. */
function readRuntime(name: RuntimeName, env: Env): string | undefined {
  const fromEnv = typeof env === 'object' && env ? (env as Record<string, unknown>)[name] : undefined;
  const value = fromEnv ?? (typeof process === 'undefined' ? undefined : process.env[name]);

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function base64UrlEncode(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(text: string): string {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));

  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/** The user id (`sub`) in a Supabase access token. Only used after the token was verified by Supabase. */
export function tokenSubject(accessToken: string): string | undefined {
  try {
    const payload = JSON.parse(base64UrlDecode(accessToken.split('.')[1] ?? '')) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

/** SHA-256 (hex) of the last user message: its id and its text, so an edited message no longer matches. */
export async function paidMessageHash(messages: UIMessage[]): Promise<string | undefined> {
  const message = messages.findLast((item) => item.role === 'user');

  if (!message) {
    return undefined;
  }

  const text = message.parts.map((part) => (part.type === 'text' ? part.text : part.type)).join('\n');

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${message.id}\n${text}`));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface FollowUpClaims {
  v: 1;

  /** The user who paid. */
  sub: string;

  /** paidMessageHash of the paid user message. */
  mh: string;

  /** Expiry, ms since epoch. */
  exp: number;
}

/** `<base64url(claims)>.<hex HMAC-SHA256 of that part>`, signed with CREDITS_TOKEN_SECRET. */
export async function signFollowUpToken(secret: string, claims: FollowUpClaims): Promise<string> {
  const body = base64UrlEncode(JSON.stringify(claims));
  return `${body}.${await hmacSha256Hex(secret, body)}`;
}

/** The claims of a follow-up token, or undefined if it is malformed, forged or expired. */
export async function readFollowUpToken(
  secret: string,
  token: string | null | undefined,
  now = Date.now(),
): Promise<FollowUpClaims | undefined> {
  if (!token || token.length > 1024) {
    return undefined;
  }

  const [body, signature, extra] = token.split('.');

  if (!body || !signature || extra !== undefined) {
    return undefined;
  }

  if (!timingSafeEqual(await hmacSha256Hex(secret, body), signature.toLowerCase())) {
    return undefined;
  }

  try {
    const claims = JSON.parse(base64UrlDecode(body)) as Partial<FollowUpClaims>;

    if (
      claims.v !== 1 ||
      typeof claims.sub !== 'string' ||
      typeof claims.mh !== 'string' ||
      typeof claims.exp !== 'number' ||
      claims.exp <= now
    ) {
      return undefined;
    }

    return claims as FollowUpClaims;
  } catch {
    return undefined;
  }
}

/* ---------------------------------------------------------------- charge */

/**
 * What chargeChatRequest decided:
 * - not-configured: Supabase is not set up, nothing is charged;
 * - refused: do not call the AI, send `response` ("please log in", "out of credits", check failed);
 * - free-follow-up: a follow-up step of a paid message with a valid follow-up token;
 * - charged: CREDITS_PER_MESSAGE was spent for this request.
 */
export type ChargeOutcome =
  | { kind: 'not-configured' }
  | { kind: 'refused'; response: Response }
  | { kind: 'free-follow-up' }
  | { kind: 'charged'; requestId: string; userId: string; followUpToken?: string };

/**
 * Runs before the AI call.
 *
 * A follow-up step is free only when the request is shaped like one (the AI's
 * finished tool calls, at most MAX_FREE_FOLLOW_UP_STEPS steps after the last
 * user message) AND carries a valid follow-up token for that same user and
 * that same paid message. Everything else, including a hand-edited request, is
 * charged as a new message. A charged request gets a new follow-up token.
 */
export async function chargeChatRequest({
  request,
  messages,
  env,
  createSupabase = createClient,
  now = Date.now(),
}: {
  request: Request;
  messages: UIMessage[];
  env: Env;
  createSupabase?: typeof createClient;
  now?: number;
}): Promise<ChargeOutcome> {
  const config = getCreditsConfig(env);

  if (!config) {
    return { kind: 'not-configured' };
  }

  const token = getBearerToken(request);

  if (!token) {
    return { kind: 'refused', response: chargeErrorResponse('login_required') };
  }

  const supabase = createSupabase(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const tokenSecret = readRuntime('CREDITS_TOKEN_SECRET', env);

  if (!tokenSecret) {
    logger.warn('CREDITS_TOKEN_SECRET is not set: follow-up steps are charged like new messages');
  }

  try {
    const messageHash = await paidMessageHash(messages);

    if (!isNewUserMessage(messages) && tokenSecret && messageHash) {
      const claims = await readFollowUpToken(tokenSecret, request.headers.get(FOLLOW_UP_HEADER), now);

      if (claims && claims.mh === messageHash) {
        // the token is for this paid message; it must also be this user's own, valid login
        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data.user) {
          return { kind: 'refused', response: chargeErrorResponse('login_required') };
        }

        if (data.user.id === claims.sub) {
          return { kind: 'free-follow-up' };
        }
      }

      // no valid token for this message: charged below like a new message
    }

    const { error } = await supabase.rpc('spend_credits', { amount: CREDITS_PER_MESSAGE, reason: SPEND_REASON });

    if (error) {
      const code = classify(error);

      if (code === 'credits_unavailable') {
        logger.error(`spend_credits failed: ${error.code ?? 'no code'}`);
      }

      return { kind: 'refused', response: chargeErrorResponse(code) };
    }

    // Supabase accepted the token for spend_credits, so its subject is the paying user
    const userId = tokenSubject(token) ?? '';

    const followUpToken =
      tokenSecret && messageHash && userId
        ? await signFollowUpToken(tokenSecret, {
            v: 1,
            sub: userId,
            mh: messageHash,
            exp: now + FOLLOW_UP_TOKEN_TTL_MS,
          })
        : undefined;

    return { kind: 'charged', requestId: crypto.randomUUID(), userId, followUpToken };
  } catch (error) {
    logger.error(`credit check failed: ${error instanceof Error ? error.name : 'unknown error'}`);
    return { kind: 'refused', response: chargeErrorResponse('credits_unavailable') };
  }
}

/* ---------------------------------------------------------------- refund */

/**
 * Gives the credit of a charged request back (refund_credits, once per request
 * id). Uses the server-only SUPABASE_SECRET_KEY; without it nothing is refunded.
 * Only error codes are logged. Never throws.
 */
export async function refundChatCredit({
  env,
  userId,
  requestId,
  createSupabase = createClient,
}: {
  env: Env;
  userId: string;
  requestId: string;
  createSupabase?: typeof createClient;
}): Promise<'refunded' | 'already_refunded' | 'skipped' | 'failed'> {
  const url = getCreditsConfig(env)?.url;
  const secretKey = readRuntime('SUPABASE_SECRET_KEY', env);

  if (!url || !secretKey || !userId) {
    logger.warn('refund skipped: SUPABASE_SECRET_KEY or the user id is missing');
    return 'skipped';
  }

  try {
    const admin = createSupabase(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await admin.rpc('refund_credits', {
      user_id: userId,
      request_id: requestId,
      amount: CREDITS_PER_MESSAGE,
    });

    if (error) {
      logger.error(`refund_credits failed: ${error.code ?? 'no code'}`);
      return 'failed';
    }

    return (data as { result?: string } | null)?.result === 'already_refunded' ? 'already_refunded' : 'refunded';
  } catch (error) {
    logger.error(`refund failed: ${error instanceof Error ? error.name : 'unknown error'}`);
    return 'failed';
  }
}

function isAbort(error: unknown): boolean {
  const name = typeof error === 'object' && error && 'name' in error ? String(error.name) : '';
  return name === 'AbortError' || name === 'ResponseAborted';
}

/**
 * Tracks one chat request: if the AI fails before any reply was sent, the
 * credit of a charged request is refunded once. A request the user cancelled
 * is not refunded.
 */
export function createRefundOnFailure(
  charge: ChargeOutcome,
  options: { env: Env; waitUntil?: (promise: Promise<unknown>) => void; createSupabase?: typeof createClient },
) {
  let replied = false;
  let done = false;

  return {
    /** The AI sent part of a reply: no refund any more. */
    markReplied() {
      replied = true;
    },

    /** The AI call failed. Returns the refund promise, if one was started. */
    onFailure(error: unknown): Promise<unknown> | undefined {
      if (done || replied || charge.kind !== 'charged' || isAbort(error)) {
        return undefined;
      }

      done = true;

      const promise = refundChatCredit({
        env: options.env,
        userId: charge.userId,
        requestId: charge.requestId,
        createSupabase: options.createSupabase,
      });

      options.waitUntil?.(promise);

      return promise;
    },
  };
}
