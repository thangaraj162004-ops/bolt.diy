/**
 * Plans sold through Razorpay. EDIT PLAN TEXT AND PRICES HERE: every name,
 * price, credit amount and feature shown to users comes from this file.
 *
 * Prices are in US cents (2500 = $25), the unit Razorpay uses for USD. The
 * server takes the price, the credits and the plan from here, never from the
 * browser. A purchase is paid once and lasts PLAN_DAYS days; auto-renew is not
 * built yet.
 */

/** The currency of every order (Razorpay needs international payments enabled for USD). */
export const PAYMENT_CURRENCY = 'USD' as const;

/** How long one plan purchase lasts. Buying again while active extends it. */
export const PLAN_DAYS = 30;

/** Shown under the plans. */
export const PLAN_NOTE = `Pay once for ${PLAN_DAYS} days. Auto-renew is coming later.`;

/** Plans that can be bought (stored in payments.plan and profiles.plan). */
export type PaidPlanId = 'pro' | 'ultra';

export type PlanId = PaidPlanId | 'enterprise';

export interface Plan {
  id: PlanId;
  name: string;

  /** Price in cents per PLAN_DAYS, or null for "Contact us". */
  amountCents: number | null;

  /** Credits added with each purchase, or null when there is no fixed amount. */
  credits: number | null;

  features: readonly string[];

  /** False for Enterprise: shown with "Contact us", never sent to Razorpay. */
  buyable: boolean;
}

/*
 * Project limits (5 and 20) are PLACEHOLDERS: nothing enforces them yet, and
 * they may change before launch.
 */
export const PLANS: readonly Plan[] = [
  {
    id: 'pro',
    name: 'Pro',
    amountCents: 25 * 100,
    credits: 350,
    features: [
      '350 credits per month',
      'Websites and simple web apps',
      'Live preview',
      'Chat edits',
      'Connect your own Supabase',
      '5 projects',
    ],
    buyable: true,
  },
  {
    id: 'ultra',
    name: 'Ultra',
    amountCents: 60 * 100,
    credits: 900,
    features: ['900 credits per month', 'Everything in Pro', '20 projects', 'Faster replies when busy'],
    buyable: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    amountCents: null,
    credits: null,
    features: ['Custom credits', 'Custom limits', 'Help with setup'],
    buyable: false,
  },
];

/** Shown instead of a price for plans that cannot be bought. */
export const CONTACT_US_LABEL = 'Contact us';

export interface BuyablePlan extends Plan {
  id: PaidPlanId;
  amountCents: number;
  credits: number;
  buyable: true;
}

/** A plan that can be bought, by id; undefined for Enterprise or anything else. */
export function findBuyablePlan(id: unknown): BuyablePlan | undefined {
  const plan = typeof id === 'string' ? PLANS.find((item) => item.id === id) : undefined;

  return plan?.buyable && plan.amountCents !== null && plan.credits !== null ? (plan as BuyablePlan) : undefined;
}

export function planName(id: string | null | undefined): string | undefined {
  return PLANS.find((plan) => plan.id === id)?.name;
}
