import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ buyPlan: vi.fn() }));

vi.mock('~/lib/payments/checkout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/payments/checkout')>()),
  buyPlan: mocks.buyPlan,
}));

const { BuyCreditsDialog } = await import('./BuyCreditsDialog');

afterEach(() => {
  cleanup();
  mocks.buyPlan.mockReset();
});

async function buyPro() {
  render(<BuyCreditsDialog open email="a@b.co" onClose={() => undefined} />);

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Get Pro' }));
  });
}

describe('BuyCreditsDialog', () => {
  it('shows "Credits added" and the test-mode label after a test-mode purchase', async () => {
    mocks.buyPlan.mockResolvedValue({
      kind: 'added',
      message: 'Credits added: 350 credits are now in your account. Your Pro plan is active until 26 Dec 2026.',
      credits: 350,
      keyId: 'rzp_test_publicKeyId',
    });

    await buyPro();

    expect(mocks.buyPlan).toHaveBeenCalledWith('pro', 'a@b.co', expect.any(Object));
    expect(screen.getByRole('status').textContent).toContain('Credits added');
    expect(screen.getByTestId('test-mode-label').textContent).toBe('Test mode: no real money.');
  });

  it('shows the plain-English message when the payment is cancelled', async () => {
    mocks.buyPlan.mockResolvedValue({
      kind: 'cancelled',
      message: 'Payment cancelled. No money was taken.',
      keyId: 'rzp_live_publicKeyId',
    });

    await buyPro();

    expect(screen.getByRole('alert').textContent).toBe('Payment cancelled. No money was taken.');
  });

  it('shows Pro, Ultra and Enterprise cards with dollar prices, credits, features and the 30-day note', () => {
    render(<BuyCreditsDialog open onClose={() => undefined} />);

    const pro = screen.getByTestId('plan-pro').textContent ?? '';
    const ultra = screen.getByTestId('plan-ultra').textContent ?? '';
    const enterprise = screen.getByTestId('plan-enterprise');

    expect(pro).toContain('$25 / month');
    expect(pro).toContain('350 credits');
    expect(pro).toContain('Connect your own Supabase');
    expect(ultra).toContain('$60 / month');
    expect(ultra).toContain('900 credits');
    expect(ultra).toContain('Everything in Pro');

    expect(enterprise.textContent).toContain('Contact us');
    expect(enterprise.querySelector('button')).toBeNull();

    expect(screen.getByTestId('buy-credits-dialog').textContent).toContain(
      'Pay once for 30 days. Auto-renew is coming later.',
    );
  });

  it('shows the current plan and when it ends', () => {
    render(
      <BuyCreditsDialog
        open
        onClose={() => undefined}
        currentPlan="ultra"
        currentPlanUntil="2026-12-26T10:00:00.000Z"
      />,
    );

    expect(screen.getByTestId('current-plan').textContent).toBe(
      'Your plan: Ultra, active until 26 Dec 2026. Buying again adds 30 days.',
    );
  });

  it('shows the message when dollar payments are not enabled', async () => {
    mocks.buyPlan.mockResolvedValue({
      kind: 'currency_not_enabled',
      message: 'Dollar payments are not enabled on this Razorpay account yet.',
    });

    await buyPro();

    expect(screen.getByRole('alert').textContent).toBe('Dollar payments are not enabled on this Razorpay account yet.');
  });
});
