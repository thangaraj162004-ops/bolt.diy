import { useEffect, useState } from 'react';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { buyPack, formatRupees, isTestKey, listPacks, type BuyResult } from '~/lib/payments/checkout';

interface BuyCreditsDialogProps {
  open: boolean;
  onClose: () => void;

  /** Prefilled in Razorpay Checkout. */
  email?: string;
}

/** The key id seen last (public). Remembered so the test-mode label shows on the next open too. */
let lastKeyId: string | undefined;

/** Lists the credit packs and buys one with Razorpay Checkout. */
export function BuyCreditsDialog({ open, onClose, email }: BuyCreditsDialogProps) {
  const [busyPack, setBusyPack] = useState<string>();
  const [result, setResult] = useState<BuyResult>();
  const [keyId, setKeyId] = useState(lastKeyId);

  // Razorpay Checkout opens on top of the page; this modal dialog would block it, so it hides meanwhile
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setResult(undefined);
    }
  }, [open]);

  const buy = async (packId: string) => {
    if (busyPack) {
      return;
    }

    setBusyPack(packId);
    setResult(undefined);

    const outcome = await buyPack(packId, email, {
      onCheckoutOpen: () => setCheckoutOpen(true),
      onCheckoutClose: () => setCheckoutOpen(false),
    });

    if (outcome.keyId) {
      lastKeyId = outcome.keyId;
      setKeyId(outcome.keyId);
    }

    setBusyPack(undefined);
    setResult(outcome);
  };

  const close = () => {
    // Checkout is a separate window on top; keep this dialog while a payment is running
    if (!busyPack) {
      onClose();
    }
  };

  return (
    <DialogRoot open={open && !checkoutOpen} onOpenChange={(value) => !value && close()}>
      <Dialog className="w-[min(420px,calc(100vw-2rem))]" onClose={close}>
        <div className="flex flex-col gap-4 p-6" data-testid="buy-credits-dialog">
          <div>
            <DialogTitle>Buy credits</DialogTitle>
            <DialogDescription>Each AI message uses 1 credit.</DialogDescription>
            {isTestKey(keyId) && (
              <span
                className="mt-2 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                data-testid="test-mode-label"
              >
                Test mode: no real money.
              </span>
            )}
          </div>

          <ul className="flex flex-col gap-2">
            {listPacks().map((pack) => (
              <li key={pack.id}>
                <button
                  type="button"
                  disabled={Boolean(busyPack)}
                  onClick={() => void buy(pack.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-ca-elements-borderColor px-4 py-3 text-left text-ca-elements-textPrimary hover:bg-ca-elements-background-depth-2 disabled:opacity-60"
                >
                  <span className="font-medium">{pack.credits} credits</span>
                  <span className="text-ca-elements-textSecondary">
                    {busyPack === pack.id ? 'Please wait…' : formatRupees(pack.amountPaise)}
                  </span>
                </button>
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
            disabled={Boolean(busyPack)}
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
