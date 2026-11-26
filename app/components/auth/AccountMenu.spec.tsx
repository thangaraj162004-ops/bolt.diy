import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountMenu } from './AccountMenu.client';
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

  it('"You are out of credits." has a Buy credits button that opens the packs', async () => {
    await renderMenu(fakeSupabase({ session: { user: { id: 'user-1', email: 'a@b.co' } }, balance: 0 }));

    act(() => outOfCreditsDialog.set(true));

    const dialog = await screen.findByTestId('out-of-credits-dialog');
    expect(dialog.textContent).toContain('You are out of credits.');
    expect(screen.queryByText('Buy credits (coming soon)')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Buy credits' }));

    expect(outOfCreditsDialog.get()).toBe(false);
    expect(buyCreditsDialog.get()).toBe(true);
    expect((await screen.findByTestId('buy-credits-dialog')).textContent).toContain('50 credits');
  });

  it('the header has Buy credits when logged in, listing every pack with its price in rupees', async () => {
    await renderMenu(fakeSupabase({ session: { user: { id: 'user-1', email: 'a@b.co' } }, balance: 3 }));

    fireEvent.click(screen.getByRole('button', { name: 'Buy credits' }));

    const dialog = await screen.findByTestId('buy-credits-dialog');
    const packs = [...dialog.querySelectorAll('li')].map((item) => item.textContent);

    expect(packs).toEqual(['50 credits₹100', '350 credits₹2,000']);

    // no key id seen yet, so no test-mode label
    expect(screen.queryByTestId('test-mode-label')).toBeNull();
  });

  it('shows no Buy credits button when logged out', async () => {
    await renderMenu(fakeSupabase());
    expect(screen.queryByRole('button', { name: 'Buy credits' })).toBeNull();
  });
});
