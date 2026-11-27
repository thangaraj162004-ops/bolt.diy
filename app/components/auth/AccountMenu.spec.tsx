import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './AccountMenu.client';
import { OPEN_SETTINGS_EVENT, projectsPageOpen, sidebarOpen } from '~/lib/stores/layout';
import { fakeSupabase, settle } from '~/lib/supabase/__fixtures__/fake-supabase';
import { authDialog, authState, buyCreditsDialog, outOfCreditsDialog } from '~/lib/supabase/auth';

afterEach(() => {
  cleanup();
  authState.set({ status: 'loading', balance: null });
  authDialog.set(null);
  outOfCreditsDialog.set(false);
  buyCreditsDialog.set(false);
});

async function renderMenu(client: Parameters<typeof AccountMenu>[0]['client']) {
  const view = render(<AccountMenu client={client} />);
  await act(settle);

  return view;
}

describe('AccountMenu', () => {
  it('shows nothing when Supabase is not configured', async () => {
    const { container } = await renderMenu(null);
    expect(container.innerHTML).toBe('');
  });

  it('logs in through the dialog, shows the credits, and logs out', async () => {
    await renderMenu(fakeSupabase({ balance: 20 }));

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    const dialog = await screen.findByTestId('auth-dialog');

    const [email, password] = [
      dialog.querySelector('input[type=email]')!,
      dialog.querySelector('input[type=password]')!,
    ];

    fireEvent.change(email, { target: { value: 'a@b.co' } });
    fireEvent.change(password, { target: { value: 'wrong-password' } });
    await act(async () => {
      fireEvent.submit(dialog);
      await settle();
    });
    expect(screen.getByRole('alert').textContent).toBe('Wrong email or password.');

    fireEvent.change(password, { target: { value: 'right-password' } });
    await act(async () => {
      fireEvent.submit(dialog);
      await settle();
    });

    expect(screen.getByTestId('credits-badge').textContent).toBe('20 credits');
    expect(screen.queryByTestId('auth-dialog')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
      await settle();
    });
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy();
    expect(screen.queryByTestId('credits-badge')).toBeNull();
  });

  it('switches to sign up and explains a short password', async () => {
    await renderMenu(fakeSupabase());

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create an account' }));

    const dialog = screen.getByTestId('auth-dialog');
    expect(dialog.textContent).toContain('Create your account');

    fireEvent.change(dialog.querySelector('input[type=email]')!, { target: { value: 'a@b.co' } });
    fireEvent.change(dialog.querySelector('input[type=password]')!, { target: { value: '123' } });
    await act(async () => {
      fireEvent.submit(dialog);
      await settle();
    });

    expect(screen.getByRole('alert').textContent).toBe('Password must be at least 6 characters.');
  });

  it('shows the balance right away after a refresh with a saved session', async () => {
    await renderMenu(fakeSupabase({ session: { user: { id: 'user-1', email: 'a@b.co' } }, balance: 1 }));

    expect(screen.getByTestId('credits-badge').textContent).toBe('1 credit');
  });

  it('opens the log in dialog with a hint when a message needs it', async () => {
    await renderMenu(fakeSupabase());

    act(() => authDialog.set({ hint: 'Log in to send your message.' }));

    expect((await screen.findByTestId('auth-dialog')).textContent).toContain('Log in to send your message.');
  });

  it('"You are out of credits." has a Buy credits button that opens the plans', async () => {
    await renderMenu(fakeSupabase({ session: { user: { id: 'user-1', email: 'a@b.co' } }, balance: 0 }));

    act(() => outOfCreditsDialog.set(true));

    const dialog = await screen.findByTestId('out-of-credits-dialog');
    expect(dialog.textContent).toContain('You are out of credits.');
    expect(screen.queryByText('Buy credits (coming soon)')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Buy credits' }));

    expect(outOfCreditsDialog.get()).toBe(false);
    expect(buyCreditsDialog.get()).toBe(true);
    expect((await screen.findByTestId('buy-credits-dialog')).textContent).toContain('Choose a plan');
  });

  it('the header has Buy credits when logged in, opening the plan cards', async () => {
    await renderMenu(fakeSupabase({ session: { user: { id: 'user-1', email: 'a@b.co' } }, balance: 3 }));

    fireEvent.click(screen.getByRole('button', { name: 'Buy credits' }));

    const dialog = await screen.findByTestId('buy-credits-dialog');
    expect(dialog.querySelectorAll('[data-testid^="plan-"]')).toHaveLength(3);
    expect(screen.queryByTestId('plan-badge')).toBeNull();

    // no key id seen yet, so no test-mode label
    expect(screen.queryByTestId('test-mode-label')).toBeNull();
  });

  it('shows no Buy credits button when logged out', async () => {
    await renderMenu(fakeSupabase());
    expect(screen.queryByRole('button', { name: 'Buy credits' })).toBeNull();
  });

  it('shows the active plan in the account menu', async () => {
    await renderMenu(
      fakeSupabase({
        session: { user: { id: 'user-1', email: 'a@b.co' } },
        balance: 350,
        profile: { plan: 'pro', plan_until: new Date(Date.now() + 5 * 86_400_000).toISOString() },
      }),
    );

    expect(screen.getByTestId('plan-badge').textContent).toBe('Pro');
  });

  it('shows no plan once it has ended', async () => {
    await renderMenu(
      fakeSupabase({
        session: { user: { id: 'user-1', email: 'a@b.co' } },
        profile: { plan: 'pro', plan_until: new Date(Date.now() - 86_400_000).toISOString() },
      }),
    );

    expect(screen.getByTestId('credits-badge')).toBeTruthy();
    expect(screen.queryByTestId('plan-badge')).toBeNull();
  });

  it('phone: one-line credits chip and a 40 px letter avatar that opens the account sheet', async () => {
    await renderMenu(
      fakeSupabase({
        session: { user: { id: 'user-1', email: 'priya@b.co' } },
        balance: 1262,
        profile: { plan: 'pro', plan_until: new Date(Date.now() + 5 * 86_400_000).toISOString() },
      }),
    );

    // desktop controls are hidden below 768 px; the phone ones from 768 px up
    expect(screen.getByTestId('credits-badge').className).toContain('max-md:hidden');

    const chip = screen.getByTestId('credits-chip');
    expect(chip.className).toContain('md:hidden');
    expect(chip.className).toContain('whitespace-nowrap');
    expect(chip.textContent).toBe('1262');
    expect(chip.getAttribute('aria-label')).toBe('1262 credits');

    const trigger = screen.getByRole('button', { name: 'Account menu' });
    expect(trigger.className).toContain('h-11 w-11');
    expect(trigger.className).toContain('mr-1.5'); // 4 + 6 + 2 = 12 px from the screen edge
    expect(trigger.className).toContain('bg-transparent');

    const avatar = trigger.querySelector('[data-testid="user-avatar"]')!;
    expect(avatar.textContent).toBe('P');
    expect(avatar.className).toContain('h-10 w-10');
    expect(avatar.className).not.toMatch(/bg-white/);

    await act(async () => {
      fireEvent.click(trigger);
    });

    const sheet = await screen.findByTestId('account-sheet');
    const rows = [...sheet.querySelectorAll('[data-row]')];
    expect(rows.map((row) => row.getAttribute('data-row'))).toEqual([
      'profile',
      'credits',
      'buy',
      'settings',
      'history',
      'projects',
      'signout',
    ]);
    rows.forEach((row) => expect(row.className).toContain('min-h-[52px]'));
    expect(sheet.textContent).toContain('priya');
    expect(sheet.textContent).toContain('priya@b.co');
    expect(sheet.textContent).toContain('1262 credits');
    expect(sheet.textContent).toContain('Pro plan until');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Buy credits' }));
    });
    expect(buyCreditsDialog.get()).toBe(true);
    expect(screen.queryByTestId('account-sheet')).toBeNull();
  });

  it('phone: Settings, Chat history and Projects rows open them', async () => {
    await renderMenu(fakeSupabase({ session: { user: { id: 'user-1', email: 'a@b.co' } }, balance: 3 }));

    const onSettings = vi.fn();
    document.addEventListener(OPEN_SETTINGS_EVENT, onSettings);

    try {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
      });
      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
      });
      expect(onSettings).toHaveBeenCalledTimes(1);

      sidebarOpen.set(false);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
      });
      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Chat history' }));
      });
      expect(sidebarOpen.get()).toBe(true);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
      });
      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Projects' }));
      });
      expect(projectsPageOpen.get()).toBe(true);
    } finally {
      projectsPageOpen.set(false);
      document.removeEventListener(OPEN_SETTINGS_EVENT, onSettings);
      sidebarOpen.set(false);
    }
  });

  it('phone: a guest gets a person icon and a sheet with "Guest" and Sign in', async () => {
    await renderMenu(fakeSupabase());

    // the desktop "Log in" button stays, hidden on a phone
    expect(screen.getByRole('button', { name: 'Log in' }).className).toContain('max-md:hidden');

    const trigger = screen.getByRole('button', { name: 'Account menu' });
    expect(trigger.querySelector('[data-testid="user-avatar"] .i-ph\\:user')).toBeTruthy();

    await act(async () => {
      fireEvent.click(trigger);
    });

    const sheet = await screen.findByTestId('account-sheet');
    expect([...sheet.querySelectorAll('[data-row]')].map((row) => row.getAttribute('data-row'))).toEqual([
      'profile',
      'settings',
      'history',
      'projects',
    ]);
    expect(sheet.textContent).toContain('Guest');
    expect(sheet.querySelector('img')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    });
    expect(authDialog.get()).toEqual({});
  });
});
