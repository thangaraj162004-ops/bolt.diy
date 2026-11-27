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
  description: { get: () => undefined, set: vi.fn() },
  duplicateChat: vi.fn(),
  updateChatDescription: vi.fn(),
  invalidateChatCache: vi.fn(),
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
      expect(close.className).toContain('mouse:hidden');
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

  it('shows the signed-in name and letter avatar on every layout, never "Guest User" or a picture (Task 11F)', () => {
    authState.set({ status: 'signed-in', email: 'priya@b.co', balance: 1 });

    try {
      renderMenu();

      expect(screen.getByTestId('sidebar-user-name').textContent).toBe('priya');

      const avatar = document.querySelector('.side-menu [data-testid="user-avatar"]')!;
      expect(avatar.textContent).toBe('P');
      expect(avatar.className).not.toMatch(/touch:hidden|mouse:hidden/);
      expect(document.querySelector('.side-menu img')).toBeNull();
      expect(document.querySelector('.side-menu')!.textContent).not.toContain('Guest');
    } finally {
      authState.set({ status: 'loading', balance: null });
    }
  });

  it('says "Guest" (with the person icon) only when signed out', () => {
    authState.set({ status: 'signed-out', balance: null });

    try {
      renderMenu();

      expect(screen.getByTestId('sidebar-user-name').textContent).toBe('Guest');
      expect(document.querySelector('.side-menu [data-testid="user-avatar"] .i-ph\\:user')).toBeTruthy();
    } finally {
      authState.set({ status: 'loading', balance: null });
    }
  });

  it('the close button is an X; in the touch layout the screen edge never opens the list (Task 11F)', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;

    try {
      renderMenu();

      const close = document.querySelector('.side-menu button[aria-label="Close menu"] span')!;
      expect(close.className).toContain('i-ph:x');

      // a real mouse at the left edge, but a touch screen: nothing opens
      pointerMove('mouse', 5);
      expect(sidebarOpen.get()).toBe(false);
    } finally {
      window.matchMedia = original;
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

  it('the "Projects" row at the bottom of the chat list opens the Projects page', async () => {
    const { projectsPageOpen } = await import('~/lib/stores/layout');
    renderMenu();
    act(() => sidebarOpen.set(true));

    const row = [...document.querySelectorAll<HTMLButtonElement>('.side-menu button')].find(
      (button) => button.textContent === 'Projects',
    )!;
    expect(row.className).toContain('mouse:hidden');
    expect(row.className).toContain('min-h-11');

    act(() => row.click());
    expect(sidebarOpen.get()).toBe(false);
    expect(projectsPageOpen.get()).toBe(true);
    expect(screen.getByTestId('projects-page')).toBeTruthy();

    act(() => screen.getByRole('button', { name: 'Back' }).click());
    expect(projectsPageOpen.get()).toBe(false);
  });
});
