import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountPopupMenu, AccountUserRow } from './AccountPopupMenu.client';
import { OPEN_SETTINGS_EVENT, projectsPageOpen } from '~/lib/stores/layout';
import { themeStore } from '~/lib/stores/theme';
import { authDialog, authState, buyCreditsDialog } from '~/lib/supabase/auth';
import { getThemeMode } from '~/types/theme';

const signOut = vi.fn(async () => ({ error: null }));
const client = { auth: { signOut } } as never;

afterEach(() => {
  cleanup();
  authState.set({ status: 'loading', balance: null });
  authDialog.set(null);
  buyCreditsDialog.set(false);
  projectsPageOpen.set(false);
});

async function openMenu() {
  await act(async () => {
    fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'Enter' });
  });

  return screen.findByTestId('account-popup');
}

function renderRow() {
  render(<AccountUserRow client={client} />);
}

const signedIn = () =>
  authState.set({
    status: 'signed-in',
    userId: 'u1',
    email: 'priya@example.com',
    balance: 1262,
    plan: 'pro',
    planUntil: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  });

describe('wide-touch account menu (Task 11G)', () => {
  it('the user row shows the letter avatar, name and email', () => {
    signedIn();
    renderRow();

    const row = screen.getByTestId('account-user-row');
    expect(row.textContent).toContain('priya');
    expect(row.textContent).toContain('priya@example.com');
    expect(within(row).getByTestId('user-avatar').textContent).toBe('P');
  });

  it('opens above the row: about 260 px wide, rows at least 44 px, in the asked order', async () => {
    signedIn();
    renderRow();

    const menu = await openMenu();
    expect(menu.className).toContain('w-[260px]');
    expect(menu.getAttribute('data-side')).toBe('top');

    const rows = [...menu.querySelectorAll('[data-row]')];
    expect(rows.map((row) => row.getAttribute('data-row'))).toEqual([
      'profile',
      'credits',
      'buy',
      'settings',
      'appearance',
      'projects',
      'signout',
    ]);
    rows.forEach((row) => expect(row.className).toContain('min-h-11'));
    expect(menu.textContent).toContain('priya@example.com');
    expect(menu.textContent).toContain('1262 credits');
    expect(menu.textContent).toContain('Pro plan until');
  });

  it('Appearance switches light and dark and keeps the menu open', async () => {
    signedIn();
    renderRow();
    themeStore.set('light');

    const menu = await openMenu();
    const appearance = menu.querySelector('[data-row="appearance"]')!;
    expect(
      within(appearance as HTMLElement)
        .getByRole('switch', { name: 'Dark mode' })
        .getAttribute('aria-checked'),
    ).toBe('false');

    await act(async () => {
      fireEvent.click(appearance);
    });

    expect(getThemeMode(themeStore.get())).toBe('dark');
    expect(screen.getByTestId('account-popup')).toBeTruthy();
  });

  it('Buy credits, Settings, Projects and Sign out do their job', async () => {
    signedIn();
    renderRow();

    const settings = vi.fn();
    document.addEventListener(OPEN_SETTINGS_EVENT, settings);

    try {
      for (const [row, check] of [
        ['buy', () => expect(buyCreditsDialog.get()).toBe(true)],
        ['settings', () => expect(settings).toHaveBeenCalledTimes(1)],
        ['projects', () => expect(projectsPageOpen.get()).toBe(true)],
        ['signout', () => expect(signOut).toHaveBeenCalled()],
      ] as const) {
        const menu = await openMenu();

        await act(async () => {
          fireEvent.click(menu.querySelector(`[data-row="${row}"]`)!);
        });
        check();
      }
    } finally {
      document.removeEventListener(OPEN_SETTINGS_EVENT, settings);
    }
  });

  it('guests see "Guest" and a Sign in button instead of name and email', async () => {
    authState.set({ status: 'signed-out', balance: null });
    renderRow();

    expect(screen.getByTestId('account-user-row').textContent).toContain('Guest');

    const menu = await openMenu();
    expect([...menu.querySelectorAll('[data-row]')].map((row) => row.getAttribute('data-row'))).toEqual([
      'profile',
      'settings',
      'appearance',
      'projects',
    ]);

    await act(async () => {
      fireEvent.click(within(menu).getByText('Sign in'));
    });
    expect(authDialog.get()).toEqual({});
  });

  it('can also hang below a header button', async () => {
    signedIn();
    render(
      <AccountPopupMenu side="bottom" align="end" client={client}>
        <button type="button" aria-label="Account menu">
          P
        </button>
      </AccountPopupMenu>,
    );

    expect((await openMenu()).getAttribute('data-side')).toBe('bottom');
  });
});
