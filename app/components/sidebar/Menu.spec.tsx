import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// chat history lives in IndexedDB; the sidebar's open/close logic does not need it
vi.mock('~/lib/persistence', () => ({
  db: undefined,
  chatId: { get: () => undefined, subscribe: () => () => undefined },
  getAll: vi.fn(),
  deleteById: vi.fn(),
  useChatHistory: () => ({ duplicateCurrentChat: vi.fn(), exportChat: vi.fn() }),
}));

// the chat rows; not shown here (no saved chats) and they pull in the workbench
vi.mock('./HistoryItem', () => ({ HistoryItem: () => null }));

const { Menu } = await import('./Menu.client');
const { openSettings, sidebarOpen } = await import('~/lib/stores/layout');
const { authState } = await import('~/lib/supabase/auth');

function pointerMove(pointerType: string, x: number) {
  const event = new Event('pointermove') as Event & { pointerType: string; pageX: number; clientX: number };
  Object.assign(event, { pointerType, pageX: x, clientX: x });
  act(() => {
    window.dispatchEvent(event);
  });
}

beforeEach(() => sidebarOpen.set(false));
afterEach(cleanup);

function renderMenu() {
  return render(
    <MemoryRouter>
      <Menu />
    </MemoryRouter>,
  );
}

describe('sidebar on a phone', () => {
  it('its own menu icon closes it, every time', () => {
    renderMenu();

    for (let i = 0; i < 3; i++) {
      act(() => sidebarOpen.set(true));

      const close = document.querySelector<HTMLButtonElement>('.side-menu button[aria-label="Close menu"]')!;
      expect(close.className).toContain('md:hidden');
      expect(close.className).toContain('h-11 w-11');

      fireEvent.click(close);
      expect(sidebarOpen.get()).toBe(false);
    }
  });

  it('tapping the dark background closes it, every time', () => {
    renderMenu();
    expect(screen.queryByTestId('sidebar-backdrop')).toBeNull();

    for (let i = 0; i < 3; i++) {
      act(() => sidebarOpen.set(true));
      fireEvent.click(screen.getByTestId('sidebar-backdrop'));
      expect(sidebarOpen.get()).toBe(false);
      expect(screen.queryByTestId('sidebar-backdrop')).toBeNull();
    }
  });

  it('a tap near the left edge does not reopen it; a real mouse still does', () => {
    renderMenu();

    pointerMove('touch', 5);
    expect(sidebarOpen.get()).toBe(false);

    pointerMove('mouse', 5);
    expect(sidebarOpen.get()).toBe(true);
  });

  it('shows the letter avatar (not the guest picture) on a phone', () => {
    authState.set({ status: 'signed-in', email: 'priya@b.co', balance: 1 });

    try {
      renderMenu();

      const avatar = document.querySelector('.side-menu [data-testid="user-avatar"]')!;
      expect(avatar.textContent).toBe('P');
      expect(avatar.className).toContain('md:hidden');

      // the picture is kept for desktop only
      expect(document.querySelector('.side-menu img')!.parentElement!.className).toContain('max-md:hidden');
    } finally {
      authState.set({ status: 'loading', balance: null });
    }
  });

  it('opens Settings when the phone account menu asks', () => {
    renderMenu();
    act(() => sidebarOpen.set(true));

    act(() => openSettings());
    expect(sidebarOpen.get()).toBe(false);
  });

  it('tells the header while Settings is open', async () => {
    const { settingsPanelOpen } = await import('~/lib/stores/layout');
    renderMenu();
    expect(settingsPanelOpen.get()).toBe(false);

    act(() => openSettings());
    expect(settingsPanelOpen.get()).toBe(true);

    cleanup();
    expect(settingsPanelOpen.get()).toBe(false);
  });
});
