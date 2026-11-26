import { useEffect, useState } from 'react';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { buyPlan, formatPlanDate, formatPrice, isTestKey, listPlans, type BuyResult } from '~/lib/payments/checkout';
import { CONTACT_US_LABEL, PLAN_NOTE, planName } from '~/lib/payments/packs';

interface BuyCreditsDialogProps {
  open: boolean;
  onClose: () => void;

  /** Prefilled in Razorpay Checkout. */
  email?: string;

  /** The user's active plan, if any. */
  currentPlan?: string;
  currentPlanUntil?: string;
}

/** The key id seen last (public). Remembered so the test-mode label shows on the next open too. */
let lastKeyId: string | undefined;

/** Plan cards (Pro, Ultra, Enterprise); a paid plan is bought with Razorpay Checkout. */
export function BuyCreditsDialog({ open, onClose, email, currentPlan, currentPlanUntil }: BuyCreditsDialogProps) {
  const [busyPlan, setBusyPlan] = useState<string>();
  const [result, setResult] = useState<BuyResult>();
  const [keyId, setKeyId] = useState(lastKeyId);

  // Razorpay Checkout opens on top of the page; this modal dialog would block it, so it hides meanwhile
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setResult(undefined);
    }
  }, [open]);

  const buy = async (planId: string) => {
    if (busyPlan) {
      return;
    }

    setBusyPlan(planId);
    setResult(undefined);

    const outcome = await buyPlan(planId, email, {
      onCheckoutOpen: () => setCheckoutOpen(true),
      onCheckoutClose: () => setCheckoutOpen(false),
    });

    if (outcome.keyId) {
      lastKeyId = outcome.keyId;
      setKeyId(outcome.keyId);
    }

    setBusyPlan(undefined);
    setResult(outcome);
  };

  const close = () => {
    // Checkout is a separate window on top; keep this dialog while a payment is running
    if (!busyPlan) {
      onClose();
    }
  };

  const activeName = planName(currentPlan);
  const activeUntil = formatPlanDate(currentPlanUntil);

  return (
    <DialogRoot open={open && !checkoutOpen} onOpenChange={(value) => !value && close()}>
      <Dialog className="w-[min(640px,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto" onClose={close}>
        <div className="flex flex-col gap-4 p-6" data-testid="buy-credits-dialog">
          <div>
            <DialogTitle>Choose a plan</DialogTitle>
            <DialogDescription>{PLAN_NOTE}</DialogDescription>
            {activeName && activeUntil && (
              <p className="mt-1 text-sm text-ca-elements-textSecondary" data-testid="current-plan">
                Your plan: {activeName}, active until {activeUntil}. Buying again adds 30 days.
              </p>
            )}
            {isTestKey(keyId) && (
              <span
                className="mt-2 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                data-testid="test-mode-label"
              >
                Test mode: no real money.
              </span>
            )}
          </div>

          <ul className="grid gap-3 sm:grid-cols-3">
            {listPlans().map((plan) => (
              <li
                key={plan.id}
                data-testid={`plan-${plan.id}`}
                className="flex flex-col gap-2 rounded-lg border border-ca-elements-borderColor p-4 text-ca-elements-textPrimary"
              >
                <h3 className="text-base font-semibold">{plan.name}</h3>
                <p>
                  {plan.amountCents === null ? (
                    <span className="text-lg font-semibold">{CONTACT_US_LABEL}</span>
                  ) : (
                    <>
                      <span className="text-lg font-semibold">{formatPrice(plan.amountCents)}</span>
                      <span className="text-sm text-ca-elements-textSecondary"> / month</span>
                    </>
                  )}
                </p>
                {plan.credits !== null && (
                  <p className="text-sm font-medium text-purple-600 dark:text-purple-300">{plan.credits} credits</p>
                )}
                <ul className="flex-1 list-disc pl-4 text-sm text-ca-elements-textSecondary">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                {plan.buyable ? (
                  <button
                    type="button"
                    disabled={Boolean(busyPlan)}
                    onClick={() => void buy(plan.id)}
                    className="rounded-lg bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:opacity-60"
                  >
                    {busyPlan === plan.id ? 'Please wait…' : `Get ${plan.name}`}
                  </button>
                ) : (
                  <p className="rounded-lg border border-ca-elements-borderColor px-3 py-2 text-center text-sm text-ca-elements-textSecondary">
                    {CONTACT_US_LABEL}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {result && (
            <p
              role={result.kind === 'added' ? 'status' : 'alert'}
              className={
                result.kind === 'added'
                  ? 'rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-400'
                  : 'rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500'
              }
            >
              {result.message}
            </p>
          )}

          <button
            type="button"
            disabled={Boolean(busyPlan)}
            className="rounded-lg border border-ca-elements-borderColor px-4 py-2 text-sm text-ca-elements-textPrimary disabled:opacity-60"
            onClick={close}
          >
            {result?.kind === 'added' ? 'Done' : 'Close'}
          </button>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
