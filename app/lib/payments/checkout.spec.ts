import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RazorpayOptions, RazorpaySuccess } from './checkout';

/*
 * The Razorpay Checkout script is a fake: when the app adds the <script> tag,
 * the fake "loads" it by defining window.Razorpay. Each test decides what the
 * user does in Checkout (pay, close, fail then close). The server routes are a
 * fake fetch.
 */

const mocks = vi.hoisted(() => ({
  token: 'user-token' as string | undefined,
  refreshCreditsBadge: vi.fn(async () => undefined),
}));

vi.mock('~/lib/supabase/credits', () => ({
  getAccessToken: async () => mocks.token,
  refreshCreditsBadge: mocks.refreshCreditsBadge,
}));

const { BUY_MESSAGES, RAZORPAY_CHECKOUT_URL, buyPack, formatRupees, isTestKey, resetRazorpayLoader } =
  await import('./checkout');

type UserAction = 'pay' | 'close' | 'fail-then-close';

let userAction: UserAction;
let scriptLoads: string[];
let scriptFails: boolean;
let opened: RazorpayOptions[];

const PAID: RazorpaySuccess = {
  razorpay_order_id: 'order_Test1',
  razorpay_payment_id: 'pay_Test1',
  razorpay_signature: 'a'.repeat(64),
};

class FakeRazorpay {
  #failed: Array<(response: { error?: { description?: string } }) => void> = [];

  constructor(readonly options: RazorpayOptions) {}

  on(_event: 'payment.failed', listener: (response: { error?: { description?: string } }) => void) {
    this.#failed.push(listener);
  }

  open() {
    opened.push(this.options);

    queueMicrotask(() => {
      if (userAction === 'pay') {
        this.options.handler(PAID);
      } else {
        if (userAction === 'fail-then-close') {
          this.#failed.forEach((listener) => listener({ error: { description: 'Card declined' } }));
        }

        this.options.modal?.ondismiss?.();
      }
    });
  }
}

/** The fake Checkout script: appending the tag "loads" it. */
function installFakeScript() {
  const append = document.head.appendChild.bind(document.head);

  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement) {
      scriptLoads.push(node.src);
      queueMicrotask(() => {
        if (scriptFails) {
          node.onerror?.(new Event('error'));
        } else {
          (window as unknown as { Razorpay: unknown }).Razorpay = FakeRazorpay;
          node.onload?.(new Event('load'));
        }
      });

      return node;
    }

    return append(node);
  });
}

type ServerAnswer = { status: number; body: unknown };

function fakeServer(answers: { createOrder?: ServerAnswer; verify?: ServerAnswer } = {}) {
  const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
    const answer =
      url === '/api/payments/create-order'
        ? (answers.createOrder ?? {
            status: 200,
            body: {
              orderId: 'order_Test1',
              amount: 10000,
              currency: 'INR',
              keyId: 'rzp_test_publicKeyId',
              credits: 50,
              packId: 'pack_50',
            },
          })
        : (answers.verify ?? { status: 200, body: { ok: true, result: 'granted', credits: 50, balance: 70 } });

    return new Response(JSON.stringify(answer.body), { status: answer.status });
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

beforeEach(() => {
  mocks.token = 'user-token';
  mocks.refreshCreditsBadge.mockClear();
  userAction = 'pay';
  scriptLoads = [];
  scriptFails = false;
  opened = [];
  delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  resetRazorpayLoader();
  installFakeScript();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('prices and labels', () => {
  it('shows rupees from paise', () => {
    expect(formatRupees(10000)).toBe('₹100');
    expect(formatRupees(200000)).toBe('₹2,000');
    expect(formatRupees(150)).toBe('₹1.5');
  });

  it('knows a test key', () => {
    expect(isTestKey('rzp_test_abc')).toBe(true);
    expect(isTestKey('rzp_live_abc')).toBe(false);
    expect(isTestKey(undefined)).toBe(false);
  });
});

describe('buyPack', () => {
  it('pays: create-order, Checkout with the server values and the email, verify, badge refresh', async () => {
    const fetchMock = fakeServer();
    const hooks = { onCheckoutOpen: vi.fn(), onCheckoutClose: vi.fn() };

    expect(scriptLoads).toEqual([]);

    const result = await buyPack('pack_50', 'a@b.co', hooks);

    expect(result).toEqual({
      kind: 'added',
      message: 'Credits added: 50 credits are now in your account.',
      credits: 50,
      keyId: 'rzp_test_publicKeyId',
    });

    // the Checkout script is loaded only when someone buys
    expect(scriptLoads).toEqual([RAZORPAY_CHECKOUT_URL]);

    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      key: 'rzp_test_publicKeyId',
      order_id: 'order_Test1',
      amount: 10000,
      currency: 'INR',
      prefill: { email: 'a@b.co' },
    });

    const [createUrl, createInit] = fetchMock.mock.calls[0];
    expect(createUrl).toBe('/api/payments/create-order');
    expect(new Headers(createInit.headers).get('Authorization')).toBe('Bearer user-token');
    expect(JSON.parse(String(createInit.body))).toEqual({ packId: 'pack_50' });

    const [verifyUrl, verifyInit] = fetchMock.mock.calls[1];
    expect(verifyUrl).toBe('/api/payments/verify');
    expect(new Headers(verifyInit.headers).get('Authorization')).toBe('Bearer user-token');
    expect(JSON.parse(String(verifyInit.body))).toEqual(PAID);

    expect(mocks.refreshCreditsBadge).toHaveBeenCalledTimes(1);
    expect(hooks.onCheckoutOpen).toHaveBeenCalledTimes(1);
    expect(hooks.onCheckoutClose).toHaveBeenCalledTimes(1);
  });

  it('loads the Checkout script only once', async () => {
    fakeServer();

    await buyPack('pack_50');
    await buyPack('pack_350');

    expect(scriptLoads).toEqual([RAZORPAY_CHECKOUT_URL]);
    expect(opened).toHaveLength(2);
  });

  it('says "cancelled" when the user closes Checkout, and does not verify', async () => {
    const fetchMock = fakeServer();
    userAction = 'close';

    expect(await buyPack('pack_50')).toMatchObject({ kind: 'cancelled', message: BUY_MESSAGES.cancelled });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.refreshCreditsBadge).not.toHaveBeenCalled();
  });

  it('says "failed" when a payment failed and the user then closed Checkout', async () => {
    fakeServer();
    userAction = 'fail-then-close';

    expect(await buyPack('pack_50')).toMatchObject({ kind: 'failed', message: BUY_MESSAGES.failed });
  });

  it('says credits will appear shortly when verify fails', async () => {
    fakeServer({ verify: { status: 500, body: { error: true, code: 'grant_failed' } } });

    const result = await buyPack('pack_50');

    expect(result.kind).toBe('verify_failed');
    expect(result.message).toContain('If money was taken, your credits will appear shortly');
  });

  it('asks to log in without a token, or when the server says so', async () => {
    const fetchMock = fakeServer({ createOrder: { status: 401, body: { code: 'login_required' } } });

    mocks.token = undefined;
    expect(await buyPack('pack_50')).toMatchObject({
      kind: 'login_required',
      message: 'Please log in to buy credits.',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    mocks.token = 'expired-token';
    expect(await buyPack('pack_50')).toMatchObject({ kind: 'login_required' });
    expect(scriptLoads).toEqual([]);
  });

  it('says buying is unavailable when the server is not set up or Checkout cannot load', async () => {
    fakeServer({ createOrder: { status: 503, body: { code: 'payments_unavailable' } } });
    expect(await buyPack('pack_50')).toMatchObject({ kind: 'unavailable', message: BUY_MESSAGES.unavailable });

    vi.unstubAllGlobals();
    fakeServer();
    scriptFails = true;
    expect(await buyPack('pack_50')).toMatchObject({ kind: 'unavailable' });
  });
});

describe('browser code', () => {
  it('contains no secret, only the public key id from the server', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('app/lib/payments/checkout.ts', 'utf-8');

    expect(source).not.toMatch(/RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|SUPABASE_SECRET_KEY|sb_secret_/);
  });
});
