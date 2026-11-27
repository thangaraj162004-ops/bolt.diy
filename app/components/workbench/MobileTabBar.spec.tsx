import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('~/lib/stores/workbench', async () => {
  const { atom: createAtom } = await import('nanostores');
  const showWorkbench = createAtom(false);
  const currentView = createAtom('code');

  const workbenchStore = {
    showWorkbench,
    currentView,
    selectWorkbenchView: vi.fn((view: string) => currentView.set(view)),
  };
  store.value = workbenchStore;

  return { workbenchStore };
});

const { MobileTabBar, activeMobileTab } = await import('./MobileTabBar');

type FakeStore = {
  showWorkbench: ReturnType<typeof atom<boolean>>;
  currentView: ReturnType<typeof atom<string>>;
  selectWorkbenchView: ReturnType<typeof vi.fn>;
};

const workbench = () => store.value as FakeStore;

afterEach(() => {
  cleanup();
  workbench().showWorkbench.set(false);
  workbench().currentView.set('code');
});

const pressed = () =>
  screen
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent);

describe('MobileTabBar (phone)', () => {
  it('has Chat, Code and Preview, is hidden from 768 px up, and stays above the phone safe area', () => {
    render(<MobileTabBar />);

    const bar = screen.getByTestId('mobile-tab-bar');
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Chat', 'Code', 'Preview']);
    expect(bar.className).toContain('mouse:hidden');
    expect(bar.className).toContain('pb-[env(safe-area-inset-bottom)]');

    // 56 px tall buttons: bigger than the 44 px touch-target minimum
    screen.getAllByRole('button').forEach((button) => expect(button.className).toContain('h-14'));
  });

  it('switches between the chat and the workbench views', () => {
    render(<MobileTabBar />);
    expect(pressed()).toEqual(['Chat']);

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(workbench().showWorkbench.get()).toBe(true);
    expect(workbench().selectWorkbenchView).toHaveBeenCalledWith('preview', { userInitiated: true });
    expect(pressed()).toEqual(['Preview']);

    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(pressed()).toEqual(['Code']);

    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(workbench().showWorkbench.get()).toBe(false);
    expect(pressed()).toEqual(['Chat']);
  });

  it('follows the workbench when it opens by itself (for example when the preview starts)', () => {
    render(<MobileTabBar />);

    act(() => {
      workbench().showWorkbench.set(true);
      workbench().currentView.set('preview');
    });

    expect(pressed()).toEqual(['Preview']);
  });

  it('maps the workbench state to a tab', () => {
    expect(activeMobileTab(false, 'preview')).toBe('chat');
    expect(activeMobileTab(true, 'preview')).toBe('preview');
    expect(activeMobileTab(true, 'code')).toBe('code');
    expect(activeMobileTab(true, 'diff')).toBe('code');
  });
});
