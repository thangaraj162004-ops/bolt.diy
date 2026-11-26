import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';

interface OutOfCreditsDialogProps {
  open: boolean;
  onClose: () => void;

  /** Opens the Buy credits dialog. */
  onBuy: () => void;
}

/** Shown when the server refuses a message because the balance is too low. */
export function OutOfCreditsDialog({ open, onClose, onBuy }: OutOfCreditsDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog className="w-[min(400px,calc(100vw-2rem))]" onClose={onClose}>
        <div className="flex flex-col gap-4 p-6" data-testid="out-of-credits-dialog">
          <div>
            <DialogTitle>You are out of credits.</DialogTitle>
            <DialogDescription>Your message was not sent. Buy credits to continue.</DialogDescription>
          </div>
          <button
            type="button"
            className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600"
            onClick={onBuy}
          >
            Buy credits
          </button>
          <button
            type="button"
            className="rounded-lg border border-ca-elements-borderColor px-4 py-2 text-sm text-ca-elements-textPrimary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
