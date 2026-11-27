import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeOverlay, leaveOverlays, openOverlay, resetOverlayHistory } from './useBackToClose';

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

/** Waits until `check` is true (the helper stops Back's popstate, so tests cannot listen for it). */
async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) {
    await tick();
  }
}

describe('Back closes the open sheet first (Task 11F)', () => {
  let routerPops: number;

  const router = () => {
    routerPops++;
  };

  beforeEach(() => {
    resetOverlayHistory();
    routerPops = 0;

    // stands in for React Router's own (bubble-phase) popstate listener
    window.addEventListener('popstate', router);
    window.history.replaceState({ idx: 1, key: 'home' }, '');
  });

  afterEach(() => window.removeEventListener('popstate', router));

  it('opening adds one entry with the router state; Back closes it and the router never sees it', async () => {
    const close = vi.fn();
    const length = window.history.length;

    openOverlay(close);
    await tick();

    expect(window.history.length).toBe(length + 1);
    expect(window.history.state).toMatchObject({ idx: 1, key: 'home', __caOverlay: expect.any(Number) });

    window.history.back();
    await waitFor(() => close.mock.calls.length > 0);
    await tick();

    expect(close).toHaveBeenCalledTimes(1);
    expect(routerPops).toBe(0);
    expect(window.history.state).toEqual({ idx: 1, key: 'home' });
  });

  it('closing with its own button removes the entry quietly', async () => {
    const close = vi.fn();
    const id = openOverlay(close);
    await tick();

    closeOverlay(id);
    await tick();
    await tick();

    expect(close).not.toHaveBeenCalled();
    expect(routerPops).toBe(0);
    expect(window.history.state).toEqual({ idx: 1, key: 'home' });
  });

  it('closing one sheet and opening the next in the same tap keeps exactly one entry', async () => {
    const first = openOverlay(vi.fn());
    await tick();

    closeOverlay(first);

    const second = vi.fn();
    openOverlay(second);
    await tick();
    await tick();

    expect(window.history.state).toMatchObject({ key: 'home', __caOverlay: expect.any(Number) });

    window.history.back();
    await waitFor(() => second.mock.calls.length > 0);
    await tick();

    expect(second).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual({ idx: 1, key: 'home' });
  });

  it('leaving to another page first removes the overlay entries', async () => {
    openOverlay(vi.fn());
    openOverlay(vi.fn());
    await tick();

    await leaveOverlays();

    expect(window.history.state).toEqual({ idx: 1, key: 'home' });
    expect(routerPops).toBe(0);
  });
});
