import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readBodyText } from '~/lib/.server/api/read-body';
import { getBearerToken } from '~/lib/.server/credits';
import { hmacSha256Hex, timingSafeEqual } from '~/lib/.server/hmac';

export { hmacSha256Hex, timingSafeEqual } from '~/lib/.server/hmac';
import { PAYMENT_CURRENCY, findBuyablePlan } from '~/lib/payments/packs';
import { createScopedLogger } from '~/utils/logger';

/**
 * Razorpay payments that buy credits (server only).
 *
 *   POST /api/payments/create-order  logged-in user picks a plan -> Razorpay order (USD) + "created" row
 *   POST /api/payments/verify        browser sends Razorpay's checkout result -> signature check -> credits
 *   POST /api/payments/webhook       Razorpay sends payment.captured -> signature check -> credits
 *
 * Credits are added only by grant_credits_for_payment (supabase/migrations/0002_payments.sql),
 * which adds them once per payment, however often verify and the webhook arrive.
 *
 * Secrets (RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, SUPABASE_SECRET_KEY) are
 * read only from the Worker's runtime env (or process.env in local dev), never
 * from import.meta.env, are never sent to the browser and are never logged.
 * Request bodies are never logged either.
 */

const logger = createScopedLogger('payments');

const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';

/**
 * TEMPORARY test switch: with PAYMENT_TEST_INR=1 (runtime variable) AND a
 * Razorpay TEST key (rzp_test_...), orders are made in INR with these fixed
 * amounts (in paise) instead of USD, for accounts without international
 * payments. Never with a live key. Prices shown to users and credits granted
 * do not change.
 */
const TEST_INR_AMOUNTS_PAISE: Record<string, number> = { pro: 2500 * 100, ultra: 6000 * 100 };

/** True only when PAYMENT_TEST_INR is exactly "1" and the key id is a test key. */
export function isTestInrEnabled(env: unknown, keyId: string): boolean {
  if (readRuntime('PAYMENT_TEST_INR', env) !== '1') {
    return false;
  }

  if (!keyId.startsWith('rzp_test_')) {
    // never with a live (or unknown) key: real customers always pay the real price in USD
    logger.warn('PAYMENT_TEST_INR is ignored: it only works with a rzp_test_ key');
    return false;
  }

  return true;
}

const MAX_BODY_BYTES = 16 * 1024;
const MAX_WEBHOOK_BYTES = 256 * 1024;

export interface PaymentsDeps {
  /** The Worker env (context.cloudflare.env). */
  env: unknown;
  fetch?: typeof fetch;
  createSupabase?: typeof createClient;
}

/* ---------------------------------------------------------------- responses */

export type PaymentsErrorCode =
  | 'payments_unavailable'
  | 'login_required'
  | 'bad_request'
  | 'bad_signature'
  | 'unknown_order'
  | 'wrong_user'
  | 'already_paid'
  | 'order_failed'
  | 'currency_not_enabled'
  | 'grant_failed';

const ERRORS: Record<PaymentsErrorCode, { status: number; message: string }> = {
  payments_unavailable: { status: 503, message: 'Payments are not set up on this server yet.' },
  login_required: { status: 401, message: 'Please log in to buy credits.' },
  bad_request: { status: 400, message: 'The payment request is not valid.' },
  bad_signature: { status: 400, message: 'The payment could not be verified.' },
  unknown_order: { status: 404, message: 'This order was not found.' },
  wrong_user: { status: 403, message: 'This order belongs to another account.' },
  already_paid: { status: 409, message: 'This order was already paid with another payment.' },
  order_failed: { status: 502, message: 'Could not create the order. Please try again.' },
  currency_not_enabled: { status: 422, message: 'Dollar payments are not enabled on this Razorpay account yet.' },
  grant_failed: { status: 500, message: 'The payment was received but the credits could not be added yet.' },
};

export function paymentsError(code: PaymentsErrorCode): Response {
  const { status, message } = ERRORS[code];
  return Response.json({ error: true, code, message, statusCode: status }, { status });
}

/* ---------------------------------------------------------------- configuration */

type RuntimeName =
  'RAZORPAY_KEY_ID' | 'RAZORPAY_KEY_SECRET' | 'RAZORPAY_WEBHOOK_SECRET' | 'SUPABASE_SECRET_KEY' | 'PAYMENT_TEST_INR';

/** A runtime variable: the Worker env first, then process.env (local dev). Never import.meta.env. */
function readRuntime(name: RuntimeName, env: unknown): string | undefined {
  const fromEnv = typeof env === 'object' && env ? (env as Record<string, unknown>)[name] : undefined;
  const value = fromEnv ?? (typeof process === 'undefined' ? undefined : process.env[name]);

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readSupabaseUrl(env: unknown): string | undefined {
  const fromEnv = typeof env === 'object' && env ? (env as Record<string, unknown>).VITE_SUPABASE_URL : undefined;

  const value =
    import.meta.env.VITE_SUPABASE_URL ||
    fromEnv ||
    (typeof process === 'undefined' ? undefined : process.env.VITE_SUPABASE_URL);

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

type Need = RuntimeName | 'VITE_SUPABASE_URL';

/** The values a route needs, or the names of the missing ones (logged; never the values). */
export function readPaymentsConfig<N extends Need>(
  env: unknown,
  needs: readonly N[],
): { ok: true; values: Record<N, string> } | { ok: false; missing: N[] } {
  const values = {} as Record<N, string>;
  const missing: N[] = [];

  for (const name of needs) {
    const value = name === 'VITE_SUPABASE_URL' ? readSupabaseUrl(env) : readRuntime(name, env);

    if (value) {
      values[name] = value;
    } else {
      missing.push(name);
    }
  }

  return missing.length ? { ok: false, missing } : { ok: true, values };
}

function adminClient(deps: PaymentsDeps, url: string, secretKey: string): SupabaseClient {
  return (deps.createSupabase ?? createClient)(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/* ---------------------------------------------------------------- signatures */

/** Checkout result: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export async function isValidPaymentSignature(
  keySecret: string,
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<boolean> {
  const expected = await hmacSha256Hex(keySecret, `${orderId}|${paymentId}`);
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}

/** Webhook: HMAC-SHA256 of the raw body with the webhook secret. */
export async function isValidWebhookSignature(webhookSecret: string, rawBody: string, signature: string) {
  const expected = await hmacSha256Hex(webhookSecret, rawBody);
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}

/* ---------------------------------------------------------------- helpers */

const ORDER_ID = /^order_[A-Za-z0-9]{1,40}$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]{1,40}$/;

async function readJson(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const value = JSON.parse(await readBodyText(request, { maxBytes: MAX_BODY_BYTES })) as unknown;
    return typeof value === 'object' && value && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** The logged-in user (Supabase access token in the Authorization header), checked with Supabase Auth. */
async function requireUser(request: Request, admin: SupabaseClient): Promise<{ id: string } | undefined> {
  const token = getBearerToken(request);

  if (!token) {
    return undefined;
  }

  try {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? undefined : { id: data.user.id };
  } catch {
    return undefined;
  }
}

interface GrantResult {
  result: 'granted' | 'already_granted';
  credits: number;
  balance: number | null;
  plan: string | null;
  plan_until: string | null;
}

/**
 * Razorpay's error code, and whether the error says this currency cannot be
 * used (for USD: international payments are not enabled on the account).
 */
async function readRazorpayError(response: Response): Promise<{ code: string; currencyNotEnabled: boolean }> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown; description?: unknown; field?: unknown } };
    const code = typeof body.error?.code === 'string' ? body.error.code.slice(0, 64) : 'no code';
    const text = `${String(body.error?.description ?? '')} ${String(body.error?.field ?? '')}`.toLowerCase();

    return { code, currencyNotEnabled: /currency|international/.test(text) };
  } catch {
    return { code: 'no code', currencyNotEnabled: false };
  }
}

async function grantCredits(
  admin: SupabaseClient,
  orderId: string,
  paymentId: string,
): Promise<{ ok: true; grant: GrantResult } | { ok: false; code: 'already_paid' | 'grant_failed' }> {
  const { data, error } = await admin.rpc('grant_credits_for_payment', { order_id: orderId, payment_id: paymentId });

  if (error) {
    const alreadyPaid = (error.message ?? '').includes('already paid by another payment');
    logger.error(`grant_credits_for_payment failed for ${orderId}: ${error.code ?? 'no code'}`);

    return { ok: false, code: alreadyPaid ? 'already_paid' : 'grant_failed' };
  }

  const grant = data as GrantResult;

  return {
    ok: true,
    grant: {
      result: grant.result,
      credits: grant.credits,
      balance: grant.balance ?? null,
      plan: grant.plan ?? null,
      plan_until: grant.plan_until ?? null,
    },
  };
}

/* ---------------------------------------------------------------- create-order */

export async function createOrder(request: Request, deps: PaymentsDeps): Promise<Response> {
  const config = readPaymentsConfig(deps.env, [
    'VITE_SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
  ] as const);

  if (!config.ok) {
    logger.error(`create-order: missing ${config.missing.join(', ')}`);
    return paymentsError('payments_unavailable');
  }

  const { VITE_SUPABASE_URL, SUPABASE_SECRET_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = config.values;
  const admin = adminClient(deps, VITE_SUPABASE_URL, SUPABASE_SECRET_KEY);

  const user = await requireUser(request, admin);

  if (!user) {
    return paymentsError('login_required');
  }

  // the plan's price, credits and currency come from the server's list, never from the browser
  const plan = findBuyablePlan((await readJson(request))?.planId);
  const testInrAmount = plan ? TEST_INR_AMOUNTS_PAISE[plan.id] : undefined;

  if (!plan) {
    return paymentsError('bad_request');
  }

  // normally the plan's USD price; the INR test switch only changes what Razorpay charges
  const inr = isTestInrEnabled(deps.env, RAZORPAY_KEY_ID) && testInrAmount !== undefined;
  const amount = inr ? (testInrAmount as number) : plan.amountCents;
  const currency = inr ? 'INR' : PAYMENT_CURRENCY;

  let order: { id?: unknown; amount?: unknown; currency?: unknown };

  try {
    const response = await (deps.fetch ?? fetch)(RAZORPAY_ORDERS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency,
        receipt: `ca_${Date.now()}`,
        notes: { user_id: user.id, plan: plan.id, credits: String(plan.credits) },
      }),
    });

    if (!response.ok) {
      const rejection = await readRazorpayError(response);

      // only the status and Razorpay's error code are logged, never its full answer
      logger.error(`create-order: Razorpay answered ${response.status} ${rejection.code}`);

      return paymentsError(rejection.currencyNotEnabled ? 'currency_not_enabled' : 'order_failed');
    }

    order = (await response.json()) as typeof order;
  } catch (error) {
    logger.error(`create-order: Razorpay request failed (${error instanceof Error ? error.name : 'unknown'})`);
    return paymentsError('order_failed');
  }

  if (
    typeof order.id !== 'string' ||
    !ORDER_ID.test(order.id) ||
    order.amount !== amount ||
    order.currency !== currency
  ) {
    logger.error('create-order: unexpected Razorpay order');
    return paymentsError('order_failed');
  }

  const { error } = await admin.from('payments').insert({
    user_id: user.id,
    razorpay_order_id: order.id,
    credits: plan.credits,
    amount_minor: amount,
    currency,
    plan: plan.id,
    status: 'created',
  });

  if (error) {
    logger.error(`create-order: could not save ${order.id}: ${error.code ?? 'no code'}`);
    return paymentsError('order_failed');
  }

  // the key id is public (Razorpay Checkout needs it); the key secret never leaves the server
  return Response.json({
    orderId: order.id,
    amount,
    currency,
    keyId: RAZORPAY_KEY_ID,
    credits: plan.credits,
    planId: plan.id,
  });
}

/* ---------------------------------------------------------------- verify */

export async function verifyPayment(request: Request, deps: PaymentsDeps): Promise<Response> {
  const config = readPaymentsConfig(deps.env, [
    'VITE_SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'RAZORPAY_KEY_SECRET',
  ] as const);

  if (!config.ok) {
    logger.error(`verify: missing ${config.missing.join(', ')}`);
    return paymentsError('payments_unavailable');
  }

  const { VITE_SUPABASE_URL, SUPABASE_SECRET_KEY, RAZORPAY_KEY_SECRET } = config.values;
  const admin = adminClient(deps, VITE_SUPABASE_URL, SUPABASE_SECRET_KEY);

  const user = await requireUser(request, admin);

  if (!user) {
    return paymentsError('login_required');
  }

  const body = await readJson(request);
  const orderId = body?.razorpay_order_id;
  const paymentId = body?.razorpay_payment_id;
  const signature = body?.razorpay_signature;

  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string' ||
    !ORDER_ID.test(orderId) ||
    !PAYMENT_ID.test(paymentId) ||
    signature.length > 128
  ) {
    return paymentsError('bad_request');
  }

  if (!(await isValidPaymentSignature(RAZORPAY_KEY_SECRET, orderId, paymentId, signature))) {
    logger.warn(`verify: bad signature for ${orderId}`);
    return paymentsError('bad_signature');
  }

  const { data: payment, error } = await admin
    .from('payments')
    .select('user_id')
    .eq('razorpay_order_id', orderId)
    .maybeSingle();

  if (error) {
    logger.error(`verify: could not read ${orderId}: ${error.code ?? 'no code'}`);
    return paymentsError('grant_failed');
  }

  if (!payment) {
    return paymentsError('unknown_order');
  }

  if ((payment as { user_id: string }).user_id !== user.id) {
    logger.warn(`verify: ${orderId} belongs to another user`);
    return paymentsError('wrong_user');
  }

  const granted = await grantCredits(admin, orderId, paymentId);

  if (!granted.ok) {
    return paymentsError(granted.code);
  }

  return Response.json({ ok: true, ...granted.grant });
}

/* ---------------------------------------------------------------- webhook */

interface WebhookPayload {
  event?: unknown;
  payload?: { payment?: { entity?: { id?: unknown; order_id?: unknown; amount?: unknown; currency?: unknown } } };
}

const ignored = (reason: string) => Response.json({ ok: true, ignored: reason });

export async function handleWebhook(request: Request, deps: PaymentsDeps): Promise<Response> {
  const config = readPaymentsConfig(deps.env, [
    'VITE_SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'RAZORPAY_WEBHOOK_SECRET',
  ] as const);

  if (!config.ok) {
    logger.error(`webhook: missing ${config.missing.join(', ')}`);
    return paymentsError('payments_unavailable');
  }

  const { VITE_SUPABASE_URL, SUPABASE_SECRET_KEY, RAZORPAY_WEBHOOK_SECRET } = config.values;

  let rawBody: string;

  try {
    rawBody = await readBodyText(request, { maxBytes: MAX_WEBHOOK_BYTES });
  } catch {
    return paymentsError('bad_request');
  }

  const signature = request.headers.get('X-Razorpay-Signature') ?? '';

  // the signature is over the RAW body, so it is checked before parsing
  if (!signature || !(await isValidWebhookSignature(RAZORPAY_WEBHOOK_SECRET, rawBody, signature))) {
    logger.warn('webhook: bad signature');
    return paymentsError('bad_signature');
  }

  let payload: WebhookPayload;

  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return paymentsError('bad_request');
  }

  if (payload.event !== 'payment.captured') {
    return ignored('event');
  }

  const entity = payload.payload?.payment?.entity;
  const orderId = entity?.order_id;
  const paymentId = entity?.id;

  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    !ORDER_ID.test(orderId) ||
    !PAYMENT_ID.test(paymentId)
  ) {
    logger.warn('webhook: payment.captured without a usable order or payment id');
    return ignored('ids');
  }

  const admin = adminClient(deps, VITE_SUPABASE_URL, SUPABASE_SECRET_KEY);

  const { data: payment, error } = await admin
    .from('payments')
    .select('amount_minor, currency')
    .eq('razorpay_order_id', orderId)
    .maybeSingle();

  if (error) {
    // a 5xx makes Razorpay retry later
    logger.error(`webhook: could not read ${orderId}: ${error.code ?? 'no code'}`);
    return paymentsError('grant_failed');
  }

  if (!payment) {
    // not an order this app created (for example another app on the same account)
    return ignored('unknown_order');
  }

  // the saved order's own currency, so older rupee orders still match
  const saved = payment as { amount_minor: number; currency: string };

  if (entity?.amount !== saved.amount_minor || entity?.currency !== saved.currency) {
    logger.error(`webhook: amount or currency of ${paymentId} does not match ${orderId}; no credits added`);
    return ignored('amount');
  }

  const granted = await grantCredits(admin, orderId, paymentId);

  if (!granted.ok) {
    // another payment already paid this order: nothing to retry
    return granted.code === 'already_paid' ? ignored('already_paid') : paymentsError('grant_failed');
  }

  return Response.json({ ok: true, result: granted.grant.result });
}
