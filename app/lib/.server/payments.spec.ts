import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOrder,
  handleWebhook,
  hmacSha256Hex,
  timingSafeEqual,
  verifyPayment,
  type PaymentsDeps,
} from './payments';

/*
 * Razorpay and Supabase are fakes: fetch answers like the Orders API, and the
 * Supabase client keeps payments and balances in memory with the same rules as
 * grant_credits_for_payment in supabase/migrations/0002_payments.sql.
 */

const SECRETS = {
  RAZORPAY_KEY_ID: 'rzp_test_publicKeyId',
  RAZORPAY_KEY_SECRET: 'test-key-secret-value',
  RAZORPAY_WEBHOOK_SECRET: 'test-webhook-secret-value',
  SUPABASE_SECRET_KEY: 'sb_secret_test_value',
};

const ENV = { ...SECRETS, VITE_SUPABASE_URL: 'https://example.supabase.co' };

const USERS: Record<string, string> = { 'token-A': 'user-A', 'token-B': 'user-B' };

/* ---------------------------------------------------------------- fakes */

interface PaymentRow {
  user_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  credits: number;
  amount_paise: number;
  status: 'created' | 'paid';
}

function fakeSupabase() {
  const payments: PaymentRow[] = [];

  const balances = new Map<string, number>([
    ['user-A', 20],
    ['user-B', 20],
  ]);

  const ledger: { user_id: string; change: number; reason: string }[] = [];

  const rpc = vi.fn(async (name: string, args: { order_id: string; payment_id: string }) => {
    if (name !== 'grant_credits_for_payment') {
      return { data: null, error: { message: 'unknown function' } };
    }

    const row = payments.find((payment) => payment.razorpay_order_id === args.order_id);

    if (!row) {
      return { data: null, error: { code: 'P0002', message: 'unknown order' } };
    }

    if (row.status === 'paid') {
      return row.razorpay_payment_id === args.payment_id
        ? {
            data: { result: 'already_granted', credits: row.credits, balance: balances.get(row.user_id) },
            error: null,
          }
        : { data: null, error: { code: 'P0001', message: 'order already paid by another payment' } };
    }

    row.status = 'paid';
    row.razorpay_payment_id = args.payment_id;
    balances.set(row.user_id, (balances.get(row.user_id) ?? 0) + row.credits);
    ledger.push({ user_id: row.user_id, change: row.credits, reason: 'purchase' });

    return { data: { result: 'granted', credits: row.credits, balance: balances.get(row.user_id) }, error: null };
  });

  const client = {
    auth: {
      getUser: vi.fn(async (token: string) =>
        USERS[token]
          ? { data: { user: { id: USERS[token] } }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT' } },
      ),
    },
    from: vi.fn((table: string) => {
      expect(table).toBe('payments');

      return {
        insert: async (row: Omit<PaymentRow, 'razorpay_payment_id'>) => {
          payments.push({ ...row, razorpay_payment_id: null });
          return { error: null };
        },
        select: () => ({
          eq: (column: keyof PaymentRow, value: string) => ({
            maybeSingle: async () => ({ data: payments.find((row) => row[column] === value) ?? null, error: null }),
          }),
        }),
      };
    }),
    rpc,
  };

  const createSupabase = vi.fn(() => client);

  return { createSupabase, client, payments, balances, ledger, rpc };
}

let orderCounter = 0;

function fakeRazorpay(status = 200) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { amount: number; currency: string };

    return new Response(
      JSON.stringify({
        id: `order_Test${++orderCounter}`,
        amount: body.amount,
        currency: body.currency,
        status: 'created',
      }),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  });
}

/* ---------------------------------------------------------------- helpers */

let supabase: ReturnType<typeof fakeSupabase>;
let razorpay: ReturnType<typeof fakeRazorpay>;
let logs: string[];

function deps(env: Record<string, string> = ENV): PaymentsDeps {
  return {
    env,
    fetch: razorpay as unknown as typeof fetch,
    createSupabase: supabase.createSupabase as unknown as PaymentsDeps['createSupabase'],
  };
}

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/payments/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function json(response: Response): Promise<{ status: number } & Record<string, any>> {
  return { status: response.status, ...((await response.json()) as Record<string, unknown>) };
}

async function newOrder(token = 'token-A', packId = 'pack_50') {
  const response = await createOrder(request('create-order', { packId }, { Authorization: `Bearer ${token}` }), deps());
  return json(response);
}

async function checkout(orderId: string, paymentId: string, secret = SECRETS.RAZORPAY_KEY_SECRET) {
  return {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: await hmacSha256Hex(secret, `${orderId}|${paymentId}`),
  };
}

async function verify(body: unknown, token = 'token-A', env = ENV) {
  return json(await verifyPayment(request('verify', body, { Authorization: `Bearer ${token}` }), deps(env)));
}

async function webhook(event: unknown, secret = SECRETS.RAZORPAY_WEBHOOK_SECRET, env = ENV) {
  const raw = JSON.stringify(event);
  const signature = await hmacSha256Hex(secret, raw);

  return json(await handleWebhook(request('webhook', raw, { 'X-Razorpay-Signature': signature }), deps(env)));
}

const captured = (orderId: string, paymentId: string, amount = 10000) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency: 'INR', status: 'captured' } } },
});

beforeEach(() => {
  supabase = fakeSupabase();
  razorpay = fakeRazorpay();
  logs = [];

  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  }
});

afterEach(() => {
  // nothing secret is ever logged
  const allLogs = logs.join('\n');

  for (const secret of Object.values(SECRETS).filter((value) => value !== SECRETS.RAZORPAY_KEY_ID)) {
    expect(allLogs).not.toContain(secret);
  }

  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------- tests */

describe('create-order', () => {
  it('needs a valid login', async () => {
    expect(await newOrder('not-a-token')).toMatchObject({ status: 401, code: 'login_required' });
    expect(razorpay).not.toHaveBeenCalled();
  });

  it('rejects an unknown pack', async () => {
    expect(await newOrder('token-A', 'pack_free')).toMatchObject({ status: 400, code: 'bad_request' });
    expect(razorpay).not.toHaveBeenCalled();
  });

  it('creates a Razorpay order, saves a "created" row and returns the key id but never the secret', async () => {
    const response = await createOrder(
      request('create-order', { packId: 'pack_350' }, { Authorization: 'Bearer token-A' }),
      deps(),
    );

    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      orderId: 'order_Test' + orderCounter,
      amount: 200000,
      currency: 'INR',
      keyId: SECRETS.RAZORPAY_KEY_ID,
      credits: 350,
      packId: 'pack_350',
    });
    expect(text).not.toContain(SECRETS.RAZORPAY_KEY_SECRET);
    expect(text).not.toContain(SECRETS.SUPABASE_SECRET_KEY);

    const [url, init] = razorpay.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect(new Headers(init.headers).get('Authorization')).toBe(
      `Basic ${btoa(`${SECRETS.RAZORPAY_KEY_ID}:${SECRETS.RAZORPAY_KEY_SECRET}`)}`,
    );
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 200000, currency: 'INR' });

    expect(supabase.payments).toEqual([
      expect.objectContaining({ user_id: 'user-A', credits: 350, amount_paise: 200000, status: 'created' }),
    ]);
  });

  it('reports a Razorpay failure and saves nothing', async () => {
    razorpay = fakeRazorpay(401);
    expect(await newOrder()).toMatchObject({ status: 502, code: 'order_failed' });
    expect(supabase.payments).toEqual([]);
  });
});

describe('verify', () => {
  it('rejects a bad signature and adds no credits', async () => {
    const { orderId } = await newOrder();
    const body = await checkout(orderId as string, 'pay_One', 'some-other-secret');

    expect(await verify(body)).toMatchObject({ status: 400, code: 'bad_signature' });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.balances.get('user-A')).toBe(20);
  });

  it("rejects another user's order and adds no credits", async () => {
    const { orderId } = await newOrder('token-A');

    expect(await verify(await checkout(orderId as string, 'pay_One'), 'token-B')).toMatchObject({
      status: 403,
      code: 'wrong_user',
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.balances.get('user-B')).toBe(20);
  });

  it('needs a login', async () => {
    const { orderId } = await newOrder();
    expect(await verify(await checkout(orderId as string, 'pay_One'), 'nobody')).toMatchObject({
      status: 401,
      code: 'login_required',
    });
  });

  it('adds the credits once when verify runs twice', async () => {
    const { orderId } = await newOrder();
    const body = await checkout(orderId as string, 'pay_One');

    expect(await verify(body)).toMatchObject({ status: 200, result: 'granted', credits: 50, balance: 70 });
    expect(await verify(body)).toMatchObject({ status: 200, result: 'already_granted', balance: 70 });
    expect(supabase.ledger).toEqual([{ user_id: 'user-A', change: 50, reason: 'purchase' }]);
  });

  it('refuses a second, different payment for a paid order', async () => {
    const { orderId } = await newOrder();

    await verify(await checkout(orderId as string, 'pay_One'));
    expect(await verify(await checkout(orderId as string, 'pay_Two'))).toMatchObject({
      status: 409,
      code: 'already_paid',
    });
    expect(supabase.balances.get('user-A')).toBe(70);
  });
});

describe('webhook', () => {
  it('rejects a bad signature', async () => {
    const { orderId } = await newOrder();

    expect(await webhook(captured(orderId as string, 'pay_One'), 'wrong-secret')).toMatchObject({
      status: 400,
      code: 'bad_signature',
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('adds the credits on payment.captured', async () => {
    const { orderId } = await newOrder();

    expect(await webhook(captured(orderId as string, 'pay_One'))).toMatchObject({ status: 200, result: 'granted' });
    expect(supabase.balances.get('user-A')).toBe(70);
  });

  it.each(['webhook first', 'verify first'])('credits one payment once with webhook and verify (%s)', async (order) => {
    const { orderId } = await newOrder();
    const runWebhook = () => webhook(captured(orderId as string, 'pay_One'));
    const runVerify = async () => verify(await checkout(orderId as string, 'pay_One'));

    const results =
      order === 'webhook first' ? [await runWebhook(), await runVerify()] : [await runVerify(), await runWebhook()];

    expect(results.map((result) => result.result)).toEqual(['granted', 'already_granted']);
    expect(supabase.balances.get('user-A')).toBe(70);
    expect(supabase.ledger).toHaveLength(1);
  });

  it('ignores other events, unknown orders and wrong amounts without adding credits', async () => {
    const { orderId } = await newOrder();

    expect(await webhook({ event: 'payment.failed', payload: {} })).toMatchObject({ status: 200, ignored: 'event' });
    expect(await webhook(captured('order_NotOurs', 'pay_One'))).toMatchObject({
      status: 200,
      ignored: 'unknown_order',
    });
    expect(await webhook(captured(orderId as string, 'pay_One', 1))).toMatchObject({ status: 200, ignored: 'amount' });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('missing variables', () => {
  it.each(Object.keys(ENV))('returns 503 and changes nothing without %s', async (name) => {
    const env: Record<string, string> = { ...ENV };
    delete env[name];
    vi.stubEnv(name, '');

    const order = await createOrder(
      request('create-order', { packId: 'pack_50' }, { Authorization: 'Bearer token-A' }),
      deps(env),
    );

    const verified = await verifyPayment(
      request('verify', await checkout('order_Abc', 'pay_One'), { Authorization: 'Bearer token-A' }),
      deps(env),
    );
    const hooked = await handleWebhook(
      request('webhook', JSON.stringify(captured('order_Abc', 'pay_One')), {
        'X-Razorpay-Signature': await hmacSha256Hex(
          SECRETS.RAZORPAY_WEBHOOK_SECRET,
          JSON.stringify(captured('order_Abc', 'pay_One')),
        ),
      }),
      deps(env),
    );

    const statuses = [order.status, verified.status, hooked.status];

    const uses: Record<string, number[]> = {
      VITE_SUPABASE_URL: [0, 1, 2],
      SUPABASE_SECRET_KEY: [0, 1, 2],
      RAZORPAY_KEY_ID: [0],
      RAZORPAY_KEY_SECRET: [0, 1],
      RAZORPAY_WEBHOOK_SECRET: [2],
    };

    for (const index of uses[name]) {
      expect(statuses[index]).toBe(503);
    }

    // no response names a secret value, and no credits are ever added here
    for (const response of [order, verified, hooked]) {
      const text = await response.clone().text();

      for (const secret of Object.values(SECRETS)) {
        expect(secret === SECRETS.RAZORPAY_KEY_ID || !text.includes(secret)).toBe(true);
      }
    }

    expect(supabase.rpc).not.toHaveBeenCalled();

    // create-order needs this variable: no Razorpay order and no row
    if (uses[name].includes(0)) {
      expect(razorpay).not.toHaveBeenCalled();
      expect(supabase.payments).toEqual([]);
    }

    vi.unstubAllEnvs();
  });
});

describe('timingSafeEqual', () => {
  it('compares whole strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', 'a')).toBe(false);
  });
});
