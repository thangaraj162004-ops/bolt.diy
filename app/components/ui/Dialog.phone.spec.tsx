import * as RadixDialog from '@radix-ui/react-dialog';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog, Dialog, DialogButton, DialogTitle } from './Dialog';

describe('dialogs on a phone', () => {
  it('never wider or taller than the screen minus 16 px each side, and text wraps', () => {
    render(
      <RadixDialog.Root open>
        <Dialog className="w-[520px]">
          <DialogTitle>Delete Chat?</DialogTitle>
          <DialogButton type="secondary">Cancel</DialogButton>
          <DialogButton type="danger">Delete</DialogButton>
        </Dialog>
      </RadixDialog.Root>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('touch:max-w-[calc(100vw-32px)]');
    expect(dialog.className).toContain('touch:max-h-[calc(100dvh-32px)]');
    expect(dialog.className).toContain('touch:overflow-y-auto');
    expect(dialog.className).toContain('touch:break-words');

    // still centered; the desktop width is unchanged
    expect(dialog.className).toContain('left-1/2');
    expect(dialog.className).toContain('w-[520px]');

    for (const name of ['Cancel', 'Delete']) {
      expect(screen.getByRole('button', { name }).className).toContain('touch:min-h-11');
    }
  });

  it('the confirmation dialog buttons are at least 44 px high', () => {
    render(
      <ConfirmationDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Reset settings?"
        description="This cannot be undone."
      />,
    );

    for (const name of ['Cancel', 'Confirm']) {
      expect(screen.getByRole('button', { name }).className).toContain('touch:min-h-11');
    }
  });
});
