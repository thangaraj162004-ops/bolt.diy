import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toggleEditMode = vi.fn();

// the real hook saves to IndexedDB and loads the workbench
vi.mock('~/lib/hooks', () => ({
  useEditChatDescription: () => ({
    editing: false,
    handleChange: vi.fn(),
    handleBlur: vi.fn(),
    handleSubmit: vi.fn(),
    handleKeyDown: vi.fn(),
    currentDescription: 'Recipe finder',
    toggleEditMode,
  }),
}));
vi.mock('~/lib/persistence', () => ({ db: undefined, prefetchChat: vi.fn() }));

const { HistoryItem } = await import('./HistoryItem');

afterEach(cleanup);

async function openActions() {
  const onDelete = vi.fn();
  const onDuplicate = vi.fn();
  const exportChat = vi.fn();

  render(
    <MemoryRouter>
      <HistoryItem
        item={{ id: 'c1', urlId: 'c1', description: 'Recipe finder', messages: [], timestamp: '' } as any}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        exportChat={exportChat}
      />
    </MemoryRouter>,
  );

  const trigger = screen.getByRole('button', { name: 'Actions for Recipe finder' });
  expect(trigger.className).toContain('mouse:hidden');
  expect(trigger.className).toContain('h-11 w-11');

  await act(async () => {
    fireEvent.keyDown(trigger, { key: 'Enter' });
  });

  return { onDelete, onDuplicate, exportChat };
}

describe('chat row on a phone (no hover)', () => {
  it('a "⋯" button shows Export, Duplicate, Rename and Delete, each 44 px high', async () => {
    await openActions();

    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Export', 'Duplicate', 'Rename', 'Delete']);
    items.forEach((item) => expect(item.className).toContain('min-h-11'));
  });

  it('Delete asks for the delete dialog', async () => {
    const { onDelete } = await openActions();

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('Rename starts renaming', async () => {
    toggleEditMode.mockClear();
    await openActions();

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    });
    expect(toggleEditMode).toHaveBeenCalledTimes(1);
  });

  it('shows "Saved online" and opens through onOpen (an online copy may be downloaded first)', () => {
    const onOpen = vi.fn();

    render(
      <MemoryRouter>
        <HistoryItem
          item={{ id: 'c1', urlId: 'c1', description: 'Recipe finder', messages: [], timestamp: '' } as any}
          exportChat={vi.fn()}
          savedOnline
          onOpen={onOpen}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'Saved online' })).toBeTruthy();

    fireEvent.click(screen.getByRole('link'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
