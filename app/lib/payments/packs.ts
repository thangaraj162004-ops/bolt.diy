/**
 * Credit packs sold through Razorpay. PLACEHOLDER prices for test mode.
 *
 * Amounts are in paise (1 INR = 100 paise), the unit Razorpay uses. The server
 * takes the price and the credits from here, never from the browser.
 */

export interface CreditPack {
  id: string;
  credits: number;
  amountPaise: number;
  currency: 'INR';
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: 'pack_50', credits: 50, amountPaise: 100 * 100, currency: 'INR' },
  { id: 'pack_350', credits: 350, amountPaise: 2000 * 100, currency: 'INR' },
];

export function findCreditPack(id: unknown): CreditPack | undefined {
  return typeof id === 'string' ? CREDIT_PACKS.find((pack) => pack.id === id) : undefined;
}
