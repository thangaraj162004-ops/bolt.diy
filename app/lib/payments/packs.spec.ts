import { describe, expect, it } from 'vitest';
import { PAYMENT_CURRENCY, PLAN_DAYS, PLANS, findBuyablePlan, planName } from './packs';

describe('plans', () => {
  it('sells in USD for 30 days', () => {
    expect(PAYMENT_CURRENCY).toBe('USD');
    expect(PLAN_DAYS).toBe(30);
  });

  it('has Pro ($25, 350 credits), Ultra ($60, 900 credits) and Enterprise (no price)', () => {
    expect(PLANS.map(({ id, amountCents, credits, buyable }) => ({ id, amountCents, credits, buyable }))).toEqual([
      { id: 'pro', amountCents: 2500, credits: 350, buyable: true },
      { id: 'ultra', amountCents: 6000, credits: 900, buyable: true },
      { id: 'enterprise', amountCents: null, credits: null, buyable: false },
    ]);
  });

  it('only Pro and Ultra can be bought', () => {
    expect(findBuyablePlan('pro')?.amountCents).toBe(2500);
    expect(findBuyablePlan('ultra')?.credits).toBe(900);
    expect(findBuyablePlan('enterprise')).toBeUndefined();
    expect(findBuyablePlan('pack_50')).toBeUndefined();
    expect(findBuyablePlan(undefined)).toBeUndefined();
  });

  it('names plans for the UI', () => {
    expect(planName('ultra')).toBe('Ultra');
    expect(planName(null)).toBeUndefined();
  });
});
