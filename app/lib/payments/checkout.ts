import { CREDIT_PACKS, type CreditPack } from './packs';
import { getAccessToken, refreshCreditsBadge } from '~/lib/supabase/credits';

/**
 * Browser side of buying credits with Razorpay Checkout (test mode first).
 *
 * 1. POST /api/payments/create-order (with the login token) -> order id, amount, key id
 * 2. load https://checkout.razorpay.com/v1/checkout.js (only now) and open Checkout
 * 3. on success POST /api/payments/verify -> the server checks the signature and adds the credits
 *
 * The browser only ever sees the public key id. No secret is used here.
 */

export const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/* ---------------------------------------------------------------- prices */

/** "₹100" or "₹2,000" (amounts are stored in paise). */
export function formatRupees(amountPaise: number): string {
  const rupees = amountPaise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: rupees % 1 === 0 ? 0 : 2 })}`;
}

export function listPacks(): readonly CreditPack[] {
  return CREDIT_PACKS;
}

/** True for Razorpay test keys: no real money moves. */
export function isTestKey(keyId: string | undefined): boolean {
  return Boolean(keyId?.startsWith('rzp_test_'));
}

/* ---------------------------------------------------------------- Razorpay Checkout script */

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { email?: string };
  handler: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}

export interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', listener: (response: { error?: { description?: string } }) => void) => void;
}

export type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

let loading: Promise<RazorpayConstructor> | undefined;

/** Loads Checkout once, the first time someone buys. */
export function loadRazorpay(): Promise<RazorpayConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;

  if (existing) {
    return Promise.resolve(existing);
  }

  loading ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_URL;
    script.async = true;

    script.onload = () => {
      const loaded = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;

      if (loaded) {
        resolve(loaded);
      } else {
        loading = undefined;
        reject(new Error('Razorpay Checkout did not load'));
      }
    };

    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error('Razorpay Checkout did not load'));
    };
    document.head.appendChild(script);
  });

  return loading;
}

/** For tests. */
export function resetRazorpayLoader() {
  loading = undefined;
}

/* ---------------------------------------------------------------- buying */

export type BuyResult =
  | { kind: 'added'; message: string; credits: number; keyId: string }
  | {
      kind: 'cancelled' | 'failed' | 'verify_failed' | 'login_required' | 'unavailable';
      message: string;
      keyId?: string;
    };

export const BUY_MESSAGES = {
  added: (credits: number) => `Credits added: ${credits} credits are now in your account.`,
  cancelled: 'Payment cancelled. No money was taken.',
  failed: 'The payment failed. No credits were added. Please try again or use another payment method.',
  verify_failed: 'We could not confirm your payment yet. If money was taken, your credits will appear shortly.',
  login_required: 'Please log in to buy credits.',
  unavailable: 'Buying credits is not available right now. Please try again later.',
} as const;

interface OrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  credits: number;
}

async function postJson(url: string, token: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

type CheckoutOutcome = { kind: 'success'; response: RazorpaySuccess } | { kind: 'cancelled' } | { kind: 'failed' };

/** Opens Checkout and waits until the user pays or closes it. */
function runCheckout(
  checkoutClass: RazorpayConstructor,
  order: OrderResponse,
  email?: string,
): Promise<CheckoutOutcome> {
  return new Promise((resolve) => {
    let failed = false;

    const checkout = new checkoutClass({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'CodeApp AI',
      description: `${order.credits} credits`,
      prefill: email ? { email } : undefined,
      handler: (response) => resolve({ kind: 'success', response }),
      modal: {
        // closed by the user: after a failed try it counts as failed, otherwise as cancelled
        ondismiss: () => resolve(failed ? { kind: 'failed' } : { kind: 'cancelled' }),
      },
    });

    // Checkout lets the user try again after a failure, so wait for success or close
    checkout.on('payment.failed', () => {
      failed = true;
    });

    checkout.open();
  });
}

export interface BuyHooks {
  /** Checkout is about to open (hide other modal dialogs so it can be used). */
  onCheckoutOpen?: () => void;

  /** Checkout closed (paid, cancelled or failed). */
  onCheckoutClose?: () => void;
}

/** Buys one pack: create-order, Checkout, verify. Never throws. */
export async function buyPack(packId: string, email?: string, hooks: BuyHooks = {}): Promise<BuyResult> {
  const token = await getAccessToken();

  if (!token) {
    return { kind: 'login_required', message: BUY_MESSAGES.login_required };
  }

  let order: OrderResponse;

  try {
    const response = await postJson('/api/payments/create-order', token, { packId });

    if (response.status === 401) {
      return { kind: 'login_required', message: BUY_MESSAGES.login_required };
    }

    if (!response.ok) {
      return { kind: 'unavailable', message: BUY_MESSAGES.unavailable };
    }

    order = (await response.json()) as OrderResponse;
  } catch {
    return { kind: 'unavailable', message: BUY_MESSAGES.unavailable };
  }

  let outcome: CheckoutOutcome;

  try {
    const checkoutClass = await loadRazorpay();

    hooks.onCheckoutOpen?.();
    outcome = await runCheckout(checkoutClass, order, email);
  } catch {
    return { kind: 'unavailable', message: BUY_MESSAGES.unavailable, keyId: order.keyId };
  } finally {
    hooks.onCheckoutClose?.();
  }

  if (outcome.kind !== 'success') {
    return { kind: outcome.kind, message: BUY_MESSAGES[outcome.kind], keyId: order.keyId };
  }

  try {
    const response = await postJson('/api/payments/verify', (await getAccessToken()) ?? token, {
      razorpay_order_id: outcome.response.razorpay_order_id,
      razorpay_payment_id: outcome.response.razorpay_payment_id,
      razorpay_signature: outcome.response.razorpay_signature,
    });

    if (!response.ok) {
      return { kind: 'verify_failed', message: BUY_MESSAGES.verify_failed, keyId: order.keyId };
    }

    const result = (await response.json()) as { credits?: number };
    const credits = typeof result.credits === 'number' ? result.credits : order.credits;

    await refreshCreditsBadge();

    return { kind: 'added', message: BUY_MESSAGES.added(credits), credits, keyId: order.keyId };
  } catch {
    return { kind: 'verify_failed', message: BUY_MESSAGES.verify_failed, keyId: order.keyId };
  }
}
