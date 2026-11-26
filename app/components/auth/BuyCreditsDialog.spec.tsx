import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ buyPack: vi.fn() }));

vi.mock('~/lib/payments/checkout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/payments/checkout')>()),
  buyPack: mocks.buyPack,
}));

const { BuyCreditsDialog } = await import('./BuyCreditsDialog');

afterEach(() => {
  cleanup();
  mocks.buyPack.mockReset();
});

async function buyFirstPack() {
  render(<BuyCreditsDialog open email="a@b.co" onClose={() => undefined} />);

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^50 credits/ }));
  });
}

describe('BuyCreditsDialog', () => {
  it('shows "Credits added" and the test-mode label after a test-mode purchase', async () => {
    mocks.buyPack.mockResolvedValue({
      kind: 'added',
      message: 'Credits added: 50 credits are now in your account.',
      credits: 50,
      keyId: 'rzp_test_publicKeyId',
    });

    await buyFirstPack();

    expect(mocks.buyPack).toHaveBeenCalledWith('pack_50', 'a@b.co', expect.any(Object));
    expect(screen.getByRole('status').textContent).toContain('Credits added');
    expect(screen.getByTestId('test-mode-label').textContent).toBe('Test mode: no real money.');
  });

  it('shows the plain-English message when the payment is cancelled', async () => {
    mocks.buyPack.mockResolvedValue({
      kind: 'cancelled',
      message: 'Payment cancelled. No money was taken.',
      keyId: 'rzp_live_publicKeyId',
    });

    await buyFirstPack();

    expect(screen.getByRole('alert').textContent).toBe('Payment cancelled. No money was taken.');
  });
});
