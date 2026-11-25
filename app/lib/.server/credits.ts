import { createClient } from '@supabase/supabase-js';
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
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
 * Decided from the messages only (never from a header the browser sends):
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

/* ---------------------------------------------------------------- charge */

/**
 * Runs before the AI call. Returns a Response to send INSTEAD of calling the
 * AI (log in / out of credits / check failed), or undefined to go on.
 */
export async function chargeChatRequest({
  request,
  messages,
  env,
  createSupabase = createClient,
}: {
  request: Request;
  messages: UIMessage[];
  env: Env;
  createSupabase?: typeof createClient;
}): Promise<Response | undefined> {
  const config = getCreditsConfig(env);

  if (!config) {
    return undefined;
  }

  const token = getBearerToken(request);

  if (!token) {
    return chargeErrorResponse('login_required');
  }

  const supabase = createSupabase(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    if (!isNewUserMessage(messages)) {
      // a free follow-up step, but still only for a logged-in user
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? chargeErrorResponse('login_required') : undefined;
    }

    const { error } = await supabase.rpc('spend_credits', { amount: CREDITS_PER_MESSAGE, reason: SPEND_REASON });

    if (error) {
      const code = classify(error);

      if (code === 'credits_unavailable') {
        logger.error(`spend_credits failed: ${error.code ?? 'no code'}`);
      }

      return chargeErrorResponse(code);
    }

    return undefined;
  } catch (error) {
    logger.error(`credit check failed: ${error instanceof Error ? error.name : 'unknown error'}`);
    return chargeErrorResponse('credits_unavailable');
  }
}
