import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';

interface OutOfCreditsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Shown when spend_credits fails because the balance is too low. Buying is not built yet. */
export function OutOfCreditsDialog({ open, onClose }: OutOfCreditsDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog className="w-[min(400px,calc(100vw-2rem))]" onClose={onClose}>
        <div className="flex flex-col gap-4 p-6" data-testid="out-of-credits-dialog">
          <div>
            <DialogTitle>You are out of credits.</DialogTitle>
            <DialogDescription>Your message was not sent. You can buy more credits soon.</DialogDescription>
          </div>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white opacity-50"
          >
            Buy credits (coming soon)
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
