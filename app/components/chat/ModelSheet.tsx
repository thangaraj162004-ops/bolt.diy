import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useBackToClose } from '~/lib/hooks/useBackToClose';

interface ModelSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/**
 * Phone only: a bottom sheet with the provider, the model, the API key and the
 * tool approval setting, so the chat box itself can stay small. It holds the
 * same controls as the desktop chat box, so everything still works there.
 */
export function ModelSheet({ open, onOpenChange, children }: ModelSheetProps) {
  // touch layout: Back closes the sheet first
  useBackToClose(open, () => onOpenChange(false));

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="mouse:hidden fixed inset-0 z-[9998] bg-black/40" />
        <RadixDialog.Content
          className="mouse:hidden fixed inset-x-0 bottom-0 z-[9999] max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-ca-elements-borderColor bg-ca-elements-background-depth-1 px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] text-ca-elements-textPrimary shadow-2xl focus:outline-none"
          data-testid="model-sheet"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ca-elements-borderColor" aria-hidden="true" />
          <div className="mb-2 flex items-center justify-between">
            <RadixDialog.Title className="text-base font-semibold">Model and API key</RadixDialog.Title>
            <RadixDialog.Close
              className="flex h-11 min-w-11 items-center justify-center rounded-lg bg-transparent px-3 text-sm font-medium text-accent-500"
              aria-label="Done"
            >
              Done
            </RadixDialog.Close>
          </div>
          <RadixDialog.Description className="sr-only">
            Choose the AI provider and model, and set its API key.
          </RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
